# longstone-ui — Component contracts

Data and state contracts each view consumes, with the TypeScript type names
the implementation actually exports. A design agent can read this without
running the app; an implementer can check that a name still exists in `src/`.

**Source of truth.** `src/state/derive.ts`, `src/verify/verify.ts`,
`src/settings/store.ts`, `src/errors.ts`, `src/gateway/client.ts`.

---

## 1. Chain index and memory state

### `ChainIndex` (`src/state/derive.ts`)

```ts
interface ChainIndex {
  byHash: Map<`0x${string}`, MemoryState>;
  byOwner: Map<`0x${string}`, MemoryState[]>;
  signers: SignerRecord[];
  latestBlock: bigint;
}
```

Built by `deriveIndex(records, latestBlock, signers)` from decoded
`MemoryCommitted` / `MemoryRetracted` / `SignerUpdated` logs. Derivation is
deterministic and replay-ordered by `(blockNumber, logIndex)`.

### `MemoryState` (`src/state/derive.ts`)

```ts
interface MemoryState {
  commitmentHash: `0x${string}`;
  commitment: Commitment | undefined;
  owner: `0x${string}`;
  contentHash: `0x${string}` | undefined;
  tags: string[];
  deep: boolean;      // MemoryCommitted seen
  active: boolean;    // deep && not retracted
  retractedAt: bigint | null;
  replacedBy: `0x${string}` | null;
  committedAt: bigint;
  txHash: `0x${string}`;
}
```

**Invariants the UI may rely on.**
- `deep` is always `true` for states obtained from `byHash` (only committed
  events create entries).
- `active === (retractedAt === null && replacedBy === null)` is **not**
  guaranteed: `replacedBy` can point at a successor without the memory being
  retracted in some future flows; treat `active` as authoritative and
  `replacedBy` as a version link.
- A retraction for an unseen commitment is ignored (cannot happen on-chain).

### Helpers

| Helper | Contract |
|---|---|
| `statesForOwner(index, owner)` | states in commit order |
| `predecessorOf(index, state)` | `undefined` when `prev` is zero or unknown |
| `successorOf(index, state)` | `undefined` when `replacedBy` is null or unknown |
| `filterByTags(states, tags)` | empty tag list = identity; multiple tags = **OR** |
| `signersForOwner(index, owner)` | latest role mask per signer, last event wins |

### `SignerState` (`src/state/derive.ts`)

```ts
interface SignerState {
  signer: `0x${string}`;
  roles: bigint;         // bit 0 = commit (1), bit 1 = retract (2)
  updatedAt: bigint;     // block number of the last SignerUpdated
  txHash: `0x${string}`;
}
```

`rolesOf(owner, signer)` on-chain is the fresh read; the list above is the
event-replay view. Both must agree in steady state.

---

## 2. Settings

```ts
interface Settings {
  rpcUrl: string;
  registryAddress: `0x${string}` | '';
  ipfsGateway: string;
  hisaishiUrl: string;       // '' = direct mode (no gateway)
  scanChunkSize: number;     // clamped 1_000 … 50_000
  scanStartBlock: string;    // decimal digits only
}
```

- Persisted under `longstone-ui.settings.v1` in `localStorage`.
- Corrupt or unavailable storage falls back to defaults; the app must still
  render.
- `validateUrl`: `https:` everywhere; `http:` only for `localhost`,
  `127.0.0.1`, `[::1]`. Returns `{ok:true,value}` or `{ok:false,error}`.
- `validateAddress`: `0x` + 40 hex; optional empty where allowed.

**CTA states.** Save is disabled while any field has an unsaved invalid
value; field errors are inline and typed, never thrown.

---

## 3. Verification result

```ts
type VerifyVerdict =
  | 'verified'          // anchored + active + both digests match
  | 'content-mismatch'  // bytes do not hash to the commitment
  | 'not-anchored'      // unknown commitment, or CID-only input
  | 'retracted'         // content matches, memory inactive
  | 'error';            // fetch/RPC failure, typed message

interface VerifyResult {
  mode: 'commitment' | 'cid';
  commitmentHash: `0x${string}` | null;
  cid: string | null;
  bytesLength: number;
  computedContentHash: `0x${string}` | null;
  computedCidDigest: `0x${string}` | null;
  expectedContentHash: `0x${string}` | null;
  expectedCidDigest: `0x${string}` | null;
  keccakMatches: boolean | null;
  sha256Matches: boolean | null;
  anchored: boolean;
  active: boolean;
  verdict: VerifyVerdict;
  message?: string;
}
```

**Rules.**
- By commitment hash: unknown hash → `not-anchored` without any gateway call.
- By CID alone: always `not-anchored` (or `content-mismatch` when the bytes
  do not even match the CID). It never fabricates an on-chain verdict.
- Non-raw CIDv1 (wrong multicodec/multihash) → `error` before fetching.
- Digest booleans are `null` when not computed — render as `—`, not `false`.

---

## 4. Staging list

```ts
interface StagedMemory {
  id: string;
  status: 'staged' | 'batched' | 'anchored';
  // plus gateway-supplied metadata rendered as text; unknown fields are ignored
}
```

Fetched from `{hisaishiUrl}/v1/memories?owner=<address>&limit=100`, expecting
`{ memories: StagedMemory[] }`.

**States.**
| Condition | Contract |
|---|---|
| `hisaishiUrl === ''` | explanatory empty state (not an error) |
| HTTP non-2xx | `HISAISHI_UNREACHABLE` typed message + retry |
| empty array | "Nothing staged" |
| rows | read-only table with status chips |

---

## 5. Error surface

```ts
type UiErrorCode =
  | 'WALLET_NOT_CONNECTED' | 'WRONG_NETWORK' | 'USER_REJECTED'
  | 'RPC_RATE_LIMITED' | 'RPC_UNAVAILABLE' | 'HISAISHI_UNREACHABLE'
  | 'GATEWAY_UPSTREAM' | 'UNKNOWN_COMMITMENT' | 'NOT_AUTHORIZED'
  | 'INVALID_HASH' | 'REGISTRY_NOT_CONFIGURED' | 'UNKNOWN_ERROR';
```

- Every view maps fetch/wallet errors through `toUiError` → one short human
  sentence per code. **No raw exception strings, no revert blobs.**
- `USER_REJECTED` is not an error state visually — it is a normal cancel.
- Errors never replace the whole page; they render in place with a retry.

---

## 6. Cross-view state matrix

Every view must define these five treatments:

| State | Timeline | Verify | Detail | ACL | Retract | Settings | Staging |
|---|---|---|---|---|---|---|---|
| wallet not connected | line | n/a (public) | n/a | line | line | works | works |
| loading | scan progress | verifying | loading | roles read | index | n/a | fetching |
| empty | no memories | empty input | unknown hash | no signers | no active | n/a | nothing staged |
| error | scan failed + retry | verdict `error` | unknown hash | typed error | typed error | field errors | unreachable |
| wrong network | switch prompt | switch prompt | switch prompt | switch prompt | switch prompt | switch prompt | switch prompt |

---

## 7. Accessibility acceptance (per component)

- Keyboard: every action reachable; no focus traps outside dialogs.
- Focus: visible ring on all interactive elements in both themes.
- Announcements: verdict results, tx confirmations, and scan completion use
  `role="status"` / `aria-live="polite"`.
- Text alternatives: badges and role chips are text, not icons alone.
- Contrast: ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI boundaries.
- Targets: ≥ 24×24 CSS px (WCAG 2.2 AA minimum).

---

## 8. Component ↔ file map

| Component | File | Stable DOM contract |
|---|---|---|
| App shell + nav | `src/App.tsx` | nav links, footer |
| WalletBar | `src/wallet/WalletBar.tsx` | `wallet-bar`, `connect`, `wallet-address`, `switch-network`, `disconnect` |
| TimelineView | `src/ui/TimelineView.tsx` | `timeline`, `tag-filter`, `timeline-row` |
| DetailView | `src/ui/DetailView.tsx` | `detail` |
| VerifyView | `src/ui/VerifyView.tsx` | `verify`, `verify-input`, `verify-run`, `verify-verdict`, `keccak-match`, `sha256-match` |
| AclView | `src/ui/AclView.tsx` | `acl`, `acl-signer`, `acl-role-commit`, `acl-role-retract`, `acl-grant`, `acl-revoke`, `acl-current-roles`, `acl-list`, `acl-notice` |
| RetractView | `src/ui/RetractView.tsx` | `retract`, `retract-select`, `retract-replacedby`, `retract-run`, `retract-notice` |
| SettingsView | `src/ui/SettingsView.tsx` | `settings-rpc`, `settings-registry`, `settings-save` |
| StagingView | `src/ui/StagingView.tsx` | `staging`, `staging-table`, `staging-row` |
| AboutView | `src/ui/AboutView.tsx` | `about`, `about-registry-paste`, `about-registry-apply` |

`data-testid` values are part of the test contract — a visual redesign keeps
them; a rename updates `test/e2e/*.spec.ts` in the same change.

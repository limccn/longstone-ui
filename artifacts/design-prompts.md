# longstone-ui — Design prompt kit

One paste-ready prompt per view, for Figma MCP / Lovable / v0-class tools.
Each block is self-contained: purpose, user story, data contract, states,
web3 conventions, accessibility, anti-goals. Visual direction is yours; the
data, states, and copy constraints are not.

**Product in one sentence.** longstone-ui is a static, server-less browser
for MemoryOverEth: it reads an immutable on-chain memory registry, verifies
content bytes in-browser, and lets an owner manage delegated agent signers.
Everything is read-mostly; the only writes are wallet-signed transactions.

**Reading order for the design agent:** this file → `component-contracts.md`
(types and states) → `content-model.md` (vocabulary and formats) →
`security-notes.md` (constraints you must not design away).

---

## Global rules (apply to every view)

- **Tone**: plain, factual, quiet. No growth-marketing language, no
  "AI-powered", no token or yield imagery.
- **Truthfulness**: a verdict is never softened. `not-anchored`,
  `content-mismatch`, and `retracted` are first-class states with their own
  visual treatment — not generic errors.
- **Dark and light parity**: both themes are required; every state must stay
  legible (WCAG 2.2 AA, contrast ≥ 4.5:1 for text).
- **Address/hash display**: middle-ellipsis (`0x1234…abcd`) with the full
  value available on hover/focus and copy-on-click. Never truncate without a
  way to see the whole value.
- **Transactions**: any wallet-signing action shows a three-phase state:
  reviewing → awaiting wallet → confirming on-chain → confirmed (with a
  Blockscout link). Never a spinner without a phase label.
- **No social login, no email login, no account creation.** The wallet is
  the only identity. Do not draw profile avatars, usernames, or sign-up CTAs.
- **No server.** Do not design sync indicators, cloud icons, "saved to
  account", or anything implying a backend.
- **Anti-goals (global)**: no dashboards with invented metrics, no charts of
  memory count over time, no mascots, no gradients-as-decoration, no
  glassmorphism, no dark-pattern confirmation dialogs.

---

## 1. Wallet button + states (AppKit owns the modal)

**Purpose.** Connect, display the connected address, switch to Base Sepolia,
disconnect.

**User story.** "I open the app and want to see which wallet is acting before
I trust anything I read."

**Data contract.**
- `useAccount()` → `{ address, isConnected, chainId }` (wagmi).
- `CHAIN_ID = 84532` (Base Sepolia).
- AppKit modal handles the connect flow when `VITE_REOWN_PROJECT_ID` is set;
  otherwise an injected-only fallback is used.

**States.**
| State | What the user sees |
|---|---|
| disconnected | `Connect wallet` button, neutral |
| connecting | disabled button, "Connecting…" |
| connected | `0x1234…abcd` + disconnect affordance |
| wrong network | amber warning + `Switch to Base Sepolia` button |
| no injected provider | explanatory text: install a wallet, no dead button |

**A11y.** Address is a real button/control with an accessible name containing
the full address (`title` alone is not enough). Chain changes announced via
`aria-live="polite"`.

**Anti-goals.** Do not redesign the AppKit modal itself. Do not add a
"create account" path. Do not show a balance.

---

## 2. Timeline (home)

**Purpose.** The owner's anchored memories, newest state visible, with
version-chain context.

**User story.** "Show me what I have anchored, what is still active, and what
was superseded."

**Data contract.** `statesForOwner(index, address)` → `MemoryState[]`
(`component-contracts.md` §1). Each row: commitment hash (link to detail),
content hash, tags, deep/active badges, block number. Tag chips come from the
union of the owner's tags; **chips are OR-selected** (selecting two shows
memories matching either).

**States.**
| State | Treatment |
|---|---|
| wallet not connected | single explanatory line, no empty table |
| scanning | progress line ("Scanning blocks 12,340–14,002…"), table skeleton |
| empty (scanned, no memories) | quiet empty state + hint that commits appear after anchoring |
| rows | table; retracted rows stay visible as tombstones |
| scan error | typed message + Retry; never a raw `0x…` revert blob |
| rate-limited | "RPC rate limiting — retrying" instead of a hard failure |

**Badge semantics (must be visually distinct).**
- `deep` — the commitment event is on-chain (permanent). Neutral-positive.
- `active` — deep **and** not retracted. Primary-positive.
- `retracted` — tombstone. Muted, still readable; never red-as-error (it is a
  legitimate historical state, not a failure).

**A11y.** Table has a caption. Filter chips are toggle buttons with
`aria-pressed`. Badge text is real text, not icon-only.

**Anti-goals.** No infinite-scroll timeline of society-wide memories (this is
the owner's own index). No engagement metrics. Do not hide retracted rows by
default.

---

## 3. Verify (public)

**Purpose.** Prove that bytes on a gateway match an on-chain commitment,
in-browser.

**User story.** "Someone sent me a commitment hash (or a CID). Is this content
actually anchored, and is it unchanged?"

**Data contract.** `VerifyResult` (`component-contracts.md` §3). Two input
modes: commitment hash (`0x` + 64 hex) and CID (raw CIDv1). The result shows
both digest comparisons: `keccak256(bytes) == contentHash` and
`sha256(bytes) == cidDigest`.

**States.**
| Verdict | Meaning | Visual intent |
|---|---|---|
| `verified` | anchored, active, both digests match | confident positive |
| `content-mismatch` | bytes do not hash to the commitment | clear negative |
| `not-anchored` | no such commitment, **or** only a CID was supplied | neutral-informative, not an error |
| `retracted` | content matches but the memory was withdrawn | muted, factual |
| `error` | gateway/RPC failure with a typed message | retryable |

**Critical copy.** CID-only verification must state: *"a CID alone is not an
on-chain commitment"* — the UI must never imply an on-chain verdict from a
CID alone.

**A11y.** Verdict is a heading with `role="status"` announced; boolean
digest rows are text (`true`/`false`), not color-only.

**Anti-goals.** No "trust score", no percentage confidence, no green checkmark
for `not-anchored`.

---

## 4. Commitment detail

**Purpose.** Full record for one commitment, including version links.

**User story.** "What exactly is this memory, and what came before/after it?"

**Data contract.** `MemoryState` + `predecessorOf` / `successorOf`.
Fields: commitment hash, owner, content hash (keccak), cidDigest (sha256),
raw CID, signer, advisory block height, tags, deep/active, committed-at block,
transaction (Blockscout link), predecessor (`prev`), successor (`replacedBy`).

**States.** Unknown hash → "Unknown commitment on this registry" + back link.
Chain root shows `none (chain root)` for predecessor; no successor shows
`none`.

**A11y.** Definition list markup (`dl/dt/dd`) or an equivalent labelled table.

**Anti-goals.** No editable fields. Do not imply retraction deletes anything.

---

## 5. Access control (ACL)

**Purpose.** Grant/revoke agent signer roles for the connected owner.

**User story.** "I want an agent key to commit on my behalf, and I want to be
able to take that away."

**Data contract.** `signersForOwner(index, address)` → `SignerState[]`
(latest role mask per signer, last event wins). Roles are a bitmask:
`1 = commit`, `2 = retract`. The current roles for the address being edited
come from a fresh `rolesOf(owner, signer)` read.

**States.** no signers → "your wallet is the only writer"; grant → notice
with tx hash; revoke → notice; invalid address → inline field error;
`NotAuthorized` → typed message.

**Copy requirement (wallet-drain safety).** Grant/revoke dialogs state in
plain language what changes: *"This lets 0x1234…abcd write memories on your
behalf."* / *"This removes 0x1234…abcd's write access. Memories it already
anchored stay verifiable."*

**A11y.** Role chips carry text, not just color. Confirmation dialogs trap
focus and restore it on close.

**Anti-goals.** No org/team management, no invitations, no email. No
"permissions matrix" grid in M1.

---

## 6. Retract

**Purpose.** Withdraw a commitment (tombstone), optionally linking a
successor.

**User story.** "That memory is superseded. Mark it inactive without erasing
history."

**Data contract.** Active states for the owner; optional `replacedBy` (32-byte
commitment hash, validated).

**States.** no active memories → hint; invalid `replacedBy` → inline error;
success → notice + tx link; **second retract of the same commitment is a
silent no-op** and must be described that way, not as an error.

**Critical copy.** "Retraction is a tombstone, never an in-place edit: events
and bytes remain historically verifiable."

**Anti-goals.** No "delete forever" language. No red danger styling that
implies destruction — this is a state transition.

---

## 7. Settings

**Purpose.** Point the app at an RPC, a registry, a gateway; control
scanning.

**User story.** "I want to use my own RPC or a different registry."

**Data contract.** `Settings` (`component-contracts.md` §2). Validation:
URLs must be `https://` (plain `http://` only for loopback); registry address
must be `0x` + 40 hex.

**States.** field errors inline, typed; save/reset; cache rescan action; a
hint that the hisaishi gateway URL is optional and that leaving it blank is a
supported mode (direct chain + IPFS).

**A11y.** Labels are real `<label>` elements. Errors are associated via
`aria-describedby`.

**Anti-goals.** No "advanced mode" toggle hiding security-relevant fields. Do
not present the gateway key as a secret.

---

## 8. Staging

**Purpose.** Read-only view of memories staged in a hisaishi gateway before
they are batched/anchored.

**User story.** "What is queued to be written on-chain?"

**Data contract.** `StagedMemory[]` (`component-contracts.md` §4), fetched
from `{hisaishiUrl}/v1/memories?owner=…&limit=100`. Status chips:
`staged` → `batched` → `anchored`.

**States.** **No gateway configured** (blank URL) is an explanatory empty
state, not an error: explain that the browser can only reach a remote gateway
form and that direct chain + IPFS verification still works without it.
Gateway unreachable → typed `HISAISHI_UNREACHABLE` with the same reassurance.

**Anti-goals.** No staging edit/delete actions (the browser is not the agent).
No upload button.

---

## Handoff notes

- Deliver **tokens + components**, not page-specific one-offs. The
  implementation keeps each view's DOM contract (`data-testid`) stable;
  classes and structure may change freely.
- Every view needs: loading, empty, error, wrong-network, and
  wallet-not-connected treatments.
- Exports go in `design/` (gitignored); `artifacts/` stays markdown-only.

# longstone-ui — Content model

Vocabulary, formats, and state machines the UI renders. This is the
"what the words mean" document; `component-contracts.md` is "what the data
is."

---

## 1. Two axes, one product

MemoryOverEth separates two independent axes. The UI must never conflate them.

**Depth axis (where it lives).**
- **Deep** — anchored on-chain as a menhir commitment. Immutable, long-lived,
  verifiable. The Timeline and Verify views are about deep memories.
- **Shallow** — staged off-chain in hisaishi (a gateway). Rebuildable,
  mutable, never anchored. The Staging view is about shallow memories.

A memory's depth has an objective test: **does it have a commitment?** An
off-chain copy that reached a cache still has no commitment and is therefore
shallow. The UI does not need a tag for depth; `deep` comes from the event
log.

**Type axis (what kind of memory).** Expressed purely as tag conventions:

| Tag | Meaning | Typical deep example |
|---|---|---|
| `layer:episodic` | an event that happened | "agreement signed on date X" |
| `layer:semantic` | a surviving fact | a core fact after contradiction resolution |
| `layer:procedural` | a workflow/authorization | an audited user-authorized workflow |

Any tag is a UTF-8 string of at most 32 bytes, stored on-chain as
`bytes32` (right-zero-padded — see `tagToBytes32` / `bytes32ToTag` in
`@limccn/menhir-core`). Tags are free-form; the `layer:*` namespace is convention,
not enforcement. Display tags verbatim; do not invent categories the chain
does not have.

**Do not** use "deep" and "semantic" interchangeably anywhere in copy.

---

## 2. Status and state machines

### 2.1 On-chain commitment lifecycle

```
        commit                      retract (optional replacedBy)
  ─────────────────► deep+active ──────────────────────────► deep+retracted
                          │                                     ▲
                          │                                     │
                          └──── commit successor (prev = hash) ─┘
                                (the successor is its own active commitment)
```

- **deep** = a `MemoryCommitted` event exists. Permanent.
- **active** = deep and no `MemoryRetracted` event. Not permanent.
- **retracted** = deep but inactive. The tombstone stays visible.
- `prev` links a commitment to its predecessor (version chain).
- `replacedBy` points from a retracted commitment to its successor.
- Retracting twice is a **silent no-op** — an idempotent operation, not an
  error, not a warning.

**Terminology.** "Retract", never "delete" or "remove". "Tombstone" is the
correct metaphor; use it sparingly in user copy (it appears in one hint).

### 2.2 Staging lifecycle (hisaishi, off-chain)

```
staged ──► batched ──► anchored
```

- `staged` — recorded by the agent, not yet sent.
- `batched` — included in a commit batch, awaiting inclusion.
- `anchored` — has become a deep commitment (the staging row is now
  historical).

Status chips must use these words exactly; they are the gateway's vocabulary.

### 2.3 Delegation lifecycle (ACL)

Roles are a bitmask: `1 = commit`, `2 = retract`. Display as
`commit`, `retract`, `commit + retract`, or `none`.
- Grant → new mask > 0.
- Revoke → mask `0` (no roles).
- Revocation stops **future** writes only. Already-anchored memories stay
  verifiable — state this in the revoke confirmation.

---

## 3. Identifiers and formatting

| Value | Format | Display rule |
|---|---|---|
| Address (`0x` + 40 hex) | EIP-55 checksum | full when it is the subject; middle-ellipsis in dense tables |
| Commitment hash (`0x` + 64 hex) | lowercase hex | middle-ellipsis in tables, full on detail/verify |
| Content hash (keccak256) | `0x` + 64 hex | same as commitment hash |
| cidDigest (sha256) | `0x` + 64 hex | same |
| CID | raw CIDv1 (`b…` base32) | full; monospace; selectable |
| Block number | decimal integer | no thousands separators in dense tables; separators OK in prose |
| Transaction | `0x` + 64 hex | always links to Blockscout (Base Sepolia) |

**Middle-ellipsis**: `0x1234abcd…9f8e7d6c` — keep the `0x` prefix, show 8 hex
chars after it and the last 8. The full value must always be reachable
(hover/focus/copy). Never truncate a value with no way to reveal it.

**Copy behavior.** Hash/address values are copy-on-click in detail contexts
and plain selectable text in tables. Show a brief "copied" confirmation via
`aria-live`.

**Numbers.** Block numbers and byte counts are `bigint` → render as decimal
strings. Never coerce to JS `number` for display (precision).

**Dates.** The chain does not store timestamps in commitments; the UI shows
**block heights**, not dates. If a block timestamp is ever added, format with
the user's locale (`Intl.DateTimeFormat`) and label the timezone.

---

## 4. Verdict language

| Verdict | Canonical user-facing phrasing | Must not say |
|---|---|---|
| `verified` | "Verified: the bytes hash to this on-chain commitment, and the memory is active." | "trusted", "safe", "100%" |
| `content-mismatch` | "The fetched bytes do not match this commitment." | "tampered by attacker" (we cannot know why) |
| `not-anchored` | "No on-chain commitment matches this input." / for CID-only: "a CID alone is not an on-chain commitment." | "invalid", "failed" |
| `retracted` | "The content matches, but this memory was retracted on-chain." | "deleted", "unavailable" |
| `error` | the typed error sentence (RPC/gateway), plus a retry | raw exception text |

**Digest rows** are `true` / `false` / `—`. They are the evidence; the verdict
is the summary. Never hide the digest rows behind a collapsed panel by
default.

---

## 5. Copy conventions

- Plain, declarative, present tense.
- Second person for actions ("Connect a wallet to continue"), third person or
  passive for chain facts ("This memory was retracted").
- No exclamation marks. No emoji in product copy (icons are fine in visual
  design, but not as the only carrier of meaning).
- Error copy always says **what happened** and **what to do next**, in one or
  two sentences.
- Wallet actions name the actor and the effect: "This lets 0x… write memories
  on your behalf."
- Number and hash values inline in prose use monospace.

---

## 6. Empty and edge states

| Situation | Copy intent |
|---|---|
| No wallet | "Connect a wallet to see your anchored memories." |
| Wallet connected, no memories | "No commitments found for this address." + a hint that memories appear after anchoring |
| Registry unset | "Set the registry contract address in Settings first." |
| Gateway unset (staging) | Explain the browser reaches a remote gateway only; direct chain + IPFS still works |
| Unknown commitment | "Unknown commitment on this registry." + back link |
| Chain root | predecessor shows "none (chain root)" |
| No successor | successor shows "none" |

---

## 7. What the UI does not model (M1)

- Gas estimates, fees, or balances — out of scope; do not display.
- Token amounts or economics — there is no token.
- Account profiles, avatars, social identity — the wallet is the identity.
- Server-side sessions, sync, or "your account" — there is no server.
- Block timestamps as dates — see §3.

These are anti-scope: designing for them now creates UI the product cannot
honestly back with data.

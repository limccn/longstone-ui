# longstone-ui — Security notes (decision record)

Constraints that the UI must not design away, plus the recorded decisions
behind the shipped headers. This file pre-writes the M2 design agent's
security constraints as required by the task design (§9.4).

---

## 1. Threat model (in scope for M1)

| Threat | Mitigation in this UI |
|---|---|
| Fake "verified" verdict | Both digests checked in-browser; CID-only input never yields an on-chain verdict |
| Malicious gateway bytes | Bytes are hashed locally; a mismatch is a first-class verdict |
| Wrong chain / RPC | Fixed chain id 84532; wrong-network guard; RPC URL validated |
| Secret leakage in bundle | `VITE_*` allowlist + bundle audit gate (`scripts/audit-bundle.mjs`) |
| Wallet-drain via confusing consent | Plain-language confirmations for `setSigner` / `retract`; no blind signing |
| XSS via hosted content | Never render memory bytes as HTML; text only |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Supply-chain | Pinned versions, CI tests, `pnpm audit` in CI; assembled-workspace L-6 exception documented in `longstone/docs/supply-chain.md` |

**Out of scope for this web app** (documented so design does not imply
otherwise): key custody inside these pages, multi-user accounts, server-side
auth, fiat on-ramp, transaction simulation beyond the wallet's own preview.

**Scope change 2026-10-23 — companion extension.** The Chrome/Edge side-panel
extension (`longstone-ext` v0.2) is a separate surface that *does* hold
encrypted key material locally. This web app still holds none, and neither
surface signs: the extension stores an Argon2id + AES-256-GCM vault in
`chrome.storage.local`, decrypts only in memory after an explicit unlock, and
locks on hide/idle. The extension's own threat model, crypto parameters and
residual risks are recorded in `longstone-ext/README.md` and
`longstone-ext/store/PRIVACY.md`; the bullet below applies to this app.

---

## 2. CSP decision record

Design §5 left two options; the decision is recorded here.

### Options considered

**(a) Strict `connect-src` allowlist** (`'self'` + `https://sepolia.base.org`
+ wallet relay hosts). Strongest containment. Problem: the app lets users
point at their own RPC, gateway, and hisaishi URL; under a strict list those
choices silently fail in the browser. Fixing that requires a redeploy per new
host or a server-side proxy — both contradict "static, no server".

**(b) Relaxed `connect-src` scheme allowlist** — `'self'` + `https:` + `wss:`
+ loopback http for local development. Custom RPC/gateway choices work
immediately; the address bar origin remains the trust anchor.

### Decision: (b), with documented consequences

- Chosen because the product's core promise is "bring your own RPC and
  gateway" in a server-less app. Option (a) would break the Settings view's
  reason to exist.
- `connect-src https:` does **not** allow exfiltration of secrets because
  there are no secrets in the bundle — the only `VITE_*` values are a public
  Reown project id and user-visible endpoints. Wallet keys never enter the
  page; signing happens in the wallet.
- Loopback `http://localhost:*` / `http://127.0.0.1:*` is included so
  `vite preview` and a local Hardhat/sovereign node work unchanged.
- **M2 revisit**: when hisaishi gains a hosted default, tighten
  `connect-src` to that default plus explicit user-added hosts managed in a
  manifest. Revisit if browser support lands for `connect-src` in an
  import-map-like manifest.

### Shipped policy (both platforms, parity-tested)

```
default-src 'self';
script-src 'self' https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

**`style-src 'unsafe-inline'`** is required: the AppKit modal injects inline
styles. Scripts are **not** granted `unsafe-inline` or `unsafe-eval`.

**Parity**: `vercel.json` and `public/_headers` must carry the same values;
`test/deploy-parity.test.ts` diffs both against
`test/deploy-parity.golden.json`. Edit all three together.

---

## 3. Header set

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see §2 | XSS / exfil containment |
| `X-Content-Type-Options` | `nosniff` | MIME confusion |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | no path/query leakage to gateways |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | no unused capabilities |
| `X-Frame-Options` | `DENY` | legacy clickjacking defense |
| `Cache-Control` (assets) | `public, max-age=31536000, immutable` | hashed asset filenames |

`frame-ancestors 'none'` in the CSP is the modern control; `X-Frame-Options`
is kept for older browsers. Both are intentional, not redundancy by accident.

---

## 4. Bundle and env rules

- Only these variables may reach the browser: `VITE_REOWN_PROJECT_ID`,
  `VITE_RPC_URL`, `VITE_REGISTRY_ADDRESS`, `VITE_IPFS_GATEWAY`,
  `VITE_HISAISHI_URL`. All are public endpoints or public identifiers.
- `scripts/audit-bundle.mjs` fails CI on: an unlisted `import.meta.env.VITE_*`,
  `process.env` in browser code, deployer/private-key/mnemonic material, and
  any top-level `404.html` in `dist/`.
- Nothing in **this web app** ever reads or writes a private key. All signing
  happens in the wallet; the app receives only signatures and addresses. The
  companion extension (`longstone-ext` v0.2) may hold an *encrypted* vault and
  decrypt it in memory after an explicit unlock — it still never signs.
- Settings live in `localStorage` (endpoints only, no credentials). Corrupt
  storage falls back to defaults instead of throwing.

> Note on the workspace's e2e setup: the local chain uses unlocked Hardhat
> accounts and a browser-side EIP-1193 shim. No private key is written to a
> file or passed on a command line, by design.

---

## 5. Wallet-drain safety copy (binding for design)

Any change to signer roles or lifecycle state must show, before signing:

1. **Who** is affected (full address, not only a shortened form).
2. **What** changes ("write access granted/removed", "memory becomes
   inactive").
3. **What does not change** ("already-anchored memories stay verifiable").

No single-click destructive action. No pre-checked "grant all roles". The
confirmation is a normal dialog, not a pattern that disguises the action.

---

## 6. M2 key-unlock constraints (pre-written for the design agent)

> **Status 2026-10-23:** the companion extension (`longstone-ext` v0.2)
> implements these constraints for its local vault (Argon2id m=64 MiB t=3 p=1,
> AES-256-GCM, domain-separated HKDF, reveal auto-hide, lock on hide/idle,
> export behind password re-verification). This web app still holds no key.
> The extension's residual risks (no server-side rate limit, JS cannot zero
> memory, clipboard history) are recorded in the task archive and
> `longstone-ext/store/PRIVACY.md`.

If this web app introduces local key management (encrypted keystore / passkey), the
design must satisfy:

- **No key material in the DOM, logs, `localStorage`, or `IndexedDB` in
  plaintext.** Unlock happens in memory; ciphertext at rest only.
- Passphrase entry is a dedicated, non-recoverable form: no "remember me",
  no third-party autofill, `autocomplete="off"` on the passphrase field.
- Explicit lock affordance and idle auto-lock; locked state never shows
  partial key material.
- Recovery/export flows require a second confirmation and are not one-click.
- The UI must state plainly that browser-held keys are a different trust
  model from hardware wallets.

These constraints are recorded now so the visual track does not design a
flow that the security model forbids.

---

## 7. Residual risks (accepted, M1)

- A malicious RPC can lie about chain state. Verification against a
  commitment is a claim about *that RPC's view*; the on-chain contract is the
  arbiter, but the browser trusts its endpoint. Multi-RPC cross-checking is an
  M2+ consideration.
- A malicious gateway can serve bytes that hash to a commitment only by
  finding a second preimage — accepted as computationally infeasible for
  sha2-256/keccak-256.
- `https:` in `connect-src` means a compromised dependency could beacon
  outward. Mitigated by the pinned dependency set and bundle audit; the
  assembled workspace has no committed lockfile (L-6 exception); not eliminated.

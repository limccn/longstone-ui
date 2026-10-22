# longstone-ui

Static, server-less browser for **MemoryOverEth**: read an immutable on-chain
memory registry (menhir), verify content bytes in the browser, and manage
delegated agent signers with wallet-signed transactions.

Built for Base Sepolia (chain id 84532); works against any EVM chain where a
`MemoryRegistry` is deployed.

## What it does

- **Timeline** — your anchored memories with `deep` / `active` badges and
  retracted tombstones, plus tag filtering.
- **Verify** — paste a commitment hash: the app derives the CID from the
  on-chain `cidDigest`, fetches the bytes, and checks both
  `keccak256(bytes) == contentHash` and `sha256(bytes) == cidDigest`.
- **Commitment detail** — full record with predecessor/successor links.
- **Access control** — grant/revoke agent signer roles (wallet-signed).
- **Retract** — tombstone a commitment, optionally linking a successor.
- **Settings** — RPC, registry, IPFS gateway, optional memory gateway.
- **Staging** — read-only list from a remote hisaishi gateway (optional).

## Honest-by-design

- A CID alone is **never** presented as an on-chain verification.
- A retract is a tombstone, not a deletion; retracting twice is a silent
  no-op.
- Every error is typed and human-readable; no raw revert strings.

## Quick start

```bash
corepack pnpm install
corepack pnpm --dir longstone-ui/packages/longstone-surface build
corepack pnpm --dir longstone-ui dev
```

The app imports `@limccn/longstone-surface` through its `dist` build, so the
package must be built after a fresh install (CI does this before the app build).

Environment (all optional; also editable in Settings):

| Variable | Purpose |
|---|---|
| `VITE_RPC_URL` | default RPC (default `https://sepolia.base.org`) |
| `VITE_REGISTRY_ADDRESS` | `MemoryRegistry` address |
| `VITE_IPFS_GATEWAY` | IPFS gateway base URL |
| `VITE_HISAISHI_URL` | remote gateway base URL; enables the Staging view and digest-based verify |
| `VITE_REOWN_PROJECT_ID` | enables the AppKit modal; unset → injected-only |

No private key is ever read by this app. All signing happens in the wallet.

## Scripts

```bash
corepack pnpm --dir longstone-ui/packages/longstone-surface build
corepack pnpm --dir longstone-ui/packages/longstone-surface test
corepack pnpm --dir longstone-ui typecheck
corepack pnpm --dir longstone-ui test          # vitest (unit + deploy parity)
corepack pnpm --dir longstone-ui build
corepack pnpm --dir longstone-ui audit         # bundle/env gate
node longstone-ui/scripts/e2e.mjs              # local chain + fixture + Playwright
```

### Live E2E

`test/e2e/live.spec.ts` runs against the deployed site and is skipped unless
`LIVE_E2E=1`:

```bash
LIVE_E2E=1 LIVE_BASE_URL=https://longstone-ui.pages.dev \
  corepack pnpm --dir longstone-ui exec playwright test test/e2e/live.spec.ts
```

It asserts that the deployed bundle carries the real registry / IPFS / hisaishi
URLs (a deploy that forgets a build variable fails here), that the timeline
scans Base Sepolia, that Staging reads the Worker cross-origin, and that Verify
fetches pinned bytes through the gateway digest route with both digests
matching. The injected wallet is read-only — no key exists in the browser or
the repo. Override `LIVE_OWNER`, `LIVE_SCAN_START`, or the endpoint variables
when pointing it at another deployment.

`scripts/e2e.mjs` starts a local Hardhat node with `--chain-id 84532`,
deploys and seeds a registry using the node's unlocked accounts, builds the
app, and runs the Playwright journey suite. **No private key is read,
written, or passed on any command line.**

## Deploy

Both targets ship identical security headers (enforced by
`test/deploy-parity.test.ts` against `test/deploy-parity.golden.json`):

- **Vercel** — `vercel.json` (SPA rewrite + headers).
- **Cloudflare Pages** — `public/_headers` + `public/_redirects`. The build
  must not contain a top-level `404.html`.

CI: `.github/workflows/deploy.yml` runs typecheck → tests → build → audit,
then deploys previews on PRs and production on `main`/tags. The build reads
`VITE_REGISTRY_ADDRESS`, `VITE_HISAISHI_URL`, and `VITE_IPFS_GATEWAY` from
repository variables; missing values produce an unconfigured bundle, which the
live E2E rejects.

## Design track

`artifacts/` holds the design-agent kit: per-view prompts
(`design-prompts.md`), data/state contracts (`component-contracts.md`),
content vocabulary (`content-model.md`), and the security decision record
(`security-notes.md`). Visual exports belong in `design/` (gitignored).

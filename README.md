# longstone-ui

Static, server-less browser for **MemoryOverEth**: read an immutable on-chain
memory registry (menhir), verify content bytes in the browser, and manage
delegated agent signers with wallet-signed transactions.

Built for Base Sepolia (chain id 84532); works against any EVM chain where a
`MemoryRegistry` is deployed.

Hosted at `https://longstone.app`; the same build is also served at
`https://longstone-ui.pages.dev` (fallback if the custom domain is unbound).

## What it does

- **Landing** — `/` is a static one-screen facade (positioning, CTAs, component
  cards, document links) with no wallet dependency.
- **Login** — `/login` connects a wallet (AppKit modal when configured,
  injected otherwise) and links onward to the workspaces.
- **Workspaces (timeline)** — `/workspaces` shows your anchored memories with
  `deep` / `active` badges and retracted tombstones, plus tag filtering.
- **Verify** — paste a commitment hash: the app derives the CID from the
  on-chain `cidDigest`, fetches the bytes, and checks both
  `keccak256(bytes) == contentHash` and `sha256(bytes) == cidDigest`.
- **Commitment detail** — full record with predecessor/successor links.
- **Access control** — grant/revoke agent signer roles (wallet-signed).
- **Retract** — tombstone a commitment, optionally linking a successor.
- **Settings** — RPC, registry, IPFS gateway, optional memory gateway.
- **Staging** — read-only list from a remote hisaishi gateway (optional).
- **Privacy / Terms** — `/privacy` and `/terms` are static document routes
  outside the app shell.

## Routes

| Route | View | Shell |
|---|---|---|
| `/` | Landing facade (static) | outside |
| `/privacy` | Privacy policy | outside |
| `/terms` | Terms of use | outside |
| `/login` | Wallet connection entry | inside |
| `/workspaces` | Timeline (moved here from `/`) | inside |
| `/verify` | Public verify | inside |
| `/commitment/:hash` | Commitment detail | inside |
| `/acl` | Agent signer roles | inside |
| `/retract` | Retract (tombstone) | inside |
| `/settings` | Settings | inside |
| `/staging` | Optional hisaishi staging view | inside |
| `/about` | Versions and registry | inside |
| `*` | 404 inside the app shell | inside |

Every route is a client-side SPA route: `public/_redirects` (Cloudflare Pages)
and the Vercel rewrite both fall back to `index.html`, so direct navigation and
refresh work without extra static files.

## Deployed

| Surface | URL |
|---|---|
| Web app (root domain) | `https://longstone.app` |
| Web app (Pages fallback) | `https://longstone-ui.pages.dev` |
| Memory gateway (hisaishi) | `https://api.longstone.app` (health at `/v1/health`; workers.dev stays as fallback) |
| menhir portal | `https://menhir.longstone.app` |
| hisaishi portal | `https://hisaishi.longstone.app` |

## Honest-by-design

- A CID alone is **never** presented as an on-chain verification.
- A retract is a tombstone, not a deletion; retracting twice is a silent
  no-op.
- Every error is typed and human-readable; no raw revert strings.

## Quick start

```bash
corepack pnpm install
corepack pnpm --dir longstone-surface build
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
| `VITE_HISAISHI_URL` | remote gateway base URL (production: `https://api.longstone.app`); enables the Staging view and digest-based verify |
| `VITE_REOWN_PROJECT_ID` | enables the AppKit modal; unset → injected-only |

No private key is ever read by this app. All signing happens in the wallet.

## Scripts

```bash
corepack pnpm --dir longstone-surface build
corepack pnpm --dir longstone-surface test
corepack pnpm --dir longstone-ui typecheck
corepack pnpm --dir longstone-ui test          # vitest (unit + deploy parity)
corepack pnpm --dir longstone-ui build
corepack pnpm --dir longstone-ui run audit     # bundle/env gate
node longstone-ui/scripts/e2e.mjs              # local chain + fixture + Playwright
```

### Live E2E

`test/e2e/live.spec.ts` runs against the deployed site and is skipped unless
`LIVE_E2E=1`:

```bash
LIVE_E2E=1 LIVE_BASE_URL=https://longstone.app \
  LIVE_HISAISHI_URL=https://api.longstone.app \
  corepack pnpm --dir longstone-ui exec playwright test test/e2e/live.spec.ts
```

It asserts that the deployed bundle carries the real registry / IPFS / hisaishi
URLs (a deploy that forgets a build variable fails here), that the timeline
scans Base Sepolia, that Staging reads the Worker cross-origin, and that Verify
fetches pinned bytes through the gateway digest route with both digests
matching. The injected wallet is read-only — no key exists in this app's pages
or the repo. (The separate `longstone-ext` companion may hold an encrypted,
non-signing wallet vault; it never signs.) Override `LIVE_OWNER`,
`LIVE_SCAN_START`, or the endpoint variables when pointing it at another
deployment.

`scripts/e2e.mjs` starts a local Hardhat node with `--chain-id 84532`,
deploys and seeds a registry using the node's unlocked accounts, builds the
app, and runs the Playwright journey suite. **No private key is read,
written, or passed on any command line.**

## Dependency audit exceptions

`pnpm audit` must stay clean. One advisory is currently excepted because its
major line has no patched release:

| Advisory | Package | Why | Revisit |
|---|---|---|---|
| `GHSA-mrhx-c7xc-m3w5` | `zod < 4.6.6` | `@reown/appkit` 1.8.24 pins `zod 3.22.4` via `@reown/appkit-wallet`, and `@coinbase/cdp-sdk` brings `3.25.76`; only zod 4.6.6+ is patched and appkit does not support zod 4 yet. The advisory is a memory-exhaustion DoS. | 2026-11-24, or as soon as `@reown/appkit` supports zod 4 — remove the `audit.ignore` entry from the assembled `pnpm-workspace.yaml` in `.github/workflows/deploy.yml`. |

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

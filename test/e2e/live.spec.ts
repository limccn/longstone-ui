/**
 * Live E2E — the deployed browser against the deployed gateway and Base
 * Sepolia. Skipped unless `LIVE_E2E=1`, so `pnpm e2e` stays hermetic.
 *
 * What this proves that the local suite cannot:
 *   - the bundle was built with the real registry, IPFS gateway and hisaishi
 *     URL (a deploy that forgets an env var fails here, not silently in prod);
 *   - the Worker answers the browser's CORS preflight (same-origin tests pass
 *     even when a real browser would refuse the response);
 *   - content verification fetches the pinned bytes from the production
 *     gateway, not a route-intercepted fixture.
 *
 * The wallet is an injected, read-only EIP-1193 provider for the live owner:
 * no key exists in the browser or in this repo.
 */

import { expect, test } from '@playwright/test';

import { installLiveWallet } from './harness';

const LIVE = process.env['LIVE_E2E'] === '1';
const BASE_URL = process.env['LIVE_BASE_URL'] ?? 'https://longstone-ui.pages.dev';
const OWNER = (process.env['LIVE_OWNER'] ??
  '0x330c67886612ba88b4895739f2e610f01f233d78') as `0x${string}`;
const REGISTRY = (process.env['LIVE_REGISTRY'] ??
  '0xC85ed11d3065739F1829A114e420584bEC3FDFEF') as `0x${string}`;
const HISAISHI_URL =
  process.env['LIVE_HISAISHI_URL'] ?? 'https://hisaishi.limingcheng269.workers.dev';
const IPFS_GATEWAY =
  process.env['LIVE_IPFS_GATEWAY'] ??
  'https://turquoise-gigantic-bee-350.mypinata.cloud/ipfs';
// First live anchoring happened at block 48,356,489. Scanning from a little
// before it keeps this suite to a handful of getLogs windows; the local suite
// already covers the blank-start auto-detection path.
const SCAN_START = process.env['LIVE_SCAN_START'] ?? '48355000';

interface LiveRow {
  cid: string;
  contentHash: `0x${string}`;
  commitmentHash: `0x${string}` | null;
  status: string;
}

async function liveRows(): Promise<LiveRow[]> {
  const response = await fetch(
    `${HISAISHI_URL}/v1/memories?owner=${OWNER}&limit=100`,
  );
  expect(response.status, 'live gateway must answer').toBe(200);
  const body = (await response.json()) as { rows: LiveRow[] };
  return body.rows;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

test.describe('live — deployed UI → hisaishi → Base Sepolia', () => {
  test.skip(LIVE !== true, 'set LIVE_E2E=1 to run against the deployed deployment');
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await installLiveWallet(page, { owner: OWNER });
    // Only the scan start is overridden. Everything else must come from the
    // build's baked defaults; that is what the settings test asserts next.
    await page.addInitScript((start) => {
      localStorage.setItem(
        'longstone-ui.settings.v1',
        JSON.stringify({ scanStartBlock: start }),
      );
    }, SCAN_START);
  });

  test('the deployed bundle carries the live endpoints', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    await expect(page.getByTestId('settings-registry')).toHaveValue(REGISTRY);
    await expect(page.getByTestId('settings-hisaishi')).toHaveValue(HISAISHI_URL);
    await expect(page.getByTestId('settings-gateway')).toHaveValue(IPFS_GATEWAY);
  });

  test('timeline shows the live owner’s anchored commitments', async ({ page }) => {
    const rows = await liveRows();
    expect(rows.length).toBeGreaterThan(0);

    await page.goto(`${BASE_URL}/`);
    await page.getByTestId('connect').click();
    await expect(page.getByTestId('wallet-address')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('timeline-row')).toHaveCount(rows.length, {
      timeout: 60_000,
    });
    // Match on contentHash, which is chain truth. The gateway's derived
    // `commitmentHash` covers the *placeholder* struct (signer/blockHeight/
    // prev are unknown until longstone stamps), so it is a lookup aid, not the
    // on-chain digest — matching on it would assert the wrong thing.
    for (const row of rows) {
      await expect(
        page.locator('tr', { hasText: shortHash(row.contentHash) }),
      ).toHaveCount(1);
    }
  });

  test('staging reads the deployed gateway cross-origin', async ({ page }) => {
    const rows = await liveRows();

    await page.goto(`${BASE_URL}/`);
    await page.getByTestId('connect').click();
    await expect(page.getByTestId('wallet-address')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Staging' }).click();

    await expect(page.getByTestId('staging-row')).toHaveCount(rows.length, {
      timeout: 30_000,
    });
    await expect(page.locator('.error')).toHaveCount(0);
  });

  test('verify fetches pinned bytes and both digests match', async ({ page }) => {
    const rows = await liveRows();
    const anchored = rows.find((row) => row.status === 'anchored');
    expect(anchored, 'a live anchored row is required').toBeDefined();

    await page.goto(`${BASE_URL}/`);
    await page.getByTestId('connect').click();
    await expect(page.getByTestId('wallet-address')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('timeline-row').first()).toBeVisible({
      timeout: 60_000,
    });
    // The on-chain commitment hash comes from the chain index — the gateway's
    // hash is derived from the unsigned placeholder and would answer
    // "not-anchored" for a commitment that is plainly on chain.
    const href = await page
      .locator('tr', { hasText: shortHash(anchored!.contentHash) })
      .locator('a')
      .getAttribute('href');
    const commitmentHash = href?.split('/').pop() ?? '';
    expect(commitmentHash).toMatch(/^0x[0-9a-f]{64}$/);

    await page.getByRole('link', { name: 'Verify' }).click();
    await page.getByTestId('verify-input').fill(commitmentHash);
    await page.getByTestId('verify-run').click();

    await expect(page.getByTestId('verify-verdict')).toHaveText('verified', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('keccak-match')).toHaveText('true');
    await expect(page.getByTestId('sha256-match')).toHaveText('true');
    await expect(page.getByTestId('verify-result')).toContainText(anchored!.cid);
  });
});

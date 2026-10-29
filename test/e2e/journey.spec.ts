import { test, expect } from '@playwright/test';
import { connectWallet, fixture, installWallet, serveGateway } from './harness';

test.describe('longstone-ui e2e — Base Sepolia chain semantics (local node)', () => {
  test.beforeEach(async ({ page }) => {
    await installWallet(page);
    await serveGateway(page);
  });

  test('blank scan start auto-detects the deploy block instead of scanning genesis', async ({
    page,
  }) => {
    // Regression: the default used to be block 0 with a 10k chunk, which every
    // public Base Sepolia RPC rejects ("eth_getLogs is limited to a 200
    // range"). The e2e fixture always pinned the deploy block, so the broken
    // path was never exercised. Boot with it blank, exactly as a first-time
    // visitor does, and assert the timeline still fills.
    await page.addInitScript(() => {
      const raw = localStorage.getItem('longstone-ui.settings.v1');
      if (raw === null) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      parsed['scanStartBlock'] = '';
      localStorage.setItem('longstone-ui.settings.v1', JSON.stringify(parsed));
    });

    const getCodeCalls: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && (request.postData() ?? '').includes('eth_getCode')) {
        getCodeCalls.push(request.postData() ?? '');
      }
    });

    await connectWallet(page);
    await expect(page.getByTestId('timeline-row')).toHaveCount(3, { timeout: 30_000 });

    // Auto-detection must have probed for code rather than starting at 0.
    expect(getCodeCalls.length).toBeGreaterThan(0);
    for (const body of getCodeCalls) {
      expect(body).not.toContain('"fromBlock":"0x0"');
    }
  });

  test('connect → scan → timeline shows anchored memories with deep/active badges', async ({
    page,
  }) => {
    await connectWallet(page);

    const rows = page.getByTestId('timeline-row');
    await expect(rows).toHaveCount(3, { timeout: 30_000 });

    // Active memory: deep + active.
    const activeRow = page.locator(`tr:has-text("${fixture.active.tag}")`);
    await expect(activeRow).toHaveCount(1);
    await expect(activeRow.getByText('deep', { exact: true })).toBeVisible();
    await expect(activeRow.getByText('active', { exact: true })).toBeVisible();

    // Retracted memory: deep + retracted (tombstone still listed).
    const chainRows = page.locator('tr', {
      hasText: fixture.chain.retractedHash.slice(0, 10),
    });
    await expect(chainRows).toHaveCount(1);
    await expect(chainRows.getByText('retracted', { exact: true })).toBeVisible();
  });

  test('tag filter narrows the timeline (OR semantics)', async ({ page }) => {
    await connectWallet(page);
    await expect(page.getByTestId('timeline-row')).toHaveCount(3, { timeout: 30_000 });

    await page.getByTestId('tag-filter').getByRole('button', { name: 'layer:deep' }).click();
    await expect(page.getByTestId('timeline-row')).toHaveCount(1);

    await page.getByTestId('tag-filter').getByRole('button', { name: 'layer:deep' }).click();
    await expect(page.getByTestId('timeline-row')).toHaveCount(3);
  });

  test('verify by commitment hash → verified with both digests matching', async ({ page }) => {
    await connectWallet(page);
    await page.getByRole('link', { name: 'Verify' }).click();

    await page.getByTestId('verify-input').fill(fixture.active.commitmentHash);
    await page.getByTestId('verify-run').click();

    await expect(page.getByTestId('verify-verdict')).toHaveText('verified', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('keccak-match')).toHaveText('true');
    await expect(page.getByTestId('sha256-match')).toHaveText('true');
    await expect(page.getByTestId('verify-result')).toContainText(fixture.active.cid);
  });

  test('verify a retracted commitment → content matches but verdict is retracted', async ({
    page,
  }) => {
    await connectWallet(page);
    await page.getByRole('link', { name: 'Verify' }).click();

    await page.getByTestId('verify-input').fill(fixture.chain.retractedHash);
    await page.getByTestId('verify-run').click();

    await expect(page.getByTestId('verify-verdict')).toHaveText('retracted', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('keccak-match')).toHaveText('true');
    await expect(page.getByTestId('sha256-match')).toHaveText('true');
  });

  test('verify an unknown commitment hash → not-anchored (never a fake pass)', async ({
    page,
  }) => {
    await connectWallet(page);
    await page.getByRole('link', { name: 'Verify' }).click();

    await page.getByTestId('verify-input').fill(`0x${'ab'.repeat(32)}`);
    await page.getByTestId('verify-run').click();

    await expect(page.getByTestId('verify-verdict')).toHaveText('not-anchored', {
      timeout: 30_000,
    });
  });

  test('verify by CID alone → bytes match, but the UI refuses an on-chain verdict', async ({
    page,
  }) => {
    await connectWallet(page);
    await page.getByRole('link', { name: 'Verify' }).click();

    await page.getByRole('radio').nth(1).check();
    await page.getByTestId('verify-input').fill(fixture.active.cid);
    await page.getByTestId('verify-run').click();

    await expect(page.getByTestId('verify-verdict')).toHaveText('not-anchored', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('sha256-match')).toHaveText('true');
    await expect(page.getByTestId('verify-result')).toContainText(
      'a CID alone is not an on-chain commitment',
    );
  });

  test('detail view links predecessor and successor through the version chain', async ({
    page,
  }) => {
    await connectWallet(page);
    await expect(page.getByTestId('timeline-row')).toHaveCount(3, { timeout: 30_000 });

    await page.goto(`/commitment/${fixture.chain.retractedHash}`);
    const detail = page.getByTestId('detail');
    await expect(detail).toContainText(fixture.chain.retractedHash);
    await expect(detail.getByRole('link', { name: fixture.chain.successorHash })).toBeVisible();

    // Follow the successor link.
    await detail.getByRole('link', { name: fixture.chain.successorHash }).click();
    await expect(page.getByTestId('detail')).toContainText(fixture.chain.successorHash);
    await expect(
      page.getByTestId('detail').getByRole('link', { name: fixture.chain.retractedHash }),
    ).toBeVisible();
  });

  test('ACL: grant commit role to an agent via wallet tx, then revoke', async ({ page }) => {
    await connectWallet(page);
    await page.getByRole('link', { name: 'Access control' }).click();

    // Seeded delegation (fixture setSigner(agent, ROLE_COMMIT)) is listed.
    // The UI renders checksummed (EIP-55) addresses; the fixture stores the
    // node's lowercase form, so compare case-insensitively.
    const list = page.getByTestId('acl-list');
    await expect(list).toContainText(new RegExp(fixture.agent, 'i'), { timeout: 30_000 });
    await expect(list).toContainText('commit');

    // Grant commit to a fresh address and revoke it.
    await page.getByTestId('acl-signer').fill(fixture.other);
    await expect(page.getByTestId('acl-current-roles')).toContainText('none');

    await page.getByTestId('acl-grant').click();
    await expect(page.getByTestId('acl-notice')).toContainText('Granted commit', {
      timeout: 30_000,
    });

    await page.getByTestId('acl-signer').fill(fixture.other);
    await expect(page.getByTestId('acl-current-roles')).toContainText('commit', {
      timeout: 15_000,
    });

    await page.getByTestId('acl-revoke').click();
    await expect(page.getByTestId('acl-notice')).toContainText('Revoked', {
      timeout: 30_000,
    });
  });

  test('retract flow: wallet tx clears the memory from active state (idempotent)', async ({
    page,
  }) => {
    await connectWallet(page);
    await page.getByRole('link', { name: 'Retract' }).click();

    const option = page
      .getByTestId('retract-select')
      .locator('option', { hasText: fixture.active.commitmentHash.slice(0, 10) });
    await expect(option).toHaveCount(1, { timeout: 30_000 });

    await page.getByTestId('retract-select').selectOption(fixture.active.commitmentHash);
    await page.getByTestId('retract-run').click();
    await expect(page.getByTestId('retract-notice')).toContainText('no-op', {
      timeout: 30_000,
    });

    // Timeline now shows the memory as retracted.
    await page.getByRole('link', { name: 'Workspaces' }).click();
    const row = page.locator('tr', {
      hasText: fixture.active.commitmentHash.slice(0, 10),
    });
    await expect(row.getByText('retracted', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('settings round-trip + staging view explains the absent remote gateway', async ({
    page,
  }) => {
    await connectWallet(page);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('settings-rpc')).toHaveValue('http://127.0.0.1:8545');
    await expect(page.getByTestId('settings-registry')).toHaveValue(fixture.registry);

    // Invalid URL is rejected with a typed message, not saved.
    await page.getByTestId('settings-rpc').fill('ftp://nope');
    await page.getByTestId('settings-save').click();
    await expect(page.getByText('Only https:// (or http:// on loopback) is allowed')).toBeVisible();
    await page.getByRole('button', { name: 'Reset' }).click();

    await page.getByRole('link', { name: 'Staging' }).click();
    await expect(page.getByTestId('staging')).toContainText('No memory gateway configured', {
      timeout: 15_000,
    });
  });

  test('indexedDB cache: reload serves the timeline without rescanning', async ({ page }) => {
    await connectWallet(page);
    await expect(page.getByTestId('timeline-row')).toHaveCount(3, { timeout: 30_000 });

    // Count getLogs calls issued from now on.
    let scans = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && (request.postData() ?? '').includes('eth_getLogs')) {
        scans += 1;
      }
    });

    await page.reload();
    // The injected shim has no persisted authorization, so reconnect through
    // the UI; the cache — not the wallet — is what this test measures.
    await connectWallet(page);
    await expect(page.getByTestId('timeline-row')).toHaveCount(3, { timeout: 30_000 });

    // The cache covers every block up to head, so the reload must not scan.
    expect(scans).toBe(0);
  });

  test('wrong-network guard offers a switch back to Base Sepolia', async ({ page }) => {
    await installWallet(page, { chainId: '0x1' });
    await connectWallet(page);
    await expect(page.getByTestId('switch-network')).toBeVisible();

    await page.getByTestId('switch-network').click();
    await expect(page.getByTestId('switch-network')).toBeHidden({ timeout: 15_000 });
  });
});

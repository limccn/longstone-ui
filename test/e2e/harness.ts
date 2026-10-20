import { expect, type Page } from '@playwright/test';
import { e2eSettings, loadFixture, type ChainFixture } from './fixture';

export const fixture: ChainFixture = loadFixture();

interface ProviderOptions {
  owner: `0x${string}`;
  rpcUrl: string;
  chainId?: string;
}

/**
 * Installs a minimal EIP-1193 provider that proxies reads (and, on the local
 * node, signing) to an RPC endpoint. Keys never enter the browser: the local
 * Hardhat node holds unlocked accounts, and the live suite is read-only.
 */
async function installProvider(page: Page, options: ProviderOptions): Promise<void> {
  const initialChainId = options.chainId ?? '0x14a34';
  await page.addInitScript(
    ({ owner, rpcUrl, initialChainId }) => {
      const chainListeners = new Set<(id: string) => void>();
      const accountListeners = new Set<(accounts: string[]) => void>();
      let chainId = initialChainId;

      async function forward(method: string, params: unknown): Promise<unknown> {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        });
        const body = (await response.json()) as { result?: unknown; error?: { code: number; message: string } };
        if (body.error !== undefined) {
          const error = new Error(body.error.message) as Error & { code: number };
          error.code = body.error.code;
          throw error;
        }
        return body.result;
      }

      const provider = {
        isMetaMask: false,
        async request({ method, params }: { method: string; params?: unknown }) {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [owner];
            case 'eth_chainId':
              return chainId;
            case 'wallet_requestPermissions':
              return [
                {
                  parentCapability: 'eth_accounts',
                  caveats: [{ type: 'restrictReturnedAccounts', value: [owner] }],
                },
              ];
            case 'wallet_revokePermissions':
              return null;
            case 'wallet_switchEthereumChain': {
              const requested = (params as { chainId: string }[])[0]!.chainId;
              chainId = requested;
              for (const listener of chainListeners) listener(chainId);
              return null;
            }
            default:
              return forward(method, params);
          }
        },
        on(event: string, handler: (value: never) => void) {
          if (event === 'chainChanged') chainListeners.add(handler as never);
          if (event === 'accountsChanged') accountListeners.add(handler as never);
        },
        removeListener(event: string, handler: (value: never) => void) {
          if (event === 'chainChanged') chainListeners.delete(handler as never);
          if (event === 'accountsChanged') accountListeners.delete(handler as never);
        },
      };

      Object.defineProperty(window, 'ethereum', {
        value: provider,
        configurable: true,
        writable: true,
      });
      void accountListeners;
    },
    {
      owner: options.owner,
      rpcUrl: options.rpcUrl,
      initialChainId,
    },
  );
}

/**
 * Local-node wallet: a provider pointing at Hardhat plus the fixture settings
 * in localStorage, because the fixture's addresses exist only on that node.
 */
export async function installWallet(
  page: Page,
  options: { chainId?: string } = {},
): Promise<void> {
  const settings = e2eSettings(fixture);
  await installProvider(page, {
    owner: fixture.owner,
    rpcUrl: settings.rpcUrl,
    ...(options.chainId === undefined ? {} : { chainId: options.chainId }),
  });
  await page.addInitScript((settingsJson) => {
    localStorage.setItem('longstone-ui.settings.v1', settingsJson);
  }, JSON.stringify(settings));
}

/**
 * Live wallet: a read-only injected provider for a real owner address.
 *
 * It deliberately does NOT write settings, so the app boots from the defaults
 * baked into the deployed bundle (registry, RPC, IPFS gateway, hisaishi URL).
 * That makes the live spec a test of the deployment's configuration, not of a
 * test-injected one. The only value the spec overrides is the scan start block,
 * to keep the suite to a few `eth_getLogs` windows instead of the ~270 that a
 * full-history scan from the deploy block requires.
 */
export async function installLiveWallet(
  page: Page,
  options: { owner: `0x${string}`; rpcUrl?: string; chainId?: string },
): Promise<void> {
  await installProvider(page, {
    owner: options.owner,
    rpcUrl: options.rpcUrl ?? 'https://sepolia.base.org',
    ...(options.chainId === undefined ? {} : { chainId: options.chainId }),
  });
}

/** Serves the seeded canonical bytes for the fixture CIDs. */
export async function serveGateway(page: Page): Promise<void> {
  const bodies = new Map<string, string>([
    [fixture.active.cid, fixture.active.canonical],
    [fixture.chain.retractedCid, fixture.chain.retractedCanonical],
    [fixture.chain.successorCid, fixture.chain.successorCanonical],
  ]);
  await page.route('**/ipfs/**', async (route) => {
    const cid = route.request().url().split('/').pop() ?? '';
    const body = bodies.get(cid);
    if (body === undefined) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body,
    });
  });
}

export async function connectWallet(page: Page): Promise<void> {
  await page.goto('/');
  const connect = page.getByTestId('connect');
  await expect(connect).toBeVisible();
  await connect.click();
  await expect(page.getByTestId('wallet-address')).toBeVisible();
  await expect(page.getByTestId('wallet-address')).toHaveText(/0x/);
}

// @vitest-environment jsdom
/**
 * Route rendering contract.
 *
 * The landing facade and the document pages render outside the app shell (no
 * header, no wallet bar); the login and workspace entry points render inside
 * it. The timeline lives at `/workspaces` since the root became the facade.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const { state } = vi.hoisted(() => ({
  state: {
    account: {
      address: undefined as `0x${string}` | undefined,
      isConnected: false,
      chainId: undefined as number | undefined,
    },
    switchMock: vi.fn<(args: { chainId: number }) => void>(),
  },
}));

vi.mock('../src/wallet/config', () => ({
  CHAIN: { id: 84532, name: 'Base Sepolia' },
  CHAIN_ID: 84532,
  appKitEnabled: false,
}));

vi.mock('@reown/appkit/react', () => ({ modal: { open: vi.fn() } }));

vi.mock('wagmi/connectors', () => ({ injected: () => ({}) }));

vi.mock('wagmi', () => ({
  useAccount: () => state.account,
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: state.switchMock, isPending: false }),
  usePublicClient: () => undefined,
  useReadContract: () => ({ data: undefined }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
}));

vi.mock('../src/chain/useChainIndex', () => ({
  useChainIndex: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));

vi.mock('@limccn/longstone-surface', () => ({
  UiError: class UiError extends Error {},
  blockscoutAddressUrl: (address: string) => `https://example.test/address/${address}`,
  blockscoutTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
  fetchStagedMemories: vi.fn(async () => []),
  filterByTags: (states: unknown[]) => states,
  makePublicClient: () => ({}),
  predecessorOf: () => undefined,
  readerFor: () => ({}),
  signersForOwner: () => [],
  statesForOwner: () => [],
  successorOf: () => undefined,
  toUiError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  verifyByCid: vi.fn(),
  verifyByCommitmentHash: vi.fn(),
}));

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.account = { address: undefined, isConnected: false, chainId: undefined };
  state.switchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('routes outside the app shell', () => {
  it('/ renders the static landing facade', () => {
    renderAt('/');

    expect(screen.getByTestId('landing')).toBeTruthy();
    expect(screen.getByText('On-chain verifiable memory for AI agents.')).toBeTruthy();

    const enter = screen.getByTestId('landing-enter') as HTMLAnchorElement;
    const connect = screen.getByTestId('landing-connect') as HTMLAnchorElement;
    expect(enter.getAttribute('href')).toBe('/workspaces');
    expect(connect.getAttribute('href')).toBe('/login');

    expect(
      screen.getByRole('link', { name: /menhir/ }).getAttribute('href'),
    ).toBe('https://menhir.longstone.app');
    expect(
      screen.getByRole('link', { name: /hisaishi/ }).getAttribute('href'),
    ).toBe('https://hisaishi.longstone.app');
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe(
      '/terms',
    );
    expect(
      screen.getByRole('link', { name: 'support@longstone.app' }).getAttribute('href'),
    ).toBe('mailto:support@longstone.app');

    // The facade is deliberately outside the wallet-bearing shell.
    expect(screen.queryByTestId('wallet-bar')).toBeNull();
  });

  it('/privacy renders the privacy policy outside the shell', () => {
    renderAt('/privacy');

    expect(screen.getByTestId('privacy')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy policy');
    expect(screen.getByText(/No telemetry, analytics/)).toBeTruthy();
    // The store listings point their privacy-policy URL at this page, so it
    // must keep covering the extension's local vault, not just the web app.
    expect(
      screen.getByRole('heading', { name: /browser extension/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Argon2id/)).toBeTruthy();
    expect(screen.queryByTestId('wallet-bar')).toBeNull();
  });

  it('/terms renders the terms of use outside the shell', () => {
    renderAt('/terms');

    expect(screen.getByTestId('terms')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terms of use');
    expect(screen.getByText(/irreversible/)).toBeTruthy();
    expect(screen.queryByTestId('wallet-bar')).toBeNull();
  });
});

describe('routes inside the app shell', () => {
  it('/workspaces renders the timeline and marks Workspaces as the active nav item', () => {
    renderAt('/workspaces');

    expect(screen.getByTestId('wallet-bar')).toBeTruthy();
    expect(screen.getByTestId('timeline')).toBeTruthy();
    expect(screen.getByText(/Connect a wallet to see your anchored memories/)).toBeTruthy();

    const workspaces = screen.getByRole('link', { name: 'Workspaces' });
    expect(workspaces.getAttribute('href')).toBe('/workspaces');
    expect(workspaces.className).toContain('nav-link on');
  });

  it('/login renders the wallet connection entry point', () => {
    renderAt('/login');

    expect(screen.getByTestId('login')).toBeTruthy();
    expect(screen.getByTestId('wallet-bar')).toBeTruthy();
    expect(screen.getByTestId('login-connect')).toBeTruthy();
  });

  it('/login offers continue and a network switch once connected on the wrong chain', () => {
    state.account = {
      address: `0x${'11'.repeat(20)}` as `0x${string}`,
      isConnected: true,
      chainId: 1,
    };
    renderAt('/login');

    expect(screen.getByTestId('login-address').textContent).toBe('0x1111…1111');
    expect(screen.getByTestId('login-network').textContent).toContain('Wrong network');

    const continueLink = screen.getByTestId('login-continue') as HTMLAnchorElement;
    expect(continueLink.getAttribute('href')).toBe('/workspaces');

    fireEvent.click(screen.getByTestId('login-switch-network'));
    expect(state.switchMock).toHaveBeenCalledWith({ chainId: 84532 });
  });

  it('unknown routes render the shell 404', () => {
    renderAt('/no-such-page');

    expect(screen.getByText('Page not found.')).toBeTruthy();
    expect(screen.getByTestId('wallet-bar')).toBeTruthy();
  });
});

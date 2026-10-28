// @vitest-environment jsdom
/**
 * Behavioral tests for the L-5 write guard.
 *
 * Buttons are only a hint: each write function re-checks the chain, registry,
 * connection and public client. These tests drive the real views with mocked
 * wagmi hooks so a regression in either layer fails here.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../src/settings/store';
import { AclView } from '../src/ui/AclView';
import { RetractView } from '../src/ui/RetractView';

type WriteArgs = Record<string, unknown>;

const { state, buildSettings, OWNER, SIGNER, ACTIVE_HASH, TX_HASH } = vi.hoisted(() => {
  const OWNER = `0x${'11'.repeat(20)}` as `0x${string}`;
  const SIGNER = `0x${'22'.repeat(20)}` as `0x${string}`;
  const REGISTRY = `0x${'33'.repeat(20)}` as `0x${string}`;
  const ACTIVE_HASH = `0x${'ab'.repeat(32)}` as `0x${string}`;
  const TX_HASH = `0x${'cd'.repeat(32)}` as `0x${string}`;

  const buildSettings = (): Settings => ({
    rpcUrl: 'https://sepolia.base.org',
    registryAddress: REGISTRY,
    ipfsGateway: 'https://gateway.pinata.cloud/ipfs',
    hisaishiUrl: '',
    scanChunkSize: 200,
    scanStartBlock: '',
  });

  return {
    OWNER,
    SIGNER,
    ACTIVE_HASH,
    TX_HASH,
    buildSettings,
    state: {
      account: {
        address: OWNER as `0x${string}` | undefined,
        isConnected: true,
        chainId: 1 as number | undefined,
      },
      settings: buildSettings(),
      index: {
        byHash: new Map(),
        byOwner: new Map(),
        signers: [],
        latestBlock: 0n,
      },
      activeStates: [{ commitmentHash: ACTIVE_HASH, active: true, tags: ['alpha'] }],
      writeMock: vi.fn<(args: WriteArgs) => Promise<`0x${string}`>>(),
      switchMock: vi.fn<(args: { chainId: number }) => void>(),
      refetch: vi.fn(),
    },
  };
});

vi.mock('../src/wallet/config', () => ({ CHAIN_ID: 84532 }));

vi.mock('wagmi', () => ({
  useAccount: () => state.account,
  usePublicClient: () => ({
    waitForTransactionReceipt: vi.fn(async () => ({})),
  }),
  useReadContract: () => ({ data: undefined }),
  useWriteContract: () => ({ writeContractAsync: state.writeMock }),
  useSwitchChain: () => ({ switchChain: state.switchMock, isPending: false }),
}));

vi.mock('../src/settings/useSettings', () => ({
  useSettings: () => state.settings,
}));

vi.mock('../src/chain/useChainIndex', () => ({
  useChainIndex: () => ({ data: state.index, refetch: state.refetch }),
}));

vi.mock('@limccn/longstone-surface', () => ({
  signersForOwner: () => [],
  statesForOwner: () => state.activeStates,
  blockscoutTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
  toUiError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
}));

beforeEach(() => {
  state.account = { address: OWNER, isConnected: true, chainId: 1 };
  state.settings = buildSettings();
  state.writeMock.mockReset();
  state.writeMock.mockResolvedValue(TX_HASH);
  state.switchMock.mockReset();
  state.refetch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fillSigner(): void {
  fireEvent.change(screen.getByTestId('acl-signer'), { target: { value: SIGNER } });
}

describe('ACL write guard', () => {
  it('disables Grant and Revoke on the wrong chain and never calls the writer', () => {
    render(<AclView />);
    fillSigner();

    const grant = screen.getByTestId('acl-grant') as HTMLButtonElement;
    const revoke = screen.getByTestId('acl-revoke') as HTMLButtonElement;

    expect(grant.disabled).toBe(true);
    expect(revoke.disabled).toBe(true);
    expect(screen.getByTestId('acl-wrong-chain')).toBeTruthy();

    fireEvent.click(grant);
    fireEvent.click(revoke);
    expect(state.writeMock).not.toHaveBeenCalled();

    // The disabled attribute is only a hint; the write function must re-check.
    grant.removeAttribute('disabled');
    fireEvent.click(grant);
    expect(state.writeMock).not.toHaveBeenCalled();
  });

  it('offers a chain switch on the wrong chain', () => {
    render(<AclView />);

    fireEvent.click(screen.getByTestId('acl-switch-network'));

    expect(state.switchMock).toHaveBeenCalledWith({ chainId: 84532 });
  });

  it('passes chainId 84532 when Grant runs on the configured chain', async () => {
    state.account.chainId = 84532;
    render(<AclView />);
    fillSigner();

    fireEvent.click(screen.getByTestId('acl-grant'));

    await waitFor(() => expect(state.writeMock).toHaveBeenCalledTimes(1));
    expect(state.writeMock.mock.calls[0]?.[0]).toMatchObject({
      chainId: 84532,
      functionName: 'setSigner',
    });
    await waitFor(() => expect(state.refetch).toHaveBeenCalled());
  });

  it('does not expose an executable write button without a wallet', () => {
    state.account = { address: undefined, isConnected: false, chainId: undefined };
    render(<AclView />);

    expect(screen.queryByTestId('acl-grant')).toBeNull();
    expect(screen.queryByTestId('acl-revoke')).toBeNull();
    expect(screen.getByText(/Connect the owner wallet/)).toBeTruthy();
  });

  it('does not expose an executable write button without a registry', () => {
    state.settings = { ...state.settings, registryAddress: '' };
    render(<AclView />);

    expect(screen.queryByTestId('acl-grant')).toBeNull();
    expect(screen.queryByTestId('acl-revoke')).toBeNull();
    expect(screen.getByText(/Set the registry contract address/)).toBeTruthy();
  });
});

describe('Retract write guard', () => {
  it('disables Retract on the wrong chain, never calls the writer, and offers a switch', () => {
    render(<RetractView />);
    fireEvent.change(screen.getByTestId('retract-select'), {
      target: { value: ACTIVE_HASH },
    });

    const run = screen.getByTestId('retract-run') as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(screen.getByTestId('retract-wrong-chain')).toBeTruthy();

    fireEvent.click(run);
    expect(state.writeMock).not.toHaveBeenCalled();

    // The disabled attribute is only a hint; the write function must re-check.
    run.removeAttribute('disabled');
    fireEvent.click(run);
    expect(state.writeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('retract-switch-network'));
    expect(state.switchMock).toHaveBeenCalledWith({ chainId: 84532 });
  });

  it('passes chainId 84532 when Retract runs on the configured chain', async () => {
    state.account.chainId = 84532;
    render(<RetractView />);
    fireEvent.change(screen.getByTestId('retract-select'), {
      target: { value: ACTIVE_HASH },
    });

    fireEvent.click(screen.getByTestId('retract-run'));

    await waitFor(() => expect(state.writeMock).toHaveBeenCalledTimes(1));
    expect(state.writeMock.mock.calls[0]?.[0]).toMatchObject({
      chainId: 84532,
      functionName: 'retract',
    });
    await waitFor(() => expect(state.refetch).toHaveBeenCalled());
  });

  it('does not expose an executable write button without a wallet', () => {
    state.account = { address: undefined, isConnected: false, chainId: undefined };
    render(<RetractView />);

    expect(screen.queryByTestId('retract-run')).toBeNull();
    expect(screen.getByText(/Connect the owner wallet/)).toBeTruthy();
  });

  it('does not expose an executable write button without a registry', () => {
    state.settings = { ...state.settings, registryAddress: '' };
    render(<RetractView />);

    expect(screen.queryByTestId('retract-run')).toBeNull();
    expect(screen.getByText(/Set the registry contract address/)).toBeTruthy();
  });
});

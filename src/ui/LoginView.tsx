import { Link } from 'react-router-dom';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { modal } from '@reown/appkit/react';
import { appKitEnabled, CHAIN_ID } from '../wallet/config';

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Wallet connection entry point. Mirrors the WalletBar connect branch: the
 * AppKit modal when a project id is configured, the injected connector
 * otherwise. It never redirects on its own — the visitor chooses when to
 * continue to the workspace.
 */
export function LoginView() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  return (
    <section data-testid="login">
      <h2>Connect wallet</h2>
      <p className="hint">
        longstone has no accounts and no server. Your wallet is the only
        identity: it holds the keys, and every write is signed there.
      </p>

      {isConnected ? (
        <div className="login-panel">
          <dl>
            <dt>Address</dt>
            <dd className="mono" data-testid="login-address" title={address}>
              {address !== undefined ? short(address) : '—'}
            </dd>
            <dt>Network</dt>
            <dd data-testid="login-network">
              {wrongNetwork
                ? `Wrong network (${chainId ?? 'unknown'})`
                : `Base Sepolia (${CHAIN_ID})`}
            </dd>
          </dl>
          {wrongNetwork && (
            <p>
              <button
                type="button"
                className="warn"
                data-testid="login-switch-network"
                disabled={switching}
                onClick={() => switchChain({ chainId: CHAIN_ID })}
              >
                Switch to Base Sepolia
              </button>
            </p>
          )}
          <p>
            <Link className="cta" to="/workspaces" data-testid="login-continue">
              Continue to workspaces
            </Link>
          </p>
        </div>
      ) : appKitEnabled ? (
        <button
          type="button"
          data-testid="login-connect"
          onClick={() => {
            // AppKit owns connector selection and the whole connect flow.
            modal?.open();
          }}
        >
          Connect wallet
        </button>
      ) : (
        <button
          type="button"
          data-testid="login-connect"
          disabled={isPending}
          onClick={() => connect({ connector: injected() })}
          title="AppKit modal disabled (no VITE_REOWN_PROJECT_ID) — using injected wallet"
        >
          {isPending ? 'Connecting…' : 'Connect injected wallet'}
        </button>
      )}

      <p className="hint">
        Local and static: no account, no server, and keys never leave your
        wallet.
      </p>
    </section>
  );
}

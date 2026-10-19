import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { modal } from '@reown/appkit/react';
import { appKitEnabled, CHAIN_ID } from './config';

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  return (
    <div className="wallet-bar" data-testid="wallet-bar">
      {isConnected ? (
        <>
          <span className="address" data-testid="wallet-address" title={address}>
            {address !== undefined ? short(address) : '—'}
          </span>
          {wrongNetwork && (
            <button
              type="button"
              className="warn"
              data-testid="switch-network"
              disabled={switching}
              onClick={() => switchChain({ chainId: CHAIN_ID })}
            >
              Switch to Base Sepolia
            </button>
          )}
          <button
            type="button"
            data-testid="disconnect"
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        </>
      ) : appKitEnabled ? (
        <button
          type="button"
          data-testid="connect"
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
          data-testid="connect"
          disabled={isPending}
          onClick={() => connect({ connector: injected() })}
          title="AppKit modal disabled (no VITE_REOWN_PROJECT_ID) — using injected wallet"
        >
          {isPending ? 'Connecting…' : 'Connect injected wallet'}
        </button>
      )}
    </div>
  );
}

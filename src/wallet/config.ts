import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { getSettings } from '../settings/useSettings';

export const CHAIN = baseSepolia;
export const CHAIN_ID = baseSepolia.id; // 84532

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? '';
export const appKitEnabled = projectId !== '';

const settings = getSettings();

// wagmi batches every read through Multicall3 at 0xca11…ca11 unless told
// otherwise. Base Sepolia has it, but a sovereign deployment may not — and a
// read against a missing contract fails silently, which would render real
// on-chain state (signer roles) as "none". Correctness first: read directly.
const batch = { multicall: false } as const;

export const wagmiAdapter = appKitEnabled
  ? new WagmiAdapter({
      networks: [CHAIN],
      projectId,
      transports: { [CHAIN_ID]: http(settings.rpcUrl) },
      batch,
    })
  : null;

export const wagmiConfig =
  wagmiAdapter !== null
    ? wagmiAdapter.wagmiConfig
    : createConfig({
        chains: [CHAIN],
        transports: { [CHAIN_ID]: http(settings.rpcUrl) },
        batch,
        ssr: false,
      });

let modalInitialized = false;

/** AppKit modal init. Unset projectId → injected-only fallback (no modal). */
export function initAppKit(): void {
  if (!appKitEnabled || modalInitialized || wagmiAdapter === null) return;
  createAppKit({
    // AppKit 1.8 types leave `namespace` optional while createAppKit demands
    // it under exactOptionalPropertyTypes — the adapter supplies it at runtime.
    adapters: [wagmiAdapter as never],
    networks: [CHAIN],
    projectId,
    metadata: {
      name: 'longstone',
      description: 'MemoryOverEth memory browser',
      url: window.location.origin,
      icons: [],
    },
    features: {
      // Sovereign-wallet-only in M1/M2: no email/social logins.
      email: false,
      socials: false,
      analytics: false,
      swaps: false,
      onramp: false,
    },
  });
  modalInitialized = true;
}

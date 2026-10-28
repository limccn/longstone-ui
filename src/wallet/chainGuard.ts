import { CHAIN_ID } from './config';

/**
 * Writes are only valid on the configured chain. Button state is a UX hint;
 * the write function must call this too so a stale or bypassed render cannot
 * submit a transaction on the wrong network.
 */
export function isWriteChain(chainId: number | undefined): boolean {
  return chainId === CHAIN_ID;
}

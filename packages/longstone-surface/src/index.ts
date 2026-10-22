/**
 * @limccn/longstone-surface — the browser-safe verification surface.
 *
 * One implementation of the trust invariant: expected digests always come
 * from chain state through `verifyCommitment`; they are never caller-supplied
 * and no hash function is injectable (PS-4). Only the byte-fetch transport
 * crosses the network.
 *
 * Browser-safe by construction: this package imports no Node built-ins, and
 * `@limccn/menhir-core/vectors` (the Node-only subpath) is never referenced.
 */

import type { Address, Bytes32 } from '@limccn/menhir-core';
import type { PublicClient } from 'viem';

import { readerFor, verifyByCommitmentHash } from './verify/verify.js';
import type { VerifyResult } from './verify/verify.js';

// Typed error surface
export { UiError, toUiError, uiMessage } from './errors.js';
export type { UiErrorCode } from './errors.js';

// Gateway transport (the gateway is a transport, never an authority)
export {
  fetchFromGateway,
  fetchFromHisaishi,
  fetchContentByDigest,
  fetchStagedMemories,
  blockscoutTxUrl,
  blockscoutAddressUrl,
} from './gateway/client.js';
export type { MemoryRow, StagedMemory } from './gateway/client.js';

// Derivation — `SignerRecord` is defined here and re-exported by the registry
// module; it is exported exactly once, from its defining module.
export {
  EMPTY_INDEX,
  deriveIndex,
  signersForOwner,
  statesForOwner,
  predecessorOf,
  successorOf,
  filterByTags,
} from './state/derive.js';
export type {
  MemoryEventRecord,
  MemoryState,
  SignerRecord,
  SignerState,
  ChainIndex,
} from './state/derive.js';

// Verification
export {
  makeReader,
  readerFor,
  verifyByCommitmentHash,
  verifyByCid,
  commitmentHash,
  cidDigest,
} from './verify/verify.js';
export type { CommitmentReader, VerifyVerdict, VerifyResult } from './verify/verify.js';

/**
 * Verify a claimed memory with chain-derived expected digests.
 *
 * The reader is constructed here from the caller's chain client and registry
 * address, so a shell cannot hand in the expected digests themselves — only
 * the chain client it already talks to and a gateway URL. `verifyByCommitmentHash`
 * stays public for tests and advanced use, but shells must use this wrapper
 * (design §5.1: only the byte-fetch transport is caller-controlled).
 */
export async function verifyCommitment(args: {
  hash: Bytes32;
  client: PublicClient;
  registryAddress: Address;
  gateway: string;
  hisaishiUrl?: string;
  signal?: AbortSignal;
}): Promise<VerifyResult> {
  const { hash, client, registryAddress, gateway, hisaishiUrl, signal } = args;
  return verifyByCommitmentHash({
    hash,
    reader: readerFor(client, registryAddress),
    gateway,
    ...(hisaishiUrl === undefined ? {} : { hisaishiUrl }),
    ...(signal === undefined ? {} : { signal }),
  });
}

// Chain scan (the pure loop; the `useChainIndex` hook stays in the app)
export {
  makePublicClient,
  decodeLog,
  isSignerRecord,
  scanRange,
  findDeployBlock,
  memoryRegistryAbi,
} from './chain/registry.js';
export type { ScanArgs, ScanResult } from './chain/registry.js';

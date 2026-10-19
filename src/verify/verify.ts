import {
  cidDigest,
  cidV1RawFromDigest,
  cidV1RawToDigest,
  commitmentHash,
  memoryRegistryAbi,
  type Commitment,
} from '@menhir/core';
import { keccak256, type PublicClient } from 'viem';
import { toUiError } from '../errors';
import { fetchFromGateway } from '../gateway/client';
import type { Address, Bytes32 } from '@menhir/core';

export interface CommitmentReader {
  getCommitment(hash: Bytes32): Promise<Commitment>;
  isDeep(hash: Bytes32): Promise<boolean>;
  isActive(hash: Bytes32): Promise<boolean>;
}

export function makeReader(
  client: PublicClient,
  registryAddress: Address,
): CommitmentReader {
  return {
    async getCommitment(hash) {
      const result = await client.readContract({
        address: registryAddress,
        abi: memoryRegistryAbi,
        functionName: 'getCommitment',
        args: [hash],
      });
      return result as Commitment;
    },
    async isDeep(hash) {
      return client.readContract({
        address: registryAddress,
        abi: memoryRegistryAbi,
        functionName: 'isDeep',
        args: [hash],
      });
    },
    async isActive(hash) {
      return client.readContract({
        address: registryAddress,
        abi: memoryRegistryAbi,
        functionName: 'isActive',
        args: [hash],
      });
    },
  };
}

export type VerifyVerdict =
  | 'verified'
  | 'content-mismatch'
  | 'not-anchored'
  | 'retracted'
  | 'error';

export interface VerifyResult {
  /** Which input the user provided. */
  mode: 'commitment' | 'cid';
  commitmentHash: Bytes32 | null;
  cid: string | null;
  bytesLength: number;
  computedContentHash: Bytes32 | null;
  computedCidDigest: Bytes32 | null;
  expectedContentHash: Bytes32 | null;
  expectedCidDigest: Bytes32 | null;
  keccakMatches: boolean | null;
  sha256Matches: boolean | null;
  anchored: boolean;
  active: boolean;
  verdict: VerifyVerdict;
  message?: string;
}

const ZERO32 = /^0x0{64}$/i;

function emptyResult(mode: VerifyResult['mode']): VerifyResult {
  return {
    mode,
    commitmentHash: null,
    cid: null,
    bytesLength: 0,
    computedContentHash: null,
    computedCidDigest: null,
    expectedContentHash: null,
    expectedCidDigest: null,
    keccakMatches: null,
    sha256Matches: null,
    anchored: false,
    active: false,
    verdict: 'not-anchored',
  };
}

/**
 * Verify by commitment hash: read the commitment on-chain, derive its
 * expected CID (raw CIDv1 from cidDigest — D-9), fetch bytes from the
 * gateway, compare BOTH digests in-browser, then report deep/active.
 */
export async function verifyByCommitmentHash(args: {
  hash: Bytes32;
  reader: CommitmentReader;
  gateway: string;
  signal?: AbortSignal;
}): Promise<VerifyResult> {
  const { hash, reader, gateway, signal } = args;
  const base = { ...emptyResult('commitment'), commitmentHash: hash };

  try {
    const deep = await reader.isDeep(hash);
    if (!deep) {
      return {
        ...base,
        verdict: 'not-anchored',
        message: 'No commitment with this hash exists on this registry.',
      };
    }
    const commitment = await reader.getCommitment(hash);
    const active = await reader.isActive(hash);

    if (!/^0x[0-9a-fA-F]{64}$/.test(commitment.cidDigest) || ZERO32.test(commitment.cidDigest)) {
      return {
        ...base,
        anchored: true,
        active,
        expectedContentHash: commitment.contentHash,
        expectedCidDigest: commitment.cidDigest,
        verdict: 'content-mismatch',
        message: 'Commitment holds a cidDigest that is not a CIDv1-raw digest.',
      };
    }

    const cid = cidV1RawFromDigest(commitment.cidDigest);
    const bytes = await fetchFromGateway(gateway, cid, signal);
    const sha = cidDigest(bytes);
    const keccak = keccak256(bytes);
    const keccakMatches = keccak === commitment.contentHash;
    const sha256Matches = sha === commitment.cidDigest;

    let verdict: VerifyVerdict;
    if (!keccakMatches || !sha256Matches) verdict = 'content-mismatch';
    else if (!active) verdict = 'retracted';
    else verdict = 'verified';

    return {
      ...base,
      cid,
      bytesLength: bytes.length,
      computedContentHash: keccak,
      computedCidDigest: sha,
      expectedContentHash: commitment.contentHash,
      expectedCidDigest: commitment.cidDigest,
      keccakMatches,
      sha256Matches,
      anchored: true,
      active,
      verdict,
      ...(verdict === 'retracted'
        ? { message: 'Content matches, but this memory was retracted on-chain.' }
        : {}),
    };
  } catch (error) {
    return { ...base, verdict: 'error', message: toUiError(error).message };
  }
}

/**
 * Verify by CID alone: fetch bytes, compute both digests. The chain holds
 * digests, not CIDs — without a commitment hash there is nothing to compare
 * against, so the verdict explains exactly that (honest UI, no fake pass).
 */
export async function verifyByCid(args: {
  cid: string;
  gateway: string;
  signal?: AbortSignal;
}): Promise<VerifyResult> {
  const { cid, gateway, signal } = args;
  const base = { ...emptyResult('cid'), cid };

  const expectedDigest = cidV1RawToDigest(cid);
  if (expectedDigest === null) {
    return {
      ...base,
      verdict: 'error',
      message:
        'Not a CIDv1 raw (sha2-256) CID. Only raw CIDv1s can match on-chain commitments.',
    };
  }

  try {
    const bytes = await fetchFromGateway(gateway, cid, signal);
    const sha = cidDigest(bytes);
    const sha256Matches = sha === expectedDigest;
    return {
      ...base,
      bytesLength: bytes.length,
      computedContentHash: keccak256(bytes),
      computedCidDigest: sha,
      expectedCidDigest: expectedDigest,
      sha256Matches,
      verdict: sha256Matches ? 'not-anchored' : 'content-mismatch',
      message: sha256Matches
        ? 'Bytes match this CID. To prove long-term memory, search the commitment by its hash (Timeline) — a CID alone is not an on-chain commitment.'
        : 'Fetched bytes do NOT hash to this CID.',
    };
  } catch (error) {
    return { ...base, verdict: 'error', message: toUiError(error).message };
  }
}

export function readerFor(
  client: PublicClient,
  registryAddress: Address,
): CommitmentReader {
  return makeReader(client, registryAddress);
}

// Re-export for callers that only have a commitment struct.
export { commitmentHash, cidDigest };

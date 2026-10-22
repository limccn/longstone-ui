/**
 * PS-4 regression: expected digests are chain values.
 *
 * `verifyByCommitmentHash` must compare fetched bytes against the digests it
 * reads through `CommitmentReader` — the caller cannot supply them, and there
 * is no injectable hash function. A gateway that swaps the bytes therefore
 * yields `content-mismatch`, never `verified`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keccak256, type PublicClient } from 'viem';
import {
  cidDigest,
  cidV1Raw,
  commitmentHash,
  type Commitment,
} from '@limccn/menhir-core';
import {
  verifyByCommitmentHash,
  verifyCommitment,
  type CommitmentReader,
} from '../src/index';

const OWNER = '0x1111111111111111111111111111111111111111' as const;
const original = new TextEncoder().encode(
  '{"format":"text.v0","text":"the real memory"}',
);
const substituted = new TextEncoder().encode(
  '{"format":"text.v0","text":"substituted bytes"}',
);

const expectedContentHash = keccak256(original);
const expectedCidDigest = cidDigest(original);
const expectedCid = cidV1Raw(original);
const hash = commitmentHash({
  owner: OWNER,
  contentHash: expectedContentHash,
  cidDigest: expectedCidDigest,
  signer: OWNER,
  blockHeight: 1n,
  op: 0,
  prev: `0x${'00'.repeat(32)}`,
});

/** Stub chain reader: the commitment digests are the on-chain values. */
function chainReader(): CommitmentReader {
  const commitment: Commitment = {
    owner: OWNER,
    contentHash: expectedContentHash,
    cidDigest: expectedCidDigest,
    signer: OWNER,
    blockHeight: 1n,
    op: 0,
    prev: `0x${'00'.repeat(32)}`,
  };
  return {
    getCommitment: async () => commitment,
    isDeep: async () => true,
    isActive: async () => true,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyByCommitmentHash — chain digests are the authority', () => {
  it('returns content-mismatch when the gateway substitutes the bytes', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(url).toBe(`https://gw.example.org/ipfs/${expectedCid}`);
      return new Response(substituted as unknown as BodyInit, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await verifyByCommitmentHash({
      hash,
      reader: chainReader(),
      gateway: 'https://gw.example.org/ipfs',
    });

    // Expectations came from the reader (chain), not from the bytes.
    expect(result.expectedContentHash).toBe(expectedContentHash);
    expect(result.expectedCidDigest).toBe(expectedCidDigest);
    // The substituted bytes hash to something else, and the verdict says so.
    expect(result.computedContentHash).toBe(keccak256(substituted));
    expect(result.computedCidDigest).toBe(cidDigest(substituted));
    expect(result.keccakMatches).toBe(false);
    expect(result.sha256Matches).toBe(false);
    expect(result.verdict).toBe('content-mismatch');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

const REGISTRY = `0x${'55'.repeat(20)}` as const;

/** Minimal chain client: the wrapper must read every expected value through it. */
function registryClient(): {
  client: PublicClient;
  calls: Array<{ address: string; functionName: string }>;
} {
  const calls: Array<{ address: string; functionName: string }> = [];
  const commitment: Commitment = {
    owner: OWNER,
    contentHash: expectedContentHash,
    cidDigest: expectedCidDigest,
    signer: OWNER,
    blockHeight: 1n,
    op: 0,
    prev: `0x${'00'.repeat(32)}`,
  };
  const client = {
    async readContract(args: { address: string; functionName: string }) {
      calls.push({ address: args.address, functionName: args.functionName });
      if (args.functionName === 'isDeep') return true;
      if (args.functionName === 'isActive') return true;
      if (args.functionName === 'getCommitment') return commitment;
      throw new Error(`unexpected readContract call: ${args.functionName}`);
    },
  };
  return { client: client as unknown as PublicClient, calls };
}

describe('verifyCommitment — the shell-facing API', () => {
  it('reads expected digests through the registry client and rejects substituted bytes', async () => {
    const { client, calls } = registryClient();
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(url).toBe(`https://gw.example.org/ipfs/${expectedCid}`);
      return new Response(substituted as unknown as BodyInit, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await verifyCommitment({
      hash,
      client,
      registryAddress: REGISTRY,
      gateway: 'https://gw.example.org/ipfs',
    });

    // Expected digests came from the chain client, not from the caller.
    expect(result.expectedContentHash).toBe(expectedContentHash);
    expect(result.expectedCidDigest).toBe(expectedCidDigest);
    // The substituted bytes hash to something else, and the verdict says so.
    expect(result.computedContentHash).toBe(keccak256(substituted));
    expect(result.computedCidDigest).toBe(cidDigest(substituted));
    expect(result.keccakMatches).toBe(false);
    expect(result.sha256Matches).toBe(false);
    expect(result.verdict).toBe('content-mismatch');

    expect(calls).toContainEqual({ address: REGISTRY, functionName: 'getCommitment' });
    expect(calls.every((call) => call.address === REGISTRY)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

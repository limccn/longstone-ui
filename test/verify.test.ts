import { describe, expect, it, vi } from 'vitest';
import { keccak256 } from 'viem';
import { cidDigest, cidV1Raw, cidV1RawFromDigest, commitmentHash, type Commitment } from '@menhir/core';
import {
  verifyByCid,
  verifyByCommitmentHash,
  type CommitmentReader,
} from '../src/verify/verify';

const bytes = new TextEncoder().encode('{"format":"text.v0","text":"hello memory"}');
const digest = cidDigest(bytes);
const cid = cidV1Raw(bytes);
// The commitment stores keccak256 of the same bytes; the test must use the
// real digest, not a placeholder, or the happy path can never verify.
const contentHash = keccak256(bytes);

/** In-memory gateway serving exactly one CID. */
function gatewayWith(fixtureCid: string, fixtureBytes: Uint8Array) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith(`/${fixtureCid}`)) {
      // TS 7's DOM lib narrows Uint8Array to ArrayBufferLike; a Response body
      // accepts the same bytes at runtime.
      return new Response(fixtureBytes as unknown as BodyInit, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

function readerFor(overrides: Partial<CommitmentReader> = {}): CommitmentReader {
  const c: Commitment = {
    owner: '0x1111111111111111111111111111111111111111',
    contentHash,
    cidDigest: digest,
    signer: '0x1111111111111111111111111111111111111111',
    blockHeight: 1n,
    op: 0,
    prev: `0x${'00'.repeat(32)}`,
  };
  return {
    getCommitment: async () => c,
    isDeep: async () => true,
    isActive: async () => true,
    ...overrides,
  };
}

const HASH = commitmentHash({
  owner: '0x1111111111111111111111111111111111111111',
  contentHash,
  cidDigest: digest,
  signer: '0x1111111111111111111111111111111111111111',
  blockHeight: 1n,
  op: 0,
  prev: `0x${'00'.repeat(32)}`,
});

describe('verifyByCommitmentHash — verdict matrix', () => {
  it('verifies when both digests match and the memory is active', async () => {
    vi.stubGlobal('fetch', gatewayWith(cid, bytes));
    const result = await verifyByCommitmentHash({
      hash: HASH,
      reader: readerFor(),
      gateway: 'https://gw.example.org/ipfs',
    });
    expect(result.verdict).toBe('verified');
    expect(result.keccakMatches).toBe(true);
    expect(result.sha256Matches).toBe(true);
    expect(result.anchored).toBe(true);
    expect(result.cid).toBe(cid);
    vi.unstubAllGlobals();
  });

  it('reports retracted when digests match but isActive is false', async () => {
    vi.stubGlobal('fetch', gatewayWith(cid, bytes));
    const result = await verifyByCommitmentHash({
      hash: HASH,
      reader: readerFor({ isActive: async () => false }),
      gateway: 'https://gw.example.org/ipfs',
    });
    expect(result.verdict).toBe('retracted');
    expect(result.active).toBe(false);
    expect(result.keccakMatches).toBe(true);
    vi.unstubAllGlobals();
  });

  it('reports not-anchored for an unknown hash (no gateway call)', async () => {
    const fetchSpy = gatewayWith(cid, bytes);
    vi.stubGlobal('fetch', fetchSpy);
    const result = await verifyByCommitmentHash({
      hash: HASH,
      reader: readerFor({ isDeep: async () => false }),
      gateway: 'https://gw.example.org/ipfs',
    });
    expect(result.verdict).toBe('not-anchored');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('detects tampered bytes (content-mismatch)', async () => {
    const tampered = new TextEncoder().encode('evil bytes');
    vi.stubGlobal('fetch', gatewayWith(cid, tampered));
    const result = await verifyByCommitmentHash({
      hash: HASH,
      reader: readerFor(),
      gateway: 'https://gw.example.org/ipfs',
    });
    expect(result.verdict).toBe('content-mismatch');
    expect(result.keccakMatches).toBe(false);
    expect(result.sha256Matches).toBe(false);
    vi.unstubAllGlobals();
  });

  it('surfaces gateway failures as a typed error verdict', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 502 }));
    const result = await verifyByCommitmentHash({
      hash: HASH,
      reader: readerFor(),
      gateway: 'https://gw.example.org/ipfs',
    });
    expect(result.verdict).toBe('error');
    expect(result.message).toContain('502');
    vi.unstubAllGlobals();
  });
});

describe('verifyByCid — honesty semantics', () => {
  it('confirms CID bytes but refuses to fake an on-chain verdict', async () => {
    vi.stubGlobal('fetch', gatewayWith(cid, bytes));
    const result = await verifyByCid({ cid, gateway: 'https://gw.example.org/ipfs' });
    expect(result.sha256Matches).toBe(true);
    expect(result.anchored).toBe(false);
    expect(result.verdict).toBe('not-anchored');
    expect(result.message).toContain('not an on-chain commitment');
    vi.unstubAllGlobals();
  });

  it('rejects non-CIDv1-raw input before fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await verifyByCid({
      cid: 'QmSomeCidV0',
      gateway: 'https://gw.example.org/ipfs',
    });
    expect(result.verdict).toBe('error');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('detects bytes that do not hash to the CID', async () => {
    vi.stubGlobal('fetch', gatewayWith(cid, new TextEncoder().encode('different')));
    const result = await verifyByCid({ cid, gateway: 'https://gw.example.org/ipfs' });
    expect(result.verdict).toBe('content-mismatch');
    vi.unstubAllGlobals();
  });

  it('derives the same CID from the digest', () => {
    expect(cidV1RawFromDigest(digest)).toBe(cid);
    expect(cidV1Raw(bytes)).toBe(cid);
  });
});

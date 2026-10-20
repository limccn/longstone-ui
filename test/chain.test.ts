import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Log,
} from 'viem';
import { memoryRegistryAbi, type Commitment } from '@limccn/menhir-core';
import { decodeLog, findDeployBlock, isSignerRecord, scanRange } from '../src/chain/registry';

const REGISTRY = '0x4e6787a21acf21030d3b908b6160d0e09cd441a9' as `0x${string}`;
const OWNER = '0x1111111111111111111111111111111111111111' as const;

const commitment: Commitment = {
  owner: OWNER,
  contentHash: `0x${'aa'.repeat(32)}`,
  cidDigest: `0x${'bb'.repeat(32)}`,
  signer: OWNER,
  blockHeight: 42n,
  op: 0,
  prev: `0x${'00'.repeat(32)}`,
};
const COMMIT_HASH = `0x${'cd'.repeat(32)}` as `0x${string}`;

const COMMITMENT_COMPONENTS = [
  { name: 'owner', type: 'address' },
  { name: 'contentHash', type: 'bytes32' },
  { name: 'cidDigest', type: 'bytes32' },
  { name: 'signer', type: 'address' },
  { name: 'blockHeight', type: 'uint64' },
  { name: 'op', type: 'uint8' },
  { name: 'prev', type: 'bytes32' },
] as const;

function makeLog(
  eventName: 'MemoryCommitted' | 'MemoryRetracted' | 'SignerUpdated',
  args: Record<string, unknown>,
  overrides: Partial<Log> = {},
): Log {
  // Topics come from the ABI itself so fixtures can never drift from the
  // contract; non-indexed data is encoded with the same param shapes.
  const topics = encodeEventTopics({
    abi: memoryRegistryAbi,
    eventName,
    args: args as never,
  });

  let data: `0x${string}`;
  if (eventName === 'MemoryCommitted') {
    data = encodeAbiParameters(
      [
        { name: 'commitment', type: 'tuple', components: COMMITMENT_COMPONENTS },
        { name: 'tags', type: 'bytes32[]' },
      ],
      [args['commitment'] as Commitment, args['tags'] as `0x${string}`[]],
    );
  } else if (eventName === 'MemoryRetracted') {
    data = encodeAbiParameters(
      [{ name: 'replacedBy', type: 'bytes32' }],
      [args['replacedBy'] as `0x${string}`],
    );
  } else {
    data = encodeAbiParameters(
      [{ name: 'roles', type: 'uint256' }],
      [args['roles'] as bigint],
    );
  }

  return {
    address: REGISTRY,
    blockHash: `0x${'00'.repeat(32)}`,
    blockNumber: 10n,
    data,
    logIndex: 0,
    removed: false,
    topics,
    transactionHash: `0x${'ee'.repeat(32)}`,
    transactionIndex: 0,
    ...overrides,
  } as Log;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decodeLog', () => {
  it('decodes MemoryCommitted into a record with tags', () => {
    const tagDeep = `0x${Buffer.from('layer:deep', 'utf8').toString('hex').padEnd(64, '0')}` as `0x${string}`;
    const log = makeLog('MemoryCommitted', {
      owner: OWNER,
      contentHash: commitment.contentHash,
      commitmentHash: COMMIT_HASH,
      commitment,
      tags: [tagDeep],
    });
    const record = decodeLog(log);
    expect(record).not.toBeNull();
    expect(isSignerRecord(record!)).toBe(false);
    const memory = record as Exclude<typeof record, null>;
    if (isSignerRecord(memory)) throw new Error('unreachable');
    expect(memory.kind).toBe('committed');
    expect(memory.commitmentHash).toBe(COMMIT_HASH);
    expect(memory.owner).toBe(OWNER);
    expect(memory.tags).toEqual(['layer:deep']);
    expect(memory.commitment?.blockHeight).toBe(42n);
  });

  it('decodes MemoryRetracted and drops the zero replacedBy', () => {
    const log = makeLog('MemoryRetracted', {
      commitmentHash: COMMIT_HASH,
      by: OWNER,
      replacedBy: `0x${'00'.repeat(32)}`,
    });
    const record = decodeLog(log);
    if (record === null || isSignerRecord(record)) throw new Error('bad record');
    expect(record.kind).toBe('retracted');
    expect(record.replacedBy).toBeUndefined();
    expect(record.by).toBe(OWNER);
  });

  it('keeps a nonzero replacedBy', () => {
    const successor = `0x${'12'.repeat(32)}` as `0x${string}`;
    const log = makeLog('MemoryRetracted', {
      commitmentHash: COMMIT_HASH,
      by: OWNER,
      replacedBy: successor,
    });
    const record = decodeLog(log);
    if (record === null || isSignerRecord(record)) throw new Error('bad record');
    expect(record.replacedBy).toBe(successor);
  });

  it('decodes SignerUpdated as an ACL record', () => {
    const log = makeLog('SignerUpdated', {
      owner: OWNER,
      signer: '0x3333333333333333333333333333333333333333',
      roles: 3n,
    });
    const record = decodeLog(log);
    expect(record).not.toBeNull();
    expect(isSignerRecord(record!)).toBe(true);
    if (!isSignerRecord(record!)) throw new Error('unreachable');
    expect(record.roles).toBe(3n);
  });

  it('ignores unknown logs instead of throwing', () => {
    const log: Log = {
      address: REGISTRY,
      blockHash: null,
      blockNumber: 1n,
      data: '0xdeadbeef',
      logIndex: 0,
      removed: false,
      topics: [],
      transactionHash: null,
      transactionIndex: 0,
    } as Log;
    expect(decodeLog(log)).toBeNull();
  });
});

describe('scanRange — chunked scan with retry/halving', () => {
  function clientWith(
    getLogs: (args: {
      address: `0x${string}`;
      fromBlock: bigint;
      toBlock: bigint;
    }) => Promise<Log[]>,
  ) {
    return { getLogs } as never;
  }

  it('scans the whole range in chunks and reports progress', async () => {
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = clientWith(async (args) => {
      calls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
      return [];
    });
    const progress: bigint[] = [];
    const result = await scanRange({
      client,
      registryAddress: REGISTRY,
      fromBlock: 0n,
      toBlock: 25_000n,
      chunkSize: 10_000,
      onProgress: (done) => progress.push(done),
    });
    expect(calls).toEqual([
      { fromBlock: 0n, toBlock: 9_999n },
      { fromBlock: 10_000n, toBlock: 19_999n },
      { fromBlock: 20_000n, toBlock: 25_000n },
    ]);
    expect(progress.at(-1)).toBe(25_001n);
    expect(result.scannedTo).toBe(25_000n);
  });

  it('halves the chunk on a 429 and keeps going', async () => {
    let failedOnce = false;
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = clientWith(async (args) => {
      calls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
      if (!failedOnce && args.toBlock - args.fromBlock > 5_000n) {
        failedOnce = true;
        throw new Error('429 Too Many Requests');
      }
      return [];
    });

    vi.useFakeTimers();
    try {
      const run = scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 10_000n,
        chunkSize: 10_000,
      });
      await vi.runAllTimersAsync();
      const result = await run;
      expect(failedOnce).toBe(true);
      expect(result.scannedTo).toBe(10_000n);
      // After halving, the retry window is at most 5,000 blocks.
      expect(calls[1]!.toBlock - calls[1]!.fromBlock).toBeLessThanOrEqual(4_999n);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adopts the provider-stated block cap instead of failing', async () => {
    // Mirrors the real Base Sepolia RPC: "eth_getLogs is limited to a 200
    // range". The old matcher only knew about 429s, so this was an
    // unrecoverable first-load failure in production.
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = clientWith(async (args) => {
      calls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
      if (args.toBlock - args.fromBlock + 1n > 200n) {
        throw new Error('eth_getLogs is limited to a 200 range');
      }
      return [];
    });

    vi.useFakeTimers();
    try {
      const run = scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 1_000n,
        chunkSize: 10_000,
      });
      await vi.runAllTimersAsync();
      const result = await run;

      expect(result.scannedTo).toBe(1_000n);
      // The retried window honours the stated cap exactly.
      expect(calls[1]!.toBlock - calls[1]!.fromBlock + 1n).toBe(200n);
      // And every window after the first failure fits.
      for (const call of calls.slice(1)) {
        expect(call.toBlock - call.fromBlock + 1n).toBeLessThanOrEqual(200n);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not read status digits inside a block number as a 429', async () => {
    // Range-cap errors can quote the failing window. Block 48314429 contains
    // "429"; matching that would take the rate-limit branch, halve instead of
    // adopting the provider's stated 200-block cap, and mask the real cause.
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = clientWith(async (args) => {
      calls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
      if (args.toBlock - args.fromBlock + 1n > 200n) {
        throw new Error('eth_getLogs is limited to a 200 range (48314429..48315428)');
      }
      return [];
    });

    vi.useFakeTimers();
    try {
      const run = scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 1_000n,
        chunkSize: 10_000,
      });
      await vi.runAllTimersAsync();
      await run;

      // The stated cap is adopted on the first retry, not halved repeatedly.
      expect(calls[1]!.toBlock - calls[1]!.fromBlock + 1n).toBe(200n);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shrinks on an opaque HTTP rejection that names no range', async () => {
    // Base Sepolia can reject an oversized eth_getLogs at the HTTP layer with
    // "Received an unexpected status code". The text states neither a cap nor
    // a range; treating it as non-retryable made first load fail outright.
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = clientWith(async (args) => {
      calls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
      if (args.toBlock - args.fromBlock + 1n > 200n) {
        const error = new Error('HTTP request failed.') as Error & {
          status: number;
          details: string;
        };
        error.status = 400;
        error.details = 'Received an unexpected status code from https://sepolia.base.org';
        throw error;
      }
      return [];
    });

    vi.useFakeTimers();
    try {
      const run = scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 4_019n,
        chunkSize: 4_020,
      });
      await vi.runAllTimersAsync();
      const result = await run;

      expect(result.scannedTo).toBe(4_019n);
      const spans = calls.map((c) => c.toBlock - c.fromBlock + 1n);
      // 4020 -> 2010 -> 1005 -> 502 -> 251 -> 125, then success.
      expect(spans.slice(0, 5)).toEqual([4_020n, 2_010n, 1_005n, 502n, 251n]);
      expect(spans[5]).toBe(125n);
      expect(spans.slice(5).every((span) => span <= 125n)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still shrinks when the provider states no number', async () => {
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = clientWith(async (args) => {
      calls.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
      if (args.toBlock - args.fromBlock + 1n > 500n) {
        throw new Error('block range is too wide');
      }
      return [];
    });

    vi.useFakeTimers();
    try {
      const run = scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 2_000n,
        chunkSize: 2_000,
      });
      await vi.runAllTimersAsync();
      expect((await run).scannedTo).toBe(2_000n);
      expect(calls.length).toBeGreaterThan(1);
      // Halving is gradual: the retry of a failed window must ask for strictly
      // less, and the scan must converge on a size the provider accepts rather
      // than looping on the same oversized request. Windows *after* the first
      // success are all the converged size, so only the retry prefix shrinks.
      const windows = calls.map((c) => c.toBlock - c.fromBlock + 1n);
      expect(windows[0]).toBe(2_000n); // the initial, rejected request
      expect(windows[1]!).toBeLessThan(windows[0]!);
      expect(windows.slice(1).every((w) => w <= 1_000n)).toBe(true);
      expect(windows.at(-1)!).toBeLessThanOrEqual(500n);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails fast on a non-retryable error instead of exhausting retries', async () => {
    let attempts = 0;
    const client = clientWith(async () => {
      attempts += 1;
      throw new Error('execution reverted: not a log query problem');
    });
    await expect(
      scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 10n,
        chunkSize: 10,
      }),
    ).rejects.toThrow('execution reverted');
    // One attempt, no sleeps burned on something that can never succeed.
    expect(attempts).toBe(1);
  });

  it('detects the deploy block by binary search and rejects an empty address', async () => {
    const DEPLOY = 500n;
    const probe = async (args: { address: `0x${string}`; blockNumber?: bigint }) => {
      const block = args.blockNumber ?? 0n;
      return block >= DEPLOY ? ('0x6080' as const) : ('0x' as const);
    };
    const found = await findDeployBlock({ getCode: probe } as never, REGISTRY, 1_000n);
    expect(found).toBe(DEPLOY);

    const empty = await findDeployBlock(
      { getCode: async () => '0x' } as never,
      REGISTRY,
      1_000n,
    );
    expect(empty).toBeNull();
  });

  it('propagates hard errors after retries are exhausted', async () => {
    const client = clientWith(async () => {
      throw new Error('boom');
    });
    vi.useFakeTimers();
    try {
      const run = scanRange({
        client,
        registryAddress: REGISTRY,
        fromBlock: 0n,
        toBlock: 10n,
        chunkSize: 10,
      });
      const assertion = expect(run).rejects.toThrow('boom');
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

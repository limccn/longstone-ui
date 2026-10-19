import {
  createPublicClient,
  decodeEventLog,
  http,
  type Log,
  type PublicClient,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { bytes32ToTag, memoryRegistryAbi, type Commitment } from '@menhir/core';
import type { MemoryEventRecord, SignerRecord } from '../state/derive';

export type { SignerRecord };

export interface ScanResult {
  records: MemoryEventRecord[];
  signers: SignerRecord[];
  scannedTo: bigint;
}

export function makePublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }),
  }) as PublicClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decode one registry log into a normalized record. Returns null for
 * unrelated logs (other contracts sharing the same address are impossible,
 * but topic filtering still guards against malformed data).
 */
export function decodeLog(log: Log): MemoryEventRecord | SignerRecord | null {
  if (
    log.blockNumber === null ||
    log.logIndex === null ||
    log.transactionHash === null ||
    log.topics.length === 0
  ) {
    return null;
  }

  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({
      abi: memoryRegistryAbi,
      data: log.data,
      topics: log.topics,
    });
  } catch {
    return null;
  }

  if (decoded.eventName === 'MemoryCommitted') {
    const args = decoded.args as {
      owner: `0x${string}`;
      contentHash: `0x${string}`;
      commitmentHash: `0x${string}`;
      commitment: Commitment;
      tags: readonly `0x${string}`[];
    };
    return {
      kind: 'committed',
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      owner: args.owner,
      contentHash: args.contentHash,
      commitmentHash: args.commitmentHash,
      commitment: args.commitment,
      tags: args.tags.map(bytes32ToTag),
    };
  }

  if (decoded.eventName === 'MemoryRetracted') {
    const args = decoded.args as {
      commitmentHash: `0x${string}`;
      by: `0x${string}`;
      replacedBy: `0x${string}`;
    };
    return {
      kind: 'retracted',
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      owner: '0x0000000000000000000000000000000000000000', // resolved at derive time
      commitmentHash: args.commitmentHash,
      ...(/^0x0+$/.test(args.replacedBy) ? {} : { replacedBy: args.replacedBy }),
      by: args.by,
    };
  }

  if (decoded.eventName === 'SignerUpdated') {
    const args = decoded.args as {
      owner: `0x${string}`;
      signer: `0x${string}`;
      roles: bigint;
    };
    return {
      owner: args.owner,
      signer: args.signer,
      roles: args.roles,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
    };
  }

  return null;
}

export function isSignerRecord(
  value: MemoryEventRecord | SignerRecord,
): value is SignerRecord {
  return 'roles' in value;
}

export interface ScanArgs {
  client: PublicClient;
  registryAddress: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: number;
  onProgress?: (done: bigint, total: bigint) => void;
}

const MAX_RETRIES = 4;

/**
 * Chunked getLogs scan with exponential backoff + chunk halving on 429
 * (longstone §5 parity). Never uses the `pending` tag (M1-7).
 */
export async function scanRange(args: ScanArgs): Promise<ScanResult> {
  const { client, registryAddress, fromBlock, toBlock, onProgress } = args;
  let chunkSize = args.chunkSize;

  const records: MemoryEventRecord[] = [];
  const signers: SignerRecord[] = [];
  const total = toBlock >= fromBlock ? toBlock - fromBlock + 1n : 0n;
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    let logs: Log[] | null = null;
    let backoff = 400;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      // Recompute the window every attempt: halving the chunk must actually
      // shrink the range being retried, otherwise a 429 on an oversized range
      // repeats the same oversized request.
      const span = BigInt(Math.max(1, chunkSize));
      const end = cursor + span - 1n > toBlock ? toBlock : cursor + span - 1n;
      try {
        logs = (await client.getLogs({
          address: registryAddress,
          fromBlock: cursor,
          toBlock: end,
        })) as Log[];
        onProgress?.(end - fromBlock + 1n, total);
        cursor = end + 1n;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_RETRIES) throw error;
        // Rate limits and oversized ranges both benefit from a smaller window.
        if (/429|rate limit|too many|block range|range is too/i.test(message)) {
          chunkSize = Math.max(1_000, Math.floor(chunkSize / 2));
        }
        await sleep(backoff);
        backoff *= 2;
      }
    }
    if (logs === null) throw new Error('log scan failed');

    for (const log of logs) {
      const decoded = decodeLog(log);
      if (decoded === null) continue;
      if (isSignerRecord(decoded)) signers.push(decoded);
      else records.push(decoded);
    }
  }

  return { records, signers, scannedTo: toBlock };
}

export { memoryRegistryAbi };

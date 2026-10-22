import {
  createPublicClient,
  decodeEventLog,
  http,
  type Log,
  type PublicClient,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { bytes32ToTag, memoryRegistryAbi, type Commitment } from '@limccn/menhir-core';
import type { MemoryEventRecord, SignerRecord } from '../state/derive.js';

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

const MAX_RETRIES = 6;

/** Provider error text can land in any of these fields depending on transport. */
function errorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  else parts.push(String(error));
  const detail = error as { details?: unknown; shortMessage?: unknown; cause?: unknown };
  if (typeof detail.details === 'string') parts.push(detail.details);
  if (typeof detail.shortMessage === 'string') parts.push(detail.shortMessage);
  if (detail.cause instanceof Error) parts.push(detail.cause.message);
  return parts.join(' | ');
}

// Numeric statuses must be word-bounded: a block number like 48314429 or
// 48310502 contains "429"/"502" as a substring, and classifying a range-cap
// error as transient would retry the same oversized window until it fails.
const RATE_LIMIT = /\b429\b|rate.?limit|too many requests/i;
/**
 * A provider-imposed range cap. The wording varies by provider — Base's public
 * RPC says "eth_getLogs is limited to a 200 range", others say "block range is
 * too large" or "exceeds max block range". The failure is not transient: it
 * will never succeed for this window, so the fix is a smaller window, not a
 * longer wait.
 */
const RANGE_CAP = /limited to|block range|range is too|too (?:large|wide|many blocks)|exceeds?/i;

/**
 * Pull the provider's stated block limit out of the message when it gives one
 * ("limited to a 200 range" -> 200). Returns null when no number is stated.
 */
function statedRangeLimit(message: string): number | null {
  const match = /(?:limited to|exceeds|maximum of|max of)\s*(?:a\s+)?(\d{1,7})/i.exec(message);
  if (match?.[1] === undefined) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** HTTP status carried by a transport-level error, if any. */
function httpStatus(error: unknown, depth = 0): number | null {
  if (depth > 4 || error === null || typeof error !== 'object') return null;
  const candidate = error as { status?: unknown; cause?: unknown };
  if (typeof candidate.status === 'number') return candidate.status;
  return httpStatus(candidate.cause, depth + 1);
}

/**
 * Some providers reject an oversized getLogs at the HTTP layer with no range
 * wording at all — Base Sepolia answers "Received an unexpected status code
 * from https://sepolia.base.org". That is a range rejection in disguise, not a
 * reason to give up, but only when the status is a payload/parameter rejection;
 * auth and routing failures (401/403/404) can never be fixed by shrinking.
 */
const HTTP_REJECTION = /unexpected status code|http (?:status|error)/i;

function isRangeShapedHttpRejection(error: unknown, message: string): boolean {
  const status = httpStatus(error);
  if (status === 400 || status === 413 || status === 414 || status === 422) return true;
  if (status !== null) return false;
  return HTTP_REJECTION.test(message);
}

/**
 * Chunked getLogs scan with exponential backoff + chunk reduction on rate
 * limits *and* provider range caps (longstone §5 parity). Never uses the
 * `pending` tag (M1-7).
 *
 * The provider's own block-range cap is discovered at runtime rather than
 * assumed: Base Sepolia's public RPC allows 200 blocks, far below what a
 * first-load scan needs. Once discovered, the smaller size is adopted for the
 * rest of the scan instead of being re-learned chunk by chunk.
 */
export async function scanRange(args: ScanArgs): Promise<ScanResult> {
  const { client, registryAddress, fromBlock, toBlock, onProgress } = args;
  let chunkSize = Math.max(1, args.chunkSize);

  const records: MemoryEventRecord[] = [];
  const signers: SignerRecord[] = [];
  const total = toBlock >= fromBlock ? toBlock - fromBlock + 1n : 0n;
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    let logs: Log[] | null = null;
    let backoff = 400;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      // Recompute the window every attempt: shrinking the chunk must actually
      // shrink the range being retried, otherwise an oversized range repeats
      // the same oversized request.
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
        if (attempt === MAX_RETRIES) throw error;
        const message = errorText(error);
        const requested = Number(end - cursor + 1n);
        if (RATE_LIMIT.test(message)) {
          chunkSize = Math.max(1, Math.floor(chunkSize / 2));
        } else if (RANGE_CAP.test(message)) {
          // Adopt the provider's stated limit when it gives one, with headroom
          // for the next block being included; otherwise halve. Never shrink
          // below 1, and always make progress even if the cap is smaller than
          // one block's worth (a single-block window is the floor).
          const stated = statedRangeLimit(message);
          const next =
            stated !== null ? stated : Math.floor(chunkSize / 2);
          chunkSize = Math.max(1, Math.min(requested - 1, next));
        } else if (isRangeShapedHttpRejection(error, message)) {
          // No numeric cap to adopt, but the transport rejected the request:
          // halve and try again rather than failing a first load that would
          // succeed with a smaller window.
          chunkSize = Math.max(1, Math.floor(chunkSize / 2));
        } else if (!/timeout|timed out|network|fetch failed|ECONNRESET|\b(?:502|503|504)\b/i.test(message)) {
          // Unknown and non-transient: fail fast rather than burn retries.
          throw error;
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

/**
 * Find the block a registry was deployed at, so a scan starts there instead of
 * at genesis.
 *
 * Scanning from block 0 on Base Sepolia is not merely slow: the range spans
 * ~48M blocks and every public provider rejects it. The deploy block is the
 * true lower bound for this contract's logs, so discovering it removes both
 * problems. `eth_getCode` at a historical block is cheap and universally
 * supported, unlike block-range-limited log queries.
 *
 * Returns null when the address has no code at the tip (not deployed, wrong
 * chain, or a typo) — callers surface that as a configuration error rather
 * than scanning a range that can never contain anything.
 */
export async function findDeployBlock(
  client: PublicClient,
  registryAddress: `0x${string}`,
  latestBlock: bigint,
): Promise<bigint | null> {
  const codeAt = async (block: bigint): Promise<boolean> => {
    const code = await client.getCode({ address: registryAddress, blockNumber: block });
    return code !== undefined && code !== '0x';
  };

  if (!(await codeAt(latestBlock))) return null;

  // Invariant: no code at `lo`, code at `hi`. Narrow until adjacent.
  let lo = 0n;
  let hi = latestBlock;
  while (lo + 1n < hi) {
    const mid = (lo + hi) / 2n;
    if (await codeAt(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export { memoryRegistryAbi };

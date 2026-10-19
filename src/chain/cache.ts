import { createStore, del, get, set } from 'idb-keyval';
import type { MemoryEventRecord } from '../state/derive';
import type { SignerRecord } from './registry';

export interface CachedScan {
  registryAddress: `0x${string}`;
  chainId: number;
  scannedTo: bigint;
  records: MemoryEventRecord[];
  signers: SignerRecord[];
  updatedAt: number;
}

const store = createStore('longstone-ui', 'scan-cache');

function key(registryAddress: string, chainId: number): string {
  return `${chainId}:${registryAddress.toLowerCase()}`;
}

/** bigint-safe JSON encoding for the cache entries. */
function encode(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, v: unknown) => (typeof v === 'bigint' ? { __bigint: v.toString() } : v)),
  );
}

function decode<T>(value: unknown): T {
  return JSON.parse(
    JSON.stringify(value).replace(
      /"\{"__bigint":"(\d+)"\}"/g,
      (_, n: string) => n,
    ),
    (_, v: unknown) => {
      if (
        typeof v === 'object' &&
        v !== null &&
        '__bigint' in v &&
        typeof (v as { __bigint: unknown }).__bigint === 'string'
      ) {
        return BigInt((v as { __bigint: string }).__bigint);
      }
      return v;
    },
  ) as T;
}

export async function readCache(
  registryAddress: string,
  chainId: number,
): Promise<CachedScan | null> {
  try {
    const raw = await get<unknown>(key(registryAddress, chainId), store);
    if (raw === undefined || raw === null) return null;
    const decoded = decode<CachedScan>(raw);
    if (
      decoded.registryAddress.toLowerCase() !== registryAddress.toLowerCase() ||
      decoded.chainId !== chainId
    ) {
      return null;
    }
    return decoded;
  } catch {
    // Private windows / quota errors: no cache, in-memory only.
    return null;
  }
}

export async function writeCache(scan: CachedScan): Promise<void> {
  try {
    await set(key(scan.registryAddress, scan.chainId), encode(scan), store);
  } catch {
    // Degrade to in-memory cache silently (Safari private mode etc.).
  }
}

export async function clearCache(
  registryAddress: string,
  chainId: number,
): Promise<void> {
  try {
    await del(key(registryAddress, chainId), store);
  } catch {
    // ignore
  }
}

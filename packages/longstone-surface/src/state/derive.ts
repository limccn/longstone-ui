/**
 * Derivation rules — parity with menhir spec §2.6 and @limccn/menhir-core.
 * Single definition inside the UI; consumes decoded events, pure function.
 */
import type { Commitment } from '@limccn/menhir-core';

export interface MemoryEventRecord {
  kind: 'committed' | 'retracted';
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  owner: `0x${string}`;
  contentHash?: `0x${string}`;
  commitmentHash: `0x${string}`;
  commitment?: Commitment;
  tags?: string[];
  replacedBy?: `0x${string}`;
  by?: `0x${string}`;
}

export interface MemoryState {
  commitmentHash: `0x${string}`;
  commitment: Commitment | undefined;
  owner: `0x${string}`;
  contentHash: `0x${string}` | undefined;
  tags: string[];
  /** deep = MemoryCommitted seen */
  deep: boolean;
  /** active = deep ∧ ¬retracted-seen */
  active: boolean;
  retractedAt: bigint | null;
  replacedBy: `0x${string}` | null;
  committedAt: bigint;
  txHash: `0x${string}`;
}

/** Decoded `SignerUpdated` event (ACL management surface). */
export interface SignerRecord {
  owner: `0x${string}`;
  signer: `0x${string}`;
  roles: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/** Latest role mask per signer, for one owner. */
export interface SignerState {
  signer: `0x${string}`;
  roles: bigint;
  updatedAt: bigint;
  txHash: `0x${string}`;
}

export interface ChainIndex {
  /** commitmentHash → state */
  byHash: Map<`0x${string}`, MemoryState>;
  /** owner → ordered states (oldest first) */
  byOwner: Map<`0x${string}`, MemoryState[]>;
  /** raw signer events (ordered) */
  signers: SignerRecord[];
  latestBlock: bigint;
}

export const EMPTY_INDEX: ChainIndex = {
  byHash: new Map(),
  byOwner: new Map(),
  signers: [],
  latestBlock: 0n,
};

function sortRecords(records: readonly MemoryEventRecord[]): MemoryEventRecord[] {
  return [...records].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
}

/** Replays decoded events into a deterministic index. */
export function deriveIndex(
  records: readonly MemoryEventRecord[],
  latestBlock: bigint,
  signers: readonly SignerRecord[] = [],
): ChainIndex {
  const byHash = new Map<`0x${string}`, MemoryState>();

  for (const record of sortRecords(records)) {
    if (record.kind === 'committed') {
      if (byHash.has(record.commitmentHash)) continue; // duplicate commit impossible on-chain
      byHash.set(record.commitmentHash, {
        commitmentHash: record.commitmentHash,
        commitment: record.commitment,
        owner: record.owner,
        contentHash: record.contentHash,
        tags: record.tags ?? [],
        deep: true,
        active: true,
        retractedAt: null,
        replacedBy: null,
        committedAt: record.blockNumber,
        txHash: record.txHash,
      });
      continue;
    }
    const existing = byHash.get(record.commitmentHash);
    if (existing === undefined) continue; // retract for an unseen commit
    existing.active = false;
    existing.retractedAt = record.blockNumber;
    existing.replacedBy = record.replacedBy ?? null;
  }

  const byOwner = new Map<`0x${string}`, MemoryState[]>();
  for (const state of byHash.values()) {
    const list = byOwner.get(state.owner) ?? [];
    list.push(state);
    byOwner.set(state.owner, list);
  }
  for (const list of byOwner.values()) {
    list.sort((a, b) =>
      a.committedAt === b.committedAt
        ? 0
        : a.committedAt < b.committedAt
          ? -1
          : 1,
    );
  }

  return { byHash, byOwner, signers: sortSigners(signers), latestBlock };
}

function sortSigners(records: readonly SignerRecord[]): SignerRecord[] {
  return [...records].sort((a, b) =>
    a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
  );
}

/** Latest role mask per signer for one owner (event replay, last wins). */
export function signersForOwner(
  index: ChainIndex,
  owner: `0x${string}`,
): SignerState[] {
  const bySigner = new Map<`0x${string}`, SignerState>();
  for (const record of index.signers) {
    if (record.owner.toLowerCase() !== owner.toLowerCase()) continue;
    bySigner.set(record.signer, {
      signer: record.signer,
      roles: record.roles,
      updatedAt: record.blockNumber,
      txHash: record.txHash,
    });
  }
  return [...bySigner.values()];
}

export function statesForOwner(
  index: ChainIndex,
  owner: `0x${string}`,
): MemoryState[] {
  return index.byOwner.get(owner) ?? [];
}

export function predecessorOf(
  index: ChainIndex,
  state: MemoryState,
): MemoryState | undefined {
  const prev = state.commitment?.prev;
  if (prev === undefined || /^0x0+$/.test(prev)) return undefined;
  return index.byHash.get(prev);
}

export function successorOf(
  index: ChainIndex,
  state: MemoryState,
): MemoryState | undefined {
  return state.replacedBy === null
    ? undefined
    : index.byHash.get(state.replacedBy);
}

/** Filter helper: tag chips join with OR semantics. */
export function filterByTags(
  states: readonly MemoryState[],
  requiredTags: readonly string[],
): MemoryState[] {
  if (requiredTags.length === 0) return [...states];
  return states.filter((state) =>
    requiredTags.some((tag) => state.tags.includes(tag)),
  );
}

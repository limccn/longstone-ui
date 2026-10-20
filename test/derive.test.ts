import { describe, expect, it } from 'vitest';
import {
  deriveIndex,
  filterByTags,
  predecessorOf,
  signersForOwner,
  statesForOwner,
  successorOf,
  type MemoryEventRecord,
  type SignerRecord,
} from '../src/state/derive';
import type { Commitment } from '@limccn/menhir-core';

const OWNER = '0x1111111111111111111111111111111111111111' as const;
const OTHER = '0x2222222222222222222222222222222222222222' as const;

function tag32(tag: string): `0x${string}` {
  return `0x${Buffer.from(tag, 'utf8').toString('hex').padEnd(64, '0')}`;
}

let hashCounter = 0;
function hash(seed: string): `0x${string}` {
  hashCounter += 1;
  return `0x${seed.padStart(4, '0').repeat(16)}`.slice(0, 66) as `0x${string}`;
}

function commitment(partial: Partial<Commitment> = {}): Commitment {
  return {
    owner: OWNER,
    contentHash: ('0x' + 'aa'.repeat(32)) as `0x${string}`,
    cidDigest: ('0x' + 'bb'.repeat(32)) as `0x${string}`,
    signer: OWNER,
    blockHeight: 10n,
    op: 0,
    prev: ('0x' + '00'.repeat(32)) as `0x${string}`,
    ...partial,
  };
}

function committed(
  commitmentHash: `0x${string}`,
  blockNumber: bigint,
  extra: Partial<MemoryEventRecord> = {},
): MemoryEventRecord {
  return {
    kind: 'committed',
    blockNumber,
    logIndex: 0,
    txHash: (`0x${'11'.repeat(32)}`) as `0x${string}`,
    owner: OWNER,
    contentHash: ('0x' + 'aa'.repeat(32)) as `0x${string}`,
    commitmentHash,
    commitment: commitment(),
    tags: [],
    ...extra,
  };
}

function retracted(
  commitmentHash: `0x${string}`,
  blockNumber: bigint,
  replacedBy?: `0x${string}`,
  logIndex = 0,
): MemoryEventRecord {
  return {
    kind: 'retracted',
    blockNumber,
    logIndex,
    txHash: (`0x${'22'.repeat(32)}`) as `0x${string}`,
    owner: '0x0000000000000000000000000000000000000000',
    commitmentHash,
    ...(replacedBy === undefined ? {} : { replacedBy }),
  };
}

const h1 = hash('a1');
const h2 = hash('a2');
const h3 = hash('a3');

describe('deriveIndex — deep/active rules (menhir §2.6)', () => {
  it('marks seen commitments deep + active', () => {
    const index = deriveIndex([committed(h1, 5n)], 5n);
    const state = index.byHash.get(h1);
    expect(state?.deep).toBe(true);
    expect(state?.active).toBe(true);
    expect(state?.retractedAt).toBeNull();
  });

  it('retraction flips active but keeps deep (tombstone)', () => {
    const index = deriveIndex([committed(h1, 5n), retracted(h1, 6n)], 6n);
    const state = index.byHash.get(h1);
    expect(state?.deep).toBe(true);
    expect(state?.active).toBe(false);
    expect(state?.retractedAt).toBe(6n);
  });

  it('retraction before commit (log order) is ignored', () => {
    const index = deriveIndex([retracted(h1, 5n), committed(h1, 6n)], 6n);
    const state = index.byHash.get(h1);
    expect(state?.active).toBe(true);
  });

  it('orders records by block then logIndex, not array order', () => {
    const sameBlockRetract = retracted(h1, 7n, undefined, 3);
    const sameBlockCommit = committed(h1, 7n);
    const index = deriveIndex([sameBlockRetract, sameBlockCommit], 7n);
    // commit logIndex 0 < retract logIndex 3 → retraction applies
    expect(index.byHash.get(h1)?.active).toBe(false);
  });

  it('duplicate commit records are collapsed', () => {
    const index = deriveIndex([committed(h1, 5n), committed(h1, 6n)], 6n);
    expect(index.byHash.size).toBe(1);
    expect(index.byHash.get(h1)?.committedAt).toBe(5n);
  });

  it('groups by owner only', () => {
    const index = deriveIndex(
      [committed(h1, 5n), committed(h2, 5n, { owner: OTHER })],
      5n,
    );
    expect(statesForOwner(index, OWNER).map((s) => s.commitmentHash)).toEqual([h1]);
    expect(statesForOwner(index, OTHER).map((s) => s.commitmentHash)).toEqual([h2]);
  });
});

describe('predecessor/successor links', () => {
  it('resolves prev and replacedBy within the index', () => {
    const first = committed(h1, 5n);
    const secondCommitment = commitment({ prev: h1 });
    const second = committed(h2, 6n, { commitment: secondCommitment });
    const index = deriveIndex([first, second, retracted(h1, 7n, h2)], 7n);

    expect(predecessorOf(index, index.byHash.get(h2)!)?.commitmentHash).toBe(h1);
    expect(successorOf(index, index.byHash.get(h1)!)?.commitmentHash).toBe(h2);
  });

  it('zero prev means chain root', () => {
    const index = deriveIndex([committed(h1, 5n)], 5n);
    expect(predecessorOf(index, index.byHash.get(h1)!)).toBeUndefined();
  });

  it('successor is absent without replacedBy', () => {
    const index = deriveIndex([committed(h1, 5n), retracted(h1, 6n)], 6n);
    expect(successorOf(index, index.byHash.get(h1)!)).toBeUndefined();
  });
});

describe('tag filter — OR semantics', () => {
  const records = [
    committed(h1, 5n, { tags: ['layer:deep', 'topic:chain'] }),
    committed(h2, 6n, { tags: ['topic:chain'] }),
    committed(h3, 7n, { tags: ['topic:other'] }),
  ];

  it('returns everything with no filter', () => {
    const index = deriveIndex(records, 7n);
    expect(filterByTags(statesForOwner(index, OWNER), [])).toHaveLength(3);
  });

  it('matches any selected tag', () => {
    const index = deriveIndex(records, 7n);
    const matched = filterByTags(statesForOwner(index, OWNER), ['layer:deep', 'topic:other']);
    expect(matched.map((s) => s.commitmentHash).sort()).toEqual([h1, h3].sort());
  });
});

describe('signersForOwner', () => {
  const signer = '0x3333333333333333333333333333333333333333' as const;
  const records: SignerRecord[] = [
    { owner: OWNER, signer, roles: 1n, blockNumber: 3n, txHash: `0x${'33'.repeat(32)}` },
    { owner: OWNER, signer, roles: 3n, blockNumber: 9n, txHash: `0x${'44'.repeat(32)}` },
    {
      owner: OTHER,
      signer,
      roles: 2n,
      blockNumber: 10n,
      txHash: `0x${'55'.repeat(32)}`,
    },
  ];

  it('keeps the latest mask per signer per owner', () => {
    const index = deriveIndex([], 10n, records);
    const list = signersForOwner(index, OWNER);
    expect(list).toHaveLength(1);
    expect(list[0]?.roles).toBe(3n);
    expect(list[0]?.updatedAt).toBe(9n);
  });

  it('ignores other owners', () => {
    const index = deriveIndex([], 10n, records);
    expect(signersForOwner(index, OTHER)[0]?.roles).toBe(2n);
  });
});

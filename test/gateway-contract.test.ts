/**
 * Gateway contract conformance (longstone-ui v2, G1/G2).
 *
 * These were the two real drifts between the shipped UI and the gateway that
 * actually landed: the response field was `memories` (never sent) and every
 * non-2xx collapsed into one code.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  UiError,
  fetchFromGateway,
  fetchFromHisaishi,
  fetchStagedMemories,
  type MemoryRow,
} from '@limccn/longstone-surface';

const OWNER = `0x${'11'.repeat(20)}` as const;

function row(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    cid: 'bafkreitest',
    contentHash: `0x${'22'.repeat(32)}`,
    cidDigest: `0x${'33'.repeat(32)}`,
    owner: OWNER,
    tags: ['layer:deep'],
    status: 'staged',
    batchId: null,
    txHash: null,
    createdAt: 1_700_000_000_000,
    commitmentHash: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('G1 — the list route returns { rows }', () => {
  it('parses the pinned response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rows: [row()] }), { status: 200 })),
    );
    const rows = await fetchStagedMemories('https://gateway.test', OWNER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner).toBe(OWNER);
  });

  it('rejects the old { memories } shape instead of rendering an empty table', async () => {
    // The shipped UI read `memories`. A server that sent the wrong field made
    // every staging view look empty, which reads as "nothing staged" rather
    // than "the client is wrong".
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ memories: [row()] }), { status: 200 })),
    );
    await expect(fetchStagedMemories('https://gateway.test', OWNER)).rejects.toThrow(
      /expected \{ rows \}/,
    );
  });

  it('preserves a null commitmentHash rather than inventing one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ rows: [row({ commitmentHash: null })] }), { status: 200 }),
      ),
    );
    const rows = await fetchStagedMemories('https://gateway.test', OWNER);
    expect(rows[0]!.commitmentHash).toBeNull();
  });
});

describe('G2 — 404 is not an outage', () => {
  it('maps a gateway 404 to CONTENT_NOT_FOUND', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const error = (await fetchFromGateway('https://gw.test', 'bafkreimissing').catch(
      (e: unknown) => e,
    )) as UiError;
    expect(error).toBeInstanceOf(UiError);
    expect(error.code).toBe('CONTENT_NOT_FOUND');
  });

  it('maps a gateway 5xx to GATEWAY_UPSTREAM', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const error = (await fetchFromGateway('https://gw.test', 'bafkreiup').catch(
      (e: unknown) => e,
    )) as UiError;
    expect(error.code).toBe('GATEWAY_UPSTREAM');
  });

  it('maps a hisaishi 404 to CONTENT_NOT_FOUND and a 5xx to unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const notFound = (await fetchFromHisaishi('https://g.test', 'bafkrei').catch(
      (e: unknown) => e,
    )) as UiError;
    expect(notFound.code).toBe('CONTENT_NOT_FOUND');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const upstream = (await fetchFromHisaishi('https://g.test', 'bafkrei').catch(
      (e: unknown) => e,
    )) as UiError;
    expect(upstream.code).toBe('HISAISHI_UNREACHABLE');
  });
});

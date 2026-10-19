/**
 * Deploy parity: Vercel (`vercel.json`) and Cloudflare Pages (`_headers`)
 * must ship identical security headers, and the CF build must not contain a
 * top-level 404.html (it would shadow `_redirects`' SPA fallback).
 *
 * Runs against the built `dist/` where possible, so it catches a stale copy
 * of the public files, not just the sources.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface Golden {
  allRoutes: Record<string, string>;
  assets: Record<string, string>;
}

function readText(relative: string): string {
  return readFileSync(path.resolve(relative), 'utf8');
}

/** Parses a Cloudflare `_headers` file into block → header map. */
function parseCfHeaders(text: string): Map<string, Record<string, string>> {
  const blocks = new Map<string, Record<string, string>>();
  let block: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (!line.includes(':')) {
      block = line;
      blocks.set(block, {});
      continue;
    }
    if (block === null) throw new Error(`header outside a block: ${line}`);
    const index = line.indexOf(':');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    const headers = blocks.get(block) as Record<string, string>;
    headers[key] = value;
  }
  return blocks;
}

/** Collects the Vercel headers that apply to every route. */
function vercelAllRouteHeaders(config: {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
}): Record<string, string> {
  const block = config.headers?.find((entry) => entry.source === '/(.*)');
  if (block === undefined) throw new Error('vercel.json missing a /(.*) header block');
  return Object.fromEntries(block.headers.map((h) => [h.key, h.value]));
}

function vercelAssetHeaders(config: {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
}): Record<string, string> {
  const block = config.headers?.find((entry) => entry.source === '/assets/(.*)');
  if (block === undefined) throw new Error('vercel.json missing an /assets/(.*) header block');
  return Object.fromEntries(block.headers.map((h) => [h.key, h.value]));
}

function sortedEntries(record: Record<string, string>): [string, string][] {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

const golden = JSON.parse(readText('test/deploy-parity.golden.json')) as Golden;

describe('deploy headers parity', () => {
  it('vercel.json matches the golden matrix', () => {
    const config = JSON.parse(readText('vercel.json')) as Parameters<
      typeof vercelAllRouteHeaders
    >[0];
    expect(sortedEntries(vercelAllRouteHeaders(config))).toEqual(
      sortedEntries(golden.allRoutes),
    );
    expect(sortedEntries(vercelAssetHeaders(config))).toEqual(
      sortedEntries(golden.assets),
    );
  });

  it('_headers matches the golden matrix (same CSP on both platforms)', () => {
    const blocks = parseCfHeaders(readText('public/_headers'));
    const all = blocks.get('/*');
    const assets = blocks.get('/assets/*');
    expect(all).toBeDefined();
    expect(assets).toBeDefined();
    expect(sortedEntries(all as Record<string, string>)).toEqual(
      sortedEntries(golden.allRoutes),
    );
    expect(sortedEntries(assets as Record<string, string>)).toEqual(
      sortedEntries(golden.assets),
    );
  });

  it('_redirects carries the SPA fallback', () => {
    const redirects = readText('public/_redirects');
    expect(redirects).toMatch(/^\/\*\s+\/index\.html\s+200$/m);
  });

  it('built dist/ mirrors the public files and has no root 404.html', () => {
    const dist = path.resolve('dist');
    if (!existsSync(dist)) return; // unit tests may run before `vite build`
    for (const file of ['_headers', '_redirects']) {
      expect(existsSync(path.join(dist, file)), `${file} missing from dist`).toBe(true);
      expect(readText(path.join('dist', file))).toBe(readText(path.join('public', file)));
    }
    expect(existsSync(path.join(dist, '404.html'))).toBe(false);
  });
});

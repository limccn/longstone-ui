/**
 * Regression tests for the bundle/env audit (M-8/L-9).
 *
 * The audit is a CI gate, not an advisory script: a fixture that contains an
 * off-allowlist VITE variable, a materialized secret, a root 404.html, or a
 * source map must fail. A clean fixture must pass and a missing dist/ must
 * remain a warning (unit tests may run before `vite build`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { auditBundle } from '../scripts/audit-bundle-lib.mjs';

const CLI = path.resolve('scripts/audit-bundle.mjs');
const roots = [];

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'longstone-audit-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

async function run(root) {
  return auditBundle({ root, warn: () => {} });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('auditBundle', () => {
  it('passes a clean fixture and counts source files', async () => {
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
      'dist/index.html': '<!doctype html><html></html>\n',
    });

    const result = await run(root);

    expect(result.failures).toEqual([]);
    expect(result.sourceFiles).toHaveLength(1);
  });

  it('rejects an off-allowlist VITE variable', async () => {
    const root = await fixture({
      'src/bad.ts': "export const secret = import.meta.env.VITE_SECRET;\n",
      'dist/index.html': '<!doctype html><html></html>\n',
    });

    const result = await run(root);

    expect(result.failures).toEqual(
      expect.arrayContaining([expect.stringContaining('VITE_SECRET')]),
    );
    expect(result.failures.some((failure) => failure.includes('not on the public allowlist'))).toBe(
      true,
    );
  });

  it('rejects process.env in browser source', async () => {
    const root = await fixture({
      'src/bad.ts': 'export const env = process.env;\n',
      'dist/index.html': '<!doctype html><html></html>\n',
    });

    const result = await run(root);

    expect(result.failures.some((failure) => failure.includes('process.env'))).toBe(true);
  });

  it('rejects a materialized private key in the built bundle', async () => {
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
      'dist/x.js': `const privateKey: '0x${'a'.repeat(64)}';\n`,
    });

    const result = await run(root);

    expect(result.failures.some((failure) => failure.includes('secret pattern'))).toBe(true);
  });

  it('rejects a top-level 404.html in the built bundle', async () => {
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
      'dist/index.html': '<!doctype html><html></html>\n',
      'dist/404.html': '<!doctype html><html></html>\n',
    });

    const result = await run(root);

    expect(result.failures.some((failure) => failure.includes('404.html'))).toBe(true);
  });

  it('rejects any source map in the built bundle', async () => {
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
      'dist/index.html': '<!doctype html><html></html>\n',
      'dist/x.js.map': '{"version":3,"sources":["x.ts"]}\n',
    });

    const result = await run(root);

    expect(result.failures.some((failure) => failure.includes('source map'))).toBe(true);
  });

  it('does not secret-scan source maps: the .map rule is the only failure', async () => {
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
      'dist/x.js.map': `{"privateKey":"0x${'a'.repeat(64)}"}\n`,
    });

    const result = await run(root);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('source map');
    expect(result.failures[0]).not.toContain('secret pattern');
  });

  it('warns and skips bundle checks when dist/ has not been built', async () => {
    const warn = vi.fn();
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
    });

    const result = await auditBundle({ root, warn });

    expect(result.failures).toEqual([]);
    expect(warn).toHaveBeenCalledWith('audit: dist/ not built yet; skipping bundle checks');
  });
});

describe('audit-bundle CLI', () => {
  it('exits 0 for a clean fixture', async () => {
    const root = await fixture({
      'src/ok.ts': "export const url = import.meta.env.VITE_RPC_URL;\n",
      'dist/index.html': '<!doctype html><html></html>\n',
    });

    const result = spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('audit: OK');
  });

  it('exits 1 and prints the failure for a violating fixture', async () => {
    const root = await fixture({
      'src/bad.ts': "export const secret = import.meta.env.VITE_SECRET;\n",
      'dist/index.html': '<!doctype html><html></html>\n',
    });

    const result = spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('audit: FAILED');
    expect(result.stderr).toContain('VITE_SECRET');
  });
});

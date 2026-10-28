/**
 * Bundle/env audit — testable core.
 *
 * 1. Every `VITE_*` variable read by the app must be on the public allowlist.
 *    Vite inlines these into the bundle, so anything else is a secret leak.
 * 2. The built bundle must not contain private-key / mnemonic-looking names.
 * 3. `dist/` must not contain a top-level 404.html (Cloudflare Pages would
 *    then ignore `_redirects`' SPA fallback).
 * 4. A production bundle must not contain source maps; they expose source and
 *    were previously generated because Vite defaulted to `sourcemap: true`.
 *
 * `scripts/audit-bundle.mjs` is the CLI wrapper. Keeping the checks here makes
 * the gate itself regression-testable with temporary fixtures.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Public by design — Vite inlines these; none may be a secret. */
export const VITE_ALLOWLIST = new Set([
  'VITE_REOWN_PROJECT_ID',
  'VITE_RPC_URL',
  'VITE_REGISTRY_ADDRESS',
  'VITE_IPFS_GATEWAY',
  'VITE_HISAISHI_URL',
]);

// Match materialized secrets, not library API names. Curve libraries ship
// identifiers like `allowedPrivateKeyLengths`; a real leak is an env-var
// name, an assignment carrying a 32-byte hex literal, or a BIP-39 phrase.
const SECRET_PATTERNS = [
  /DEPLOYER_[A-Z_]*KEY/,
  /VITE_[A-Z0-9_]*(KEY|SECRET|MNEMONIC|PASSPHRASE)/,
  /(?:privateKey|secretKey|mnemonic)\s*[:=]\s*['"`](?:0x)?[0-9a-fA-F]{64}['"`]/,
  /['"`]([a-z]+ ){11}[a-z]+['"`]/, // 12-word BIP-39 phrase
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files.sort();
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run every audit rule against a fixture.
 *
 * @param {object} options
 * @param {string} options.root repository/app root containing `src/`
 * @param {string} [options.dist] built output directory; defaults to `<root>/dist`
 * @param {(message: string) => void} [options.warn] warning sink
 * @returns {Promise<{ failures: string[], sourceFiles: string[] }>}
 */
export async function auditBundle({ root, dist = path.join(root, 'dist'), warn = console.warn }) {
  const failures = [];

  // 1 + 2: source-level env audit.
  const sourceFiles = await walk(path.join(root, 'src'));
  for (const file of sourceFiles) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) {
      const name = match[1];
      if (!VITE_ALLOWLIST.has(name)) {
        failures.push(`${path.relative(root, file)}: ${name} is not on the public allowlist`);
      }
    }
    if (/\bprocess\.env\b/.test(text)) {
      failures.push(
        `${path.relative(root, file)}: process.env is not available in the browser bundle`,
      );
    }
  }

  // 2 (bundle) + 3 + 4: inspect the built output when present.
  if (await exists(dist)) {
    const distFiles = await walk(dist);
    for (const file of distFiles) {
      if (file.endsWith('.map')) {
        failures.push(
          `${path.relative(root, file)}: source map is not allowed in a production bundle`,
        );
        continue;
      }
      if (!/\.(js|css|html|json)$/.test(file)) continue;
      const text = await readFile(file, 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(text)) {
          failures.push(`${path.relative(root, file)}: matches secret pattern ${pattern}`);
        }
      }
    }
    if (await exists(path.join(dist, '404.html'))) {
      failures.push('dist/404.html exists — Cloudflare Pages would drop the SPA fallback');
    }
  } else {
    warn('audit: dist/ not built yet; skipping bundle checks');
  }

  return { failures, sourceFiles };
}

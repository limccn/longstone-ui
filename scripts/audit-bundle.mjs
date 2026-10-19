/**
 * Bundle/env audit — CI gate.
 *
 * 1. Every `VITE_*` variable read by the app must be on the public allowlist.
 *    Vite inlines these into the bundle, so anything else is a secret leak.
 * 2. The built bundle must not contain private-key / mnemonic-looking names.
 * 3. `dist/` must not contain a top-level 404.html (Cloudflare Pages would
 *    then ignore `_redirects`' SPA fallback).
 *
 * Usage: node scripts/audit-bundle.mjs   (after `vite build`)
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Public by design — Vite inlines these; none may be a secret. */
const VITE_ALLOWLIST = new Set([
  'VITE_REOWN_PROJECT_ID',
  'VITE_RPC_URL',
  'VITE_REGISTRY_ADDRESS',
  'VITE_IPFS_GATEWAY',
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
  return files;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

const failures = [];

// 1 + 2: source-level env audit.
const sourceFiles = await walk(path.join(ROOT, 'src'));
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) {
    const name = match[1];
    if (!VITE_ALLOWLIST.has(name)) {
      failures.push(`${path.relative(ROOT, file)}: ${name} is not on the public allowlist`);
    }
  }
  if (/\bprocess\.env\b/.test(text)) {
    failures.push(`${path.relative(ROOT, file)}: process.env is not available in the browser bundle`);
  }
}

// 2 (bundle) + 3: inspect the built output when present.
const dist = path.join(ROOT, 'dist');
if (await exists(dist)) {
  const distFiles = await walk(dist);
  for (const file of distFiles) {
    if (!/\.(js|css|html|json|map)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        failures.push(`${path.relative(ROOT, file)}: matches secret pattern ${pattern}`);
      }
    }
  }
  if (await exists(path.join(dist, '404.html'))) {
    failures.push('dist/404.html exists — Cloudflare Pages would drop the SPA fallback');
  }
} else {
  console.warn('audit: dist/ not built yet; skipping bundle checks');
}

if (failures.length > 0) {
  console.error('audit: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`audit: OK (${sourceFiles.length} source files, allowlist ${VITE_ALLOWLIST.size} vars)`);

/**
 * Bundle/env audit — CI gate.
 *
 * See `audit-bundle-lib.mjs` for the rules. This wrapper keeps the
 * `pnpm --dir longstone-ui run audit` contract and adds optional fixture paths:
 *
 *   node scripts/audit-bundle.mjs [--root <dir>] [--dist <dir>]
 */
import path from 'node:path';
import process from 'node:process';

import { auditBundle, VITE_ALLOWLIST } from './audit-bundle-lib.mjs';

function usage(message) {
  console.error(`audit: ${message}`);
  console.error('usage: node scripts/audit-bundle.mjs [--root <dir>] [--dist <dir>]');
  process.exit(2);
}

let root = path.resolve(import.meta.dirname, '..');
let dist;

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === '--root' || arg === '--dist') {
    const value = process.argv[index + 1];
    if (value === undefined || value.startsWith('--')) usage(`${arg} requires a path`);
    if (arg === '--root') root = path.resolve(value);
    else dist = path.resolve(value);
    index += 1;
  } else {
    usage(`unknown argument: ${arg}`);
  }
}

const { failures, sourceFiles } = await auditBundle({
  root,
  ...(dist === undefined ? {} : { dist }),
});

if (failures.length > 0) {
  console.error('audit: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `audit: OK (${sourceFiles.length} source files, allowlist ${VITE_ALLOWLIST.size} vars)`,
);

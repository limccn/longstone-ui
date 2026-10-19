/**
 * E2E orchestration.
 *
 *   1. start a local Hardhat node on chain-id 84532 (Base Sepolia's id)
 *   2. deploy + seed MemoryRegistry via the node's unlocked accounts
 *      (no private key is ever read, written, or passed around)
 *   3. build the app
 *   4. run Playwright against `vite preview`
 *
 * Usage: node scripts/e2e.mjs [--skip-build]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACTS = path.resolve(ROOT, '../menhir/contracts');
const RPC = 'http://127.0.0.1:8545';
const IS_WIN = process.platform === 'win32';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: IS_WIN,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function chainId() {
  try {
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    const body = await response.json();
    return body.result ?? null;
  } catch {
    return null;
  }
}

async function waitForNode(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await chainId()) === '0x14a34') return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('hardhat node did not become ready');
}

const nodeProcesses = [];

async function ensureNode() {
  if ((await chainId()) === '0x14a34') {
    console.log('e2e: reusing running chain node');
    return;
  }
  console.log('e2e: starting hardhat node (chain-id 84532)');
  const child = spawn(
    IS_WIN ? 'corepack.cmd' : 'corepack',
    ['pnpm', 'exec', 'hardhat', 'node', '--chain-id', '84532', '--port', '8545'],
    { cwd: CONTRACTS, stdio: ['ignore', 'pipe', 'pipe'], shell: false },
  );
  nodeProcesses.push(child);
  child.stdout.on('data', (chunk) => {
    if (process.env['E2E_VERBOSE'] === '1') process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    if (process.env['E2E_VERBOSE'] === '1') process.stderr.write(chunk);
  });
  await waitForNode();
}

function cleanup() {
  for (const child of nodeProcesses) {
    if (!child.killed) child.kill();
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

async function main() {
  await ensureNode();
  console.log('e2e: deploying + seeding registry');
  await run(process.execPath, ['scripts/e2e-fixture.ts'], { cwd: ROOT });

  if (!process.argv.includes('--skip-build')) {
    console.log('e2e: building app');
    await run(IS_WIN ? 'corepack.cmd' : 'corepack', ['pnpm', 'exec', 'vite', 'build'], {
      cwd: ROOT,
    });
  }

  const registryFile = path.join(ROOT, 'test/e2e', '.chain.json');
  if (!existsSync(registryFile)) throw new Error('fixture file missing');

  console.log('e2e: running playwright');
  await run(
    IS_WIN ? 'corepack.cmd' : 'corepack',
    ['pnpm', 'exec', 'playwright', 'test'],
    { cwd: ROOT, env: { ...process.env, E2E_CHAIN_FILE: registryFile } },
  );
}

main()
  .then(() => cleanup())
  .catch((error) => {
    console.error(error);
    cleanup();
    process.exit(1);
  });

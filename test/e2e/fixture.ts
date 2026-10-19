export interface ChainFixture {
  registry: `0x${string}`;
  deployBlock: string;
  owner: `0x${string}`;
  agent: `0x${string}`;
  other: `0x${string}`;
  active: {
    commitmentHash: `0x${string}`;
    cid: string;
    contentHash: `0x${string}`;
    cidDigest: `0x${string}`;
    canonical: string;
    tag: string;
  };
  chain: {
    retractedHash: `0x${string}`;
    successorHash: `0x${string}`;
    retractedCid: string;
    retractedCanonical: string;
    successorCid: string;
    successorCanonical: string;
  };
}

import { readFileSync } from 'node:fs';
import path from 'node:path';

export function loadFixture(): ChainFixture {
  const file =
    process.env['E2E_CHAIN_FILE'] ?? path.resolve('test/e2e/.chain.json');
  return JSON.parse(readFileSync(file, 'utf8')) as ChainFixture;
}

/** Settings the app boots from; per-test we also push them into localStorage. */
export function e2eSettings(fixture: ChainFixture) {
  return {
    rpcUrl: 'http://127.0.0.1:8545',
    registryAddress: fixture.registry,
    // Loopback gateway served by the spec's route interception.
    ipfsGateway: 'http://127.0.0.1:4173/ipfs',
    hisaishiUrl: '',
    // 200 mirrors what the real Base Sepolia RPC enforces, so the e2e suite
    // exercises the same chunking production sees. The start block is still
    // pinned to the fixture's deploy block: the local Hardhat node serves
    // eth_getCode at any block, so auto-detection works there, but pinning
    // keeps scan-call assertions deterministic.
    scanChunkSize: 200,
    scanStartBlock: fixture.deployBlock,
  };
}

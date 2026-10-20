/**
 * E2E chain fixture: deploys MemoryRegistry to a local Hardhat node running
 * with `--chain-id 84532` (Base Sepolia's id) and seeds it via unlocked
 * accounts. No private key ever leaves the node process.
 *
 * Seeded state:
 *   c1 — active, tagged layer:deep, verifiable content  (verify → verified)
 *   c2 — chained (prev = c3's? no: c3.prev = c2), retracted with replacedBy=c3
 *   c3 — successor of c2, active
 *   ACL — agent granted ROLE_COMMIT
 *
 * Produces: test/e2e/.chain.json (consumed by globalSetup-free specs).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  stringToBytes,
  type Abi,
  type EIP1193Provider,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { cidDigest, cidV1Raw } from '@limccn/menhir-core';

const RPC = process.env['E2E_RPC_URL'] ?? 'http://127.0.0.1:8545';
const OUT_DIR = path.resolve('test/e2e');
const OUT_FILE = path.join(OUT_DIR, '.chain.json');

function rpcProvider(url: string): EIP1193Provider {
  let id = 0;
  return {
    request: async (args) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: (id += 1), ...args }),
      });
      const body = (await response.json()) as {
        result?: unknown;
        error?: { message: string };
      };
      if (body.error !== undefined) throw new Error(body.error.message);
      return body.result;
    },
  } as EIP1193Provider;
}

function tagBytes32(tag: string): `0x${string}` {
  return `0x${Buffer.from(tag, 'utf8').toString('hex').padEnd(64, '0')}` as `0x${string}`;
}

function contentOf(text: string) {
  const canonical = JSON.stringify({ format: 'text.v0', text });
  const bytes = stringToBytes(canonical);
  return {
    canonical,
    bytes,
    contentHash: keccak256(bytes),
    cidDigest: cidDigest(bytes),
    cid: cidV1Raw(bytes),
  };
}

async function main(): Promise<void> {
  const artifact = JSON.parse(
    await readFile(
      path.resolve('../menhir/contracts/artifacts/src/MemoryRegistry.sol/MemoryRegistry.json'),
      'utf8',
    ),
  ) as { abi: Abi; bytecode: `0x${string}` };

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const chainId = await publicClient.getChainId();
  if (chainId !== baseSepolia.id) {
    throw new Error(`expected chainId ${baseSepolia.id}, node reports ${chainId}`);
  }

  const accounts = (await publicClient.request({
    method: 'eth_accounts',
  })) as unknown as `0x${string}`[];
  const [owner, agent, other] = accounts;
  if (owner === undefined || agent === undefined || other === undefined) {
    throw new Error('need at least three unlocked accounts on the node');
  }

  const wallet = createWalletClient({
    account: owner,
    chain: baseSepolia,
    transport: custom(rpcProvider(RPC)),
  });

  const deployHash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (deployReceipt.contractAddress === null) throw new Error('deploy produced no address');
  const registry = getAddress(deployReceipt.contractAddress);

  async function commit(
    content: ReturnType<typeof contentOf>,
    tags: string[],
    prev: `0x${string}`,
  ): Promise<`0x${string}`> {
    const tx = await wallet.writeContract({
      address: registry,
      abi: artifact.abi,
      functionName: 'commit',
      args: [
        {
          owner,
          contentHash: content.contentHash,
          cidDigest: content.cidDigest,
          signer: owner,
          blockHeight: await publicClient.getBlockNumber(),
          op: 0,
          prev,
        },
        tags.map(tagBytes32),
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    const log = receipt.logs[0];
    if (log === undefined) throw new Error('commit emitted no logs');
    return (
      decodeEventLog({ abi: artifact.abi, data: log.data, topics: log.topics })
        .args as { commitmentHash: `0x${string}` }
    ).commitmentHash;
  }

  // c1 — active, tagged, verifiable.
  const active = contentOf('memory anchored by the e2e fixture');
  const activeHash = await commit(active, ['layer:deep'], `0x${'00'.repeat(32)}`);

  // c2 -> c3 version chain; c2 is retracted with replacedBy = c3.
  const old = contentOf('superseded memory in the version chain');
  const oldHash = await commit(old, ['topic:chain'], `0x${'00'.repeat(32)}`);
  const successor = contentOf('successor memory in the version chain');
  const successorHash = await commit(successor, ['topic:chain'], oldHash);

  const retractTx = await wallet.writeContract({
    address: registry,
    abi: artifact.abi,
    functionName: 'retract',
    args: [oldHash, successorHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: retractTx });

  // ACL: agent may commit on the owner's behalf.
  const aclTx = await wallet.writeContract({
    address: registry,
    abi: artifact.abi,
    functionName: 'setSigner',
    args: [agent, 1n],
  });
  await publicClient.waitForTransactionReceipt({ hash: aclTx });

  const fixture = {
    registry,
    deployBlock: deployReceipt.blockNumber.toString(),
    owner,
    agent,
    other,
    active: {
      commitmentHash: activeHash,
      cid: active.cid,
      contentHash: active.contentHash,
      cidDigest: active.cidDigest,
      canonical: active.canonical,
      tag: 'layer:deep',
    },
    chain: {
      retractedHash: oldHash,
      successorHash,
      retractedCid: old.cid,
      retractedCanonical: old.canonical,
      successorCid: successor.cid,
      successorCanonical: successor.canonical,
    },
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`registry: ${registry}`);
  console.log(`active:   ${activeHash}`);
  console.log(`chain:    ${oldHash} -> ${successorHash}`);
  console.log(`fixture:  ${OUT_FILE}`);
}

await main();

import { useQuery } from '@tanstack/react-query';
import { baseSepolia } from 'viem/chains';
import { findDeployBlock, makePublicClient, scanRange } from './registry';
import { readCache, writeCache } from './cache';
import { deriveIndex, type ChainIndex } from '../state/derive';
import { useSettings } from '../settings/useSettings';
import { UiError } from '../errors';

export interface ScanProgress {
  phase: 'cache' | 'scanning' | 'done';
  done: bigint;
  total: bigint;
}

const EMPTY: ChainIndex = { byHash: new Map(), byOwner: new Map(), signers: [], latestBlock: 0n };

/**
 * Incremental scan: reads the IndexedDB cache, scans only the new blocks,
 * merges and persists. Full rescan = clear cache action in Settings.
 */
export function useChainIndex(onProgress?: (p: ScanProgress) => void) {
  const settings = useSettings();
  const rpcUrl = settings.rpcUrl;
  const registryAddress = settings.registryAddress;
  const chunkSize = settings.scanChunkSize;
  // Empty means "discover it from chain". A literal 0 is treated the same:
  // scanning from genesis is never correct for a deployed registry, and every
  // public Base Sepolia RPC rejects a ~48M-block log range outright.
  const configuredStart = BigInt(settings.scanStartBlock || '0');
  const discoverStart = configuredStart === 0n;

  return useQuery({
    queryKey: ['chain-index', baseSepolia.id, registryAddress, rpcUrl, chunkSize, configuredStart.toString()],
    enabled: registryAddress !== '',
    queryFn: async (): Promise<ChainIndex> => {
      if (registryAddress === '') {
        throw new UiError('REGISTRY_NOT_CONFIGURED', 'no registry address');
      }
      const client = makePublicClient(rpcUrl);
      const latestBlock = await client.getBlockNumber();

      const cached = await readCache(registryAddress, baseSepolia.id);
      const records = cached?.records ?? [];
      const signers = cached?.signers ?? [];

      let startBlock = configuredStart;
      if (cached === null && discoverStart) {
        const detected = await findDeployBlock(client, registryAddress, latestBlock);
        if (detected === null) {
          throw new UiError(
            'REGISTRY_NOT_CONFIGURED',
            `no contract code at ${registryAddress} on Base Sepolia`,
          );
        }
        startBlock = detected;
      }

      const from = cached !== null ? cached.scannedTo + 1n : startBlock;
      let allRecords = records;
      let allSigners = signers;
      let scannedTo = cached?.scannedTo ?? startBlock - 1n;

      if (from <= latestBlock) {
        onProgress?.({ phase: 'scanning', done: 0n, total: latestBlock - from + 1n });
        const result = await scanRange({
          client,
          registryAddress,
          fromBlock: from,
          toBlock: latestBlock,
          chunkSize,
          onProgress: (done, total) =>
            onProgress?.({ phase: 'scanning', done, total }),
        });
        allRecords = [...records, ...result.records];
        allSigners = [...signers, ...result.signers];
        scannedTo = result.scannedTo;
        await writeCache({
          registryAddress,
          chainId: baseSepolia.id,
          scannedTo,
          records: allRecords,
          signers: allSigners,
          updatedAt: Date.now(),
        });
      }

      onProgress?.({ phase: 'done', done: 1n, total: 1n });
      return deriveIndex(allRecords, scannedTo, allSigners);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export { EMPTY };

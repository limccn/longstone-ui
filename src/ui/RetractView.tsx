import { useMemo, useState } from 'react';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { memoryRegistryAbi } from '@limccn/menhir-core';
import { useSettings } from '../settings/useSettings';
import { useChainIndex } from '../chain/useChainIndex';
import { blockscoutTxUrl, statesForOwner, toUiError } from '@limccn/longstone-surface';
import { CHAIN_ID } from '../wallet/config';
import { isWriteChain } from '../wallet/chainGuard';

const ZERO32 = `0x${'0'.repeat(64)}` as const;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function RetractView() {
  const { address, isConnected, chainId } = useAccount();
  const settings = useSettings();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const { data: index, refetch } = useChainIndex();
  const { writeContractAsync } = useWriteContract();
  const [selected, setSelected] = useState('');
  const [replacedBy, setReplacedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; txHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeStates = useMemo(() => {
    if (index === undefined || address === undefined) return [];
    return statesForOwner(index, address).filter((s) => s.active);
  }, [index, address]);

  const replacedByValid = replacedBy.trim() === '' || HASH_RE.test(replacedBy.trim());
  const registryReady = settings.registryAddress !== '';
  const wrongChain = isConnected && !isWriteChain(chainId);

  async function retract(): Promise<void> {
    if (
      address === undefined ||
      !isWriteChain(chainId) ||
      !registryReady ||
      publicClient == null ||
      !HASH_RE.test(selected)
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        chainId: CHAIN_ID,
        address: settings.registryAddress as `0x${string}`,
        abi: memoryRegistryAbi,
        functionName: 'retract',
        args: [
          selected as `0x${string}`,
          (replacedBy.trim() === '' ? ZERO32 : replacedBy.trim()) as `0x${string}`,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setNotice({
        text:
          'Retraction recorded. Re-running it for the same commitment is a silent no-op (idempotent) — the memory stays deep but becomes inactive.',
        txHash: hash,
      });
      setSelected('');
      setReplacedBy('');
      void refetch();
    } catch (err) {
      setError(toUiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) {
    return (
      <section data-testid="retract">
        <h2>Retract</h2>
        <p className="empty">Connect the owner wallet to retract commitments.</p>
      </section>
    );
  }

  if (!registryReady) {
    return (
      <section data-testid="retract">
        <h2>Retract</h2>
        <p className="empty">Set the registry contract address in Settings first.</p>
      </section>
    );
  }

  return (
    <section data-testid="retract">
      <h2>Retract a commitment</h2>
      <p>
        Retraction is a tombstone, never an in-place edit: events and bytes remain
        historically verifiable, the memory simply stops being active. The optional
        <code> replacedBy</code> link points to a successor commitment (compaction
        residuals start new chains).
      </p>
      {wrongChain && (
        <p className="empty" data-testid="retract-wrong-chain">
          Wrong network. Switch to Base Sepolia to retract commitments.{' '}
          <button
            type="button"
            className="warn"
            data-testid="retract-switch-network"
            onClick={() => switchChain({ chainId: CHAIN_ID })}
          >
            Switch to Base Sepolia
          </button>
        </p>
      )}
      <div className="row">
        <select
          data-testid="retract-select"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">— choose an active commitment —</option>
          {activeStates.map((state) => (
            <option key={state.commitmentHash} value={state.commitmentHash}>
              {short(state.commitmentHash)} ({state.tags.join(',') || 'no tags'})
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <input
          data-testid="retract-replacedby"
          className="mono wide"
          placeholder="optional replacedBy commitment hash"
          value={replacedBy}
          onChange={(event) => setReplacedBy(event.target.value.trim())}
        />
        <button
          type="button"
          data-testid="retract-run"
          disabled={busy || wrongChain || !HASH_RE.test(selected) || !replacedByValid}
          onClick={() => void retract()}
        >
          {busy ? 'Signing…' : 'Retract'}
        </button>
      </div>
      {!replacedByValid && (
        <p className="error">replacedBy must be a 32-byte hex commitment hash.</p>
      )}
      {notice !== null && (
        <p className="notice" role="status" data-testid="retract-notice">
          {notice.text}{' '}
          <a href={blockscoutTxUrl(notice.txHash)} target="_blank" rel="noreferrer">
            View tx
          </a>
        </p>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {activeStates.length === 0 && (
        <p className="hint">
          No active commitments found for this wallet on the configured registry.
        </p>
      )}
    </section>
  );
}

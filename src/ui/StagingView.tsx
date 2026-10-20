import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useSettings } from '../settings/useSettings';
import { fetchStagedMemories, type StagedMemory } from '../gateway/client';
import { toUiError } from '../errors';

const STATUS_ORDER = ['staged', 'batched', 'anchored'] as const;

function statusClass(status: string): string {
  return STATUS_ORDER.includes(status as (typeof STATUS_ORDER)[number])
    ? `badge ${status}`
    : 'badge';
}

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function StagingView() {
  const { address, isConnected } = useAccount();
  const settings = useSettings();
  const [memories, setMemories] = useState<StagedMemory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hisaishiConfigured = settings.hisaishiUrl !== '';

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!hisaishiConfigured || address === undefined) return;
      setLoading(true);
      setError(null);
      try {
        setMemories(await fetchStagedMemories(settings.hisaishiUrl, address, signal));
      } catch (err) {
        if (signal?.aborted !== true) setError(toUiError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [hisaishiConfigured, settings.hisaishiUrl, address],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!hisaishiConfigured) {
    return (
      <section data-testid="staging">
        <h2>Staging</h2>
        <p className="empty">
          No memory gateway configured. This view shows memories staged by a
          hisaishi gateway before they are anchored on-chain.
        </p>
        <p className="hint">
          The browser can only reach hisaishi in its <strong>remote</strong> form
          (a public base URL). If you run the embedded local gateway (agent-side),
          leave this blank — staging visibility lives in the agent tooling, and
          verify stays purely direct-to-chain.
        </p>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section data-testid="staging">
        <h2>Staging</h2>
        <p className="empty">Connect a wallet to see its staged memories.</p>
      </section>
    );
  }

  return (
    <section data-testid="staging">
      <div className="row">
        <h2>Staging</h2>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="hint">Read-only view from {settings.hisaishiUrl}</p>
      {loading && memories === null && <p className="loading">Loading staged memories…</p>}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loading && error === null && memories !== null && memories.length === 0 && (
        <p className="empty">No staged memories for this wallet.</p>
      )}
      {memories !== null && memories.length > 0 && (
        <table className="table" data-testid="staging-table">
          <thead>
            <tr>
              <th>CID</th>
              <th>Content hash</th>
              <th>Status</th>
              <th>Tags</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {memories.map((memory) => (
              // `(owner, contentHash)` is the row identity (hisaishi R1). Two
              // owners staging identical bytes share one CID, so keying on the
              // CID alone would collide.
              <tr
                key={`${memory.owner}:${memory.contentHash}`}
                data-testid="staging-row"
              >
                <td className="mono">{short(memory.cid)}</td>
                <td className="mono">{short(memory.contentHash)}</td>
                <td>
                  <span className={statusClass(memory.status)}>{memory.status}</span>
                </td>
                <td>{memory.tags.length === 0 ? '—' : memory.tags.join(', ')}</td>
                <td className="mono">
                  {memory.txHash === null ? '—' : short(memory.txHash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

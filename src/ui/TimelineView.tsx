import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { filterByTags, statesForOwner, type MemoryState } from '@limccn/longstone-surface';
import { useChainIndex } from '../chain/useChainIndex';

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function Badge({ state }: { state: MemoryState }) {
  return (
    <span className="badges">
      <span className={state.deep ? 'badge deep' : 'badge'}>deep</span>
      <span className={state.active ? 'badge active' : 'badge retracted'}>
        {state.active ? 'active' : 'retracted'}
      </span>
    </span>
  );
}

export function TimelineView() {
  const { address, isConnected } = useAccount();
  const { data: index, isLoading, error, refetch, isFetching } = useChainIndex();
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const states = useMemo(() => {
    if (index === undefined || address === undefined) return [];
    return filterByTags(statesForOwner(index, address), tagFilter);
  }, [index, address, tagFilter]);

  const allTags = useMemo(() => {
    if (index === undefined || address === undefined) return [];
    const tags = new Set<string>();
    for (const s of statesForOwner(index, address)) for (const t of s.tags) tags.add(t);
    return [...tags].sort();
  }, [index, address]);

  if (!isConnected) {
    return (
      <section data-testid="timeline">
        <h2>Timeline</h2>
        <p className="empty">Connect a wallet to see your anchored memories.</p>
      </section>
    );
  }

  return (
    <section data-testid="timeline">
      <div className="row">
        <h2>Timeline</h2>
        <button type="button" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? 'Scanning…' : 'Refresh'}
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="chips" data-testid="tag-filter">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={tagFilter.includes(tag) ? 'chip on' : 'chip'}
              onClick={() =>
                setTagFilter((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                )
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="loading">Scanning chain…</p>}
      {error !== null && (
        <p className="error" role="alert">
          Scan failed: {error instanceof Error ? error.message : 'unknown error'}
        </p>
      )}
      {!isLoading && error === null && states.length === 0 && (
        <p className="empty">No commitments found for this address.</p>
      )}

      {states.length > 0 && (
        <table className="table" data-testid="timeline-table">
          <thead>
            <tr>
              <th>Commitment</th>
              <th>Content hash</th>
              <th>Tags</th>
              <th>State</th>
              <th>Block</th>
            </tr>
          </thead>
          <tbody>
            {states.map((state) => (
              <tr key={state.commitmentHash} data-testid="timeline-row">
                <td>
                  <Link to={`/commitment/${state.commitmentHash}`}>
                    {shortHash(state.commitmentHash)}
                  </Link>
                </td>
                <td className="mono">{shortHash(state.contentHash ?? '0x')}</td>
                <td>{state.tags.join(', ')}</td>
                <td>
                  <Badge state={state} />
                </td>
                <td>{state.committedAt.toString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

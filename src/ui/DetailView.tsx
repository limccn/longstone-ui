import { Link, useParams } from 'react-router-dom';
import { useChainIndex } from '../chain/useChainIndex';
import { blockscoutTxUrl, predecessorOf, successorOf } from '@limccn/longstone-surface';
import { cidV1RawFromDigest } from '@limccn/menhir-core';

export function DetailView() {
  const { commitmentHash } = useParams<{ commitmentHash: string }>();
  const { data: index, isLoading } = useChainIndex();

  if (isLoading) return <p className="loading">Loading commitment…</p>;
  if (commitmentHash === undefined || index === undefined) {
    return <p className="empty">Missing commitment hash.</p>;
  }
  const state = index.byHash.get(commitmentHash as `0x${string}`);
  if (state === undefined) {
    return (
      <section data-testid="detail">
        <p className="empty">Unknown commitment on this registry.</p>
        <Link to="/">Back to timeline</Link>
      </section>
    );
  }

  const prev = predecessorOf(index, state);
  const next = successorOf(index, state);
  const cid = state.commitment !== undefined ? cidV1RawFromDigest(state.commitment.cidDigest) : null;

  return (
    <section data-testid="detail">
      <h2>Commitment</h2>
      <dl>
        <dt>Commitment hash</dt>
        <dd className="mono">{state.commitmentHash}</dd>
        <dt>Owner</dt>
        <dd className="mono">{state.owner}</dd>
        <dt>Content hash (keccak)</dt>
        <dd className="mono">{state.contentHash}</dd>
        <dt>cidDigest (sha256)</dt>
        <dd className="mono">{state.commitment?.cidDigest}</dd>
        {cid !== null && (
          <>
            <dt>CID (raw v1)</dt>
            <dd className="mono">{cid}</dd>
          </>
        )}
        <dt>Signer</dt>
        <dd className="mono">{state.commitment?.signer}</dd>
        <dt>Block height (advisory)</dt>
        <dd>{state.commitment?.blockHeight.toString()}</dd>
        <dt>Tags</dt>
        <dd>{state.tags.length === 0 ? '—' : state.tags.join(', ')}</dd>
        <dt>Deep / active</dt>
        <dd>
          {String(state.deep)} / {String(state.active)}
        </dd>
        <dt>Committed at block</dt>
        <dd>{state.committedAt.toString()}</dd>
        <dt>Tx</dt>
        <dd>
          <a href={blockscoutTxUrl(state.txHash)} target="_blank" rel="noreferrer">
            {state.txHash}
          </a>
        </dd>
        <dt>Predecessor (prev)</dt>
        <dd>
          {prev === undefined ? (
            'none (chain root)'
          ) : (
            <Link to={`/commitment/${prev.commitmentHash}`}>{prev.commitmentHash}</Link>
          )}
        </dd>
        <dt>Successor (replacedBy)</dt>
        <dd>
          {next === undefined ? (
            'none'
          ) : (
            <Link to={`/commitment/${next.commitmentHash}`}>{next.commitmentHash}</Link>
          )}
        </dd>
      </dl>
      <Link to="/">Back to timeline</Link>
    </section>
  );
}

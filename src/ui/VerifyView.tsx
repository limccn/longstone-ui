import { useState } from 'react';
import { useSettings } from '../settings/useSettings';
import { makePublicClient } from '../chain/registry';
import { readerFor, verifyByCid, verifyByCommitmentHash, type VerifyResult } from '../verify/verify';
import { UiError } from '../errors';

type Mode = 'commitment' | 'cid';

export function VerifyView() {
  const settings = useSettings();
  const [mode, setMode] = useState<Mode>('commitment');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setError(null);
    setResult(null);
    if (settings.registryAddress === '' && mode === 'commitment') {
      setError(new UiError('REGISTRY_NOT_CONFIGURED', '').message);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'commitment') {
        const client = makePublicClient(settings.rpcUrl);
        const reader = readerFor(client, settings.registryAddress as `0x${string}`);
        setResult(await verifyByCommitmentHash({
          hash: input.trim() as `0x${string}`,
          reader,
          gateway: settings.ipfsGateway,
        }));
      } else {
        setResult(await verifyByCid({ cid: input.trim(), gateway: settings.ipfsGateway }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="verify">
      <h2>Public verify</h2>
      <div className="row">
        <label>
          <input
            type="radio"
            checked={mode === 'commitment'}
            onChange={() => setMode('commitment')}
          />{' '}
          Commitment hash
        </label>
        <label>
          <input type="radio" checked={mode === 'cid'} onChange={() => setMode('cid')} /> CID
        </label>
      </div>
      <div className="row">
        <input
          data-testid="verify-input"
          className="mono wide"
          placeholder={mode === 'commitment' ? '0x… (32 bytes)' : 'bafkrei…'}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button
          type="button"
          data-testid="verify-run"
          disabled={busy || input.trim() === ''}
          onClick={() => void run()}
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result !== null && (
        <div data-testid="verify-result" className={`verdict ${result.verdict}`}>
          <h3 data-testid="verify-verdict">{result.verdict}</h3>
          {result.message !== undefined && <p>{result.message}</p>}
          <dl>
            <dt>Mode</dt>
            <dd>{result.mode}</dd>
            {result.cid !== null && (
              <>
                <dt>CID</dt>
                <dd className="mono">{result.cid}</dd>
              </>
            )}
            {result.commitmentHash !== null && (
              <>
                <dt>Commitment</dt>
                <dd className="mono">{result.commitmentHash}</dd>
              </>
            )}
            <dt>keccak256(bytes) == contentHash</dt>
            <dd data-testid="keccak-match">
              {result.keccakMatches === null ? '—' : String(result.keccakMatches)}
            </dd>
            <dt>sha256(bytes) == cidDigest</dt>
            <dd data-testid="sha256-match">
              {result.sha256Matches === null ? '—' : String(result.sha256Matches)}
            </dd>
            <dt>anchored (deep)</dt>
            <dd>{String(result.anchored)}</dd>
            <dt>active</dt>
            <dd>{String(result.active)}</dd>
            <dt>bytes</dt>
            <dd>{result.bytesLength}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}

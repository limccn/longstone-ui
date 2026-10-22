import { useState } from 'react';
import { useSettings, updateSettings } from '../settings/useSettings';
import { validateAddress } from '../settings/store';
import { blockscoutAddressUrl } from '../gateway/client';
import { CHAIN, appKitEnabled } from '../wallet/config';

const VERSIONS = [
  { component: 'menhir contracts', version: 'M1 v0.3 (MemoryRegistry)' },
  { component: '@limccn/menhir-core', version: '0.1.1' },
  { component: 'longstone-ui', version: '0.1.0' },
] as const;

export function AboutView() {
  const settings = useSettings();
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function applyRegistry(): void {
    const check = validateAddress(paste);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    updateSettings({ registryAddress: check.value as `0x${string}` });
    setError(null);
    setSaved(true);
    setPaste('');
  }

  return (
    <section data-testid="about">
      <h2>About</h2>
      <dl>
        <dt>Chain</dt>
        <dd>
          {CHAIN.name} ({CHAIN.id})
        </dd>
        <dt>Registry</dt>
        <dd className="mono">
          {settings.registryAddress === '' ? 'not configured' : settings.registryAddress}
        </dd>
        <dt>Wallet modal</dt>
        <dd>{appKitEnabled ? 'AppKit (Reown)' : 'injected-only fallback (no project id)'}</dd>
        <dt>Data sources</dt>
        <dd>
          wallet RPC reads · IPFS gateway fetch · hisaishi GET (optional)
          {settings.hisaishiUrl === '' ? ' · hisaishi not configured' : ''}
        </dd>
        <dt>Storage</dt>
        <dd>browser only — localStorage settings + IndexedDB scan cache</dd>
      </dl>

      <h3>Registry contract</h3>
      {settings.registryAddress !== '' && (
        <p>
          <a
            href={blockscoutAddressUrl(settings.registryAddress)}
            target="_blank"
            rel="noreferrer"
          >
            View on Blockscout
          </a>
        </p>
      )}
      <div className="row">
        <input
          data-testid="about-registry-paste"
          className="mono wide"
          placeholder="paste a new registry address (no proxy — upgrades = new address)"
          value={paste}
          onChange={(event) => {
            setPaste(event.target.value.trim());
            setSaved(false);
          }}
        />
        <button type="button" data-testid="about-registry-apply" onClick={applyRegistry}>
          Use this address
        </button>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          Registry address updated. The scan cache is per address; the new
          registry starts from its deploy block.
        </p>
      )}

      <h3>Version chain</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
          {VERSIONS.map((row) => (
            <tr key={row.component}>
              <td>{row.component}</td>
              <td className="mono">{row.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        The registry is a single immutable contract: no proxy, no initializer.
        Contract upgrades are new addresses, and memories never leave the chain
        they were anchored on.
      </p>
    </section>
  );
}

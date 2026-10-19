import { useState } from 'react';
import { useSettings, updateSettings } from '../settings/useSettings';
import { validateAddress, validateUrl, type Settings } from '../settings/store';
import { blockscoutAddressUrl } from '../gateway/client';

export function SettingsView() {
  const settings = useSettings();
  const [draft, setDraft] = useState<Settings>({ ...settings });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save(): void {
    const next: Record<string, string> = {};
    const rpc = validateUrl(draft.rpcUrl);
    if (!rpc.ok) next['rpcUrl'] = rpc.error;
    const gw = validateUrl(draft.ipfsGateway);
    if (!gw.ok) next['ipfsGateway'] = gw.error;
    const hisaishi = validateUrl(draft.hisaishiUrl, { allowEmpty: true });
    if (!hisaishi.ok) next['hisaishiUrl'] = hisaishi.error;
    const registry = validateAddress(draft.registryAddress, { allowEmpty: true });
    if (!registry.ok) next['registryAddress'] = registry.error;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    updateSettings(draft);
    setSaved(true);
  }

  return (
    <section data-testid="settings">
      <h2>Settings</h2>
      <p className="hint">
        All settings live in your browser (localStorage). No server, no account.
      </p>
      <div className="form">
        <label>
          RPC endpoint (reads)
          <input
            data-testid="settings-rpc"
            className="mono"
            value={draft.rpcUrl}
            onChange={(event) => set('rpcUrl', event.target.value)}
          />
        </label>
        {errors['rpcUrl'] !== undefined && <p className="error">{errors['rpcUrl']}</p>}

        <label>
          Registry contract (Base Sepolia)
          <input
            data-testid="settings-registry"
            className="mono"
            placeholder="0x…"
            value={draft.registryAddress}
            onChange={(event) =>
              set('registryAddress', event.target.value as `0x${string}` | '')
            }
          />
        </label>
        {errors['registryAddress'] !== undefined && (
          <p className="error">{errors['registryAddress']}</p>
        )}
        {draft.registryAddress !== '' && (
          <a href={blockscoutAddressUrl(draft.registryAddress)} target="_blank" rel="noreferrer">
            View contract on Blockscout
          </a>
        )}

        <label>
          IPFS gateway (dedicated; never a shared public gateway)
          <input
            data-testid="settings-gateway"
            className="mono"
            value={draft.ipfsGateway}
            onChange={(event) => set('ipfsGateway', event.target.value)}
          />
        </label>
        {errors['ipfsGateway'] !== undefined && (
          <p className="error">{errors['ipfsGateway']}</p>
        )}

        <label>
          Memory gateway (hisaishi remote form — optional)
          <input
            data-testid="settings-hisaishi"
            className="mono"
            placeholder="https://… (blank = staging view disabled)"
            value={draft.hisaishiUrl}
            onChange={(event) => set('hisaishiUrl', event.target.value)}
          />
        </label>
        {errors['hisaishiUrl'] !== undefined && (
          <p className="error">{errors['hisaishiUrl']}</p>
        )}
        <p className="hint">
          The remote gateway is the only hisaishi form a browser can reach. Local
          (embedded) gateways are agent-side and never exposed to the UI — leaving
          this blank keeps verify purely direct-to-chain.
        </p>

        <label>
          Scan chunk size (blocks per getLogs call)
          <input
            type="number"
            data-testid="settings-chunk"
            min={1}
            max={50000}
            value={draft.scanChunkSize}
            onChange={(event) => set('scanChunkSize', Number(event.target.value))}
          />
        </label>
        <p className="hint">
          Providers cap how many blocks one log query may span — Base Sepolia's
          public RPC allows 200. Lower this if scans fail; the scanner also
          adapts automatically when a provider states its limit.
        </p>

        <label>
          Scan start block (blank = detect the registry's deploy block)
          <input
            data-testid="settings-start"
            className="mono"
            placeholder="auto"
            value={draft.scanStartBlock}
            onChange={(event) => set('scanStartBlock', event.target.value.replace(/[^0-9]/g, ''))}
          />
        </label>
        <p className="hint">
          Leave blank to start where the contract was deployed. Scanning from an
          earlier block is wasted work at best, and from block 0 the range is too
          large for public RPCs to serve at all.
        </p>

        <div className="row">
          <button type="button" data-testid="settings-save" onClick={save}>
            Save
          </button>
          <button type="button" onClick={() => setDraft({ ...settings })}>
            Reset
          </button>
        </div>
        {saved && (
          <p className="notice" role="status">
            Saved.
          </p>
        )}
      </div>
    </section>
  );
}

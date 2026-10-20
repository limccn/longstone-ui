export interface Settings {
  rpcUrl: string;
  registryAddress: `0x${string}` | '';
  ipfsGateway: string;
  hisaishiUrl: string;
  scanChunkSize: number;
  scanStartBlock: string;
}

const STORAGE_KEY = 'longstone-ui.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  rpcUrl: import.meta.env.VITE_RPC_URL ?? 'https://sepolia.base.org',
  registryAddress:
    (import.meta.env.VITE_REGISTRY_ADDRESS as `0x${string}` | undefined) ?? '',
  ipfsGateway:
    import.meta.env.VITE_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs',
  // Remote (Worker) gateway URL. Baked at build time so a deployed UI can
  // show staging without asking the visitor to configure anything; blank is
  // still the default for local development and for builds that do not set it.
  hisaishiUrl: import.meta.env.VITE_HISAISHI_URL ?? '',
  // Base Sepolia's public RPC caps eth_getLogs at 200 blocks ("eth_getLogs is
  // limited to a 200 range"), so a 10k default fails on the very first chunk
  // and can never succeed. Starting at the cap keeps first load working out of
  // the box; scanRange still adapts down when a provider states a smaller cap
  // or rejects this one.
  scanChunkSize: 200,
  // Empty = discover the registry's deploy block from chain. Only set this to
  // skip that discovery (e.g. a provider that cannot serve historical
  // eth_getCode).
  scanStartBlock: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates one URL string. https everywhere; http only for loopback. */
export function validateUrl(
  raw: string,
  options: { allowEmpty?: boolean } = {},
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value === '') {
    return options.allowEmpty
      ? { ok: true, value: '' }
      : { ok: false, error: 'URL is required' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'Not a valid URL' };
  }
  if (url.protocol === 'https:') return { ok: true, value };
  if (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    return { ok: true, value };
  }
  return { ok: false, error: 'Only https:// (or http:// on loopback) is allowed' };
}

export function validateAddress(
  raw: string,
  options: { allowEmpty?: boolean } = {},
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (value === '') {
    return options.allowEmpty
      ? { ok: true, value: '' }
      : { ok: false, error: 'Address is required' };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return { ok: false, error: 'Address must be 0x + 40 hex characters' };
  }
  return { ok: true, value };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_SETTINGS };
    const settings: Settings = { ...DEFAULT_SETTINGS };
    if (typeof parsed.rpcUrl === 'string') {
      const check = validateUrl(parsed.rpcUrl);
      if (check.ok) settings.rpcUrl = check.value;
    }
    if (typeof parsed.registryAddress === 'string') {
      const check = validateAddress(parsed.registryAddress, { allowEmpty: true });
      if (check.ok) settings.registryAddress = check.value as `0x${string}` | '';
    }
    if (typeof parsed.ipfsGateway === 'string') {
      const check = validateUrl(parsed.ipfsGateway);
      if (check.ok) settings.ipfsGateway = check.value;
    }
    if (typeof parsed.hisaishiUrl === 'string') {
      const check = validateUrl(parsed.hisaishiUrl, { allowEmpty: true });
      if (check.ok) settings.hisaishiUrl = check.value;
    }
    if (typeof parsed.scanChunkSize === 'number') {
      settings.scanChunkSize = Math.min(
        50_000,
        Math.max(1, Math.floor(parsed.scanChunkSize)),
      );
    }
    if (typeof parsed.scanStartBlock === 'string') {
      // Blank stays blank (= auto-detect the deploy block). A blank must not be
      // coerced to '0', or saving other settings would silently wipe the
      // user's choice and reintroduce genesis scanning.
      settings.scanStartBlock = parsed.scanStartBlock.replace(/[^0-9]/g, '');
    }
    return settings;
  } catch {
    // Private windows / disabled storage: fall back to defaults.
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — settings stay in memory for this session.
  }
}

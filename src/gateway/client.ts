import { UiError } from '../errors';

/** Shared hardened fetch init. `signal` must be null (not undefined) to satisfy RequestInit. */
function init(signal?: AbortSignal): RequestInit {
  return {
    signal: signal ?? null,
    credentials: 'omit',
    referrerPolicy: 'strict-origin-when-cross-origin',
  };
}

/** Fetch raw bytes from an IPFS gateway — https enforced by settings load. */
export async function fetchFromGateway(
  gateway: string,
  cid: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!/^[a-zA-Z0-9]+$/.test(cid)) {
    throw new UiError('INVALID_HASH', 'CID must be alphanumeric (base32/base58)');
  }
  const url = `${gateway.replace(/\/+$/, '')}/${cid}`;
  let response: Response;
  try {
    response = await fetch(url, init(signal));
  } catch (error) {
    throw new UiError('GATEWAY_UPSTREAM', `gateway fetch failed: ${url}`, error);
  }
  if (!response.ok) {
    throw new UiError('GATEWAY_UPSTREAM', `gateway returned ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Fetch from the hisaishi gateway `/v1/content?cid=` (optional path). */
export async function fetchFromHisaishi(
  baseUrl: string,
  cid: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/content?cid=${encodeURIComponent(cid)}`;
  let response: Response;
  try {
    response = await fetch(url, init(signal));
  } catch (error) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway unreachable: ${url}`, error);
  }
  if (!response.ok) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway returned ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface StagedMemory {
  cid: string;
  contentHash: string;
  owner: string;
  status: string;
  tags: string[];
  batchId?: string | null;
  txHash?: string | null;
}

/** GET /v1/memories (staging visibility; public read path). */
export async function fetchStagedMemories(
  baseUrl: string,
  owner: string,
  signal?: AbortSignal,
): Promise<StagedMemory[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/memories?owner=${encodeURIComponent(owner)}&limit=100`;
  let response: Response;
  try {
    response = await fetch(url, init(signal));
  } catch (error) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway unreachable: ${url}`, error);
  }
  if (!response.ok) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway returned ${response.status}`);
  }
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('memories' in body)) {
    throw new UiError('HISAISHI_UNREACHABLE', 'unexpected response shape');
  }
  return (body as { memories: StagedMemory[] }).memories;
}

export function blockscoutTxUrl(txHash: string): string {
  return `https://base-sepolia.blockscout.com/tx/${txHash}`;
}

export function blockscoutAddressUrl(address: string): string {
  return `https://base-sepolia.blockscout.com/address/${address}`;
}

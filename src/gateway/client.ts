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
  if (response.status === 404) {
    // "The CID is not pinned" and "the gateway is down" are different facts.
    // Collapsing them makes ordinary absence look like an outage, which is the
    // most misleading thing a verify UI can do.
    throw new UiError('CONTENT_NOT_FOUND', `${cid} is not available at the configured gateway`);
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
  if (response.status === 404) {
    // Mirrors hisaishi's CONTENT_NOT_FOUND (design R6).
    throw new UiError('CONTENT_NOT_FOUND', `${cid} is not staged or pinned`);
  }
  if (!response.ok) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway returned ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Fetch content by its retrieval digest (hisaishi `/v1/content?cidDigest=`).
 *
 * A commitment holds only `cidDigest`. Pinata's CID hashes its dag-pb wrapper,
 * so it is not derivable from `sha256(bytes)`; the gateway's row maps digest →
 * pinned CID. The gateway is trusted for the mapping only — the caller hashes
 * the returned bytes and compares both digests before reporting success.
 */
export async function fetchContentByDigest(
  baseUrl: string,
  cidDigest: string,
  signal?: AbortSignal,
): Promise<{ cid: string; bytes: Uint8Array }> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/content?cidDigest=${encodeURIComponent(cidDigest)}`;
  let response: Response;
  try {
    response = await fetch(url, init(signal));
  } catch (error) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway unreachable: ${url}`, error);
  }
  if (response.status === 404) {
    throw new UiError('CONTENT_NOT_FOUND', `${cidDigest} is not staged or pinned`);
  }
  if (!response.ok) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway returned ${response.status}`);
  }
  const cid = response.headers.get('x-ipfs-cid');
  if (cid === null || cid === '') {
    // Without the CID the view cannot show what was fetched; treat a missing
    // header as an upstream contract violation rather than inventing a value.
    throw new UiError('HISAISHI_UNREACHABLE', 'gateway did not return x-ipfs-cid');
  }
  return { cid, bytes: new Uint8Array(await response.arrayBuffer()) };
}

/**
 * The gateway's staging row (hisaishi v0.5 §4, R13).
 *
 * Kept as a local structural type rather than an import: `@limccn/hisaishi-gateway`
 * is a Node-oriented package (its `/local` entry pulls `node:sqlite`), and the
 * UI must not drag a Node dependency into the browser bundle. The conformance
 * assertion below is the guard — a field change in the gateway breaks the
 * build here instead of silently rendering `undefined`.
 */
export interface MemoryRow {
  cid: string;
  contentHash: `0x${string}`;
  cidDigest: `0x${string}`;
  owner: `0x${string}`;
  tags: string[];
  status: 'staged' | 'batched' | 'anchored' | 'rejected';
  batchId: string | null;
  txHash: `0x${string}` | null;
  createdAt: number;
  /** Derived from the gateway's PLACEHOLDER struct: a lookup aid, not proof. */
  commitmentHash: `0x${string}` | null;
}

/** @deprecated Name kept for the existing views; same shape as `MemoryRow`. */
export type StagedMemory = MemoryRow;

/**
 * GET /v1/memories (staging visibility; public read path).
 *
 * The response field is `rows` — hisaishi's contract. An earlier version read
 * `memories`, which never matched, so every staging view rendered its empty
 * state even when rows existed.
 */
export async function fetchStagedMemories(
  baseUrl: string,
  owner: string,
  signal?: AbortSignal,
): Promise<MemoryRow[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/memories?owner=${encodeURIComponent(owner)}&limit=100`;
  let response: Response;
  try {
    response = await fetch(url, init(signal));
  } catch (error) {
    throw new UiError('HISAISHI_UNREACHABLE', `gateway unreachable: ${url}`, error);
  }
  if (!response.ok) {
    // A business rejection carries a code; an outage does not. Preserve the
    // gateway's own code so the view can say what actually went wrong.
    const code = await response
      .clone()
      .json()
      .then((body: unknown) =>
        typeof body === 'object' && body !== null && 'code' in body
          ? String((body as { code: unknown }).code)
          : null,
      )
      .catch(() => null);
    throw new UiError(
      'HISAISHI_UNREACHABLE',
      `gateway returned ${response.status}${code === null ? '' : ` (${code})`}`,
    );
  }
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('rows' in body)) {
    throw new UiError('HISAISHI_UNREACHABLE', 'unexpected response shape: expected { rows }');
  }
  const rows = (body as { rows: unknown }).rows;
  if (!Array.isArray(rows)) {
    throw new UiError('HISAISHI_UNREACHABLE', 'rows is not an array');
  }
  return rows as MemoryRow[];
}

export function blockscoutTxUrl(txHash: string): string {
  return `https://base-sepolia.blockscout.com/tx/${txHash}`;
}

export function blockscoutAddressUrl(address: string): string {
  return `https://base-sepolia.blockscout.com/address/${address}`;
}

/** Typed error surface — parity with longstone §7 union + UI-specific codes. */
export type UiErrorCode =
  | 'WALLET_NOT_CONNECTED'
  | 'WRONG_NETWORK'
  | 'USER_REJECTED'
  | 'RPC_RATE_LIMITED'
  | 'RPC_UNAVAILABLE'
  | 'HISAISHI_UNREACHABLE'
  | 'GATEWAY_UPSTREAM'
  | 'UNKNOWN_COMMITMENT'
  | 'NOT_AUTHORIZED'
  | 'INVALID_HASH'
  | 'REGISTRY_NOT_CONFIGURED'
  | 'UNKNOWN_ERROR';

export class UiError extends Error {
  readonly code: UiErrorCode;
  readonly cause?: unknown;

  constructor(code: UiErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'UiError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

const MESSAGES: Record<UiErrorCode, string> = {
  WALLET_NOT_CONNECTED: 'Connect a wallet to continue.',
  WRONG_NETWORK: 'Switch your wallet to Base Sepolia (chain 84532).',
  USER_REJECTED: 'Transaction cancelled in your wallet.',
  RPC_RATE_LIMITED: 'The RPC endpoint is rate limiting. Retrying with backoff…',
  RPC_UNAVAILABLE: 'The RPC endpoint is unreachable. Check your settings.',
  HISAISHI_UNREACHABLE:
    'The memory gateway is unreachable. Direct chain + IPFS mode still works.',
  GATEWAY_UPSTREAM: 'The IPFS gateway did not return the content.',
  UNKNOWN_COMMITMENT: 'No commitment with that hash exists on this registry.',
  NOT_AUTHORIZED: 'Your wallet does not have permission for this action.',
  INVALID_HASH: 'That value is not a valid commitment hash or CID.',
  REGISTRY_NOT_CONFIGURED: 'Set the registry contract address in Settings.',
  UNKNOWN_ERROR: 'Something went wrong.',
};

export function uiMessage(error: unknown): string {
  const ui = toUiError(error);
  return MESSAGES[ui.code];
}

export function toUiError(error: unknown): UiError {
  if (error instanceof UiError) return error;

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (/user rejected|user denied|ACTION_REJECTED/i.test(message)) {
    return new UiError('USER_REJECTED', message, error);
  }
  if (/429|rate limit|too many requests/i.test(message)) {
    return new UiError('RPC_RATE_LIMITED', message, error);
  }
  if (/fetch failed|network error|ECONNREFUSED|Failed to fetch/i.test(message)) {
    return new UiError('RPC_UNAVAILABLE', message, error);
  }
  if (/NotAuthorized/i.test(message)) {
    return new UiError('NOT_AUTHORIZED', message, error);
  }
  if (/UnknownCommitment/i.test(message)) {
    return new UiError('UNKNOWN_COMMITMENT', message, error);
  }
  return new UiError('UNKNOWN_ERROR', message || MESSAGES.UNKNOWN_ERROR, error);
}

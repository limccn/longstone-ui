import { describe, expect, it } from 'vitest';

import { CHAIN_ID } from '../src/wallet/config';
import { isWriteChain } from '../src/wallet/chainGuard';

describe('isWriteChain', () => {
  it('accepts the configured chain', () => {
    expect(isWriteChain(CHAIN_ID)).toBe(true);
    expect(isWriteChain(84532)).toBe(true);
  });

  it('rejects another chain and a missing wallet chain', () => {
    expect(isWriteChain(1)).toBe(false);
    expect(isWriteChain(undefined)).toBe(false);
  });
});

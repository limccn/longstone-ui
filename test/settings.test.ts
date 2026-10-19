import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  validateAddress,
  validateUrl,
  type Settings,
} from '../src/settings/store';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateUrl', () => {
  it('accepts https', () => {
    expect(validateUrl('https://sepolia.base.org').ok).toBe(true);
  });

  it('accepts loopback http only', () => {
    expect(validateUrl('http://localhost:8545').ok).toBe(true);
    expect(validateUrl('http://127.0.0.1:8080').ok).toBe(true);
    expect(validateUrl('http://[::1]:8080').ok).toBe(true);
    expect(validateUrl('http://example.com/rpc').ok).toBe(false);
  });

  it('rejects javascript/data and malformed values', () => {
    expect(validateUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateUrl('data:text/html,hi').ok).toBe(false);
    expect(validateUrl('not a url').ok).toBe(false);
  });

  it('honors allowEmpty', () => {
    expect(validateUrl('').ok).toBe(false);
    expect(validateUrl('', { allowEmpty: true }).ok).toBe(true);
  });
});

describe('validateAddress', () => {
  it('accepts 0x + 40 hex', () => {
    expect(validateAddress('0x4e6787a21acf21030d3b908b6160d0e09cd441a9').ok).toBe(true);
  });

  it('rejects wrong shapes', () => {
    expect(validateAddress('0x1234').ok).toBe(false);
    expect(validateAddress('4e6787a21acf21030d3b908b6160d0e09cd441a9').ok).toBe(false);
    expect(validateAddress('0x' + 'zz'.repeat(20)).ok).toBe(false);
  });

  it('honors allowEmpty', () => {
    expect(validateAddress('').ok).toBe(false);
    expect(validateAddress('', { allowEmpty: true }).ok).toBe(true);
  });
});

describe('settings persistence', () => {
  it('returns defaults when storage is empty', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a valid settings object', () => {
    const settings: Settings = {
      rpcUrl: 'https://rpc.example.org',
      registryAddress: '0x4e6787a21acf21030d3b908b6160d0e09cd441a9',
      ipfsGateway: 'https://gateway.example.org/ipfs',
      hisaishiUrl: 'https://gateway.example.org',
      scanChunkSize: 25_000,
      scanStartBlock: '100',
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('sanitizes invalid persisted values', () => {
    localStorage.setItem(
      'longstone-ui.settings.v1',
      JSON.stringify({
        rpcUrl: 'ftp://bad',
        registryAddress: 'nope',
        ipfsGateway: 'javascript:alert(1)',
        hisaishiUrl: 'http://remote.example.com',
        scanChunkSize: 999_999,
        scanStartBlock: 'abc123',
      }),
    );
    const loaded = loadSettings();
    expect(loaded.rpcUrl).toBe(DEFAULT_SETTINGS.rpcUrl);
    expect(loaded.registryAddress).toBe(DEFAULT_SETTINGS.registryAddress);
    expect(loaded.ipfsGateway).toBe(DEFAULT_SETTINGS.ipfsGateway);
    expect(loaded.hisaishiUrl).toBe('');
    expect(loaded.scanChunkSize).toBe(50_000);
    expect(loaded.scanStartBlock).toBe('123');
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem('longstone-ui.settings.v1', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

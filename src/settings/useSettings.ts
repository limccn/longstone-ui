import { useSyncExternalStore } from 'react';
import { loadSettings, saveSettings, type Settings } from './store';

let current: Settings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Settings {
  current ??= loadSettings();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...getSnapshot(), ...patch };
  current = next;
  saveSettings(next);
  for (const listener of listeners) listener();
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getSettings(): Settings {
  return getSnapshot();
}

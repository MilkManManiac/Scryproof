/**
 * Names just for you.
 *
 * Wes: "let each person rename someone even if it's just on their end." A
 * local name is a per-device lens: it never reaches the server, never
 * syncs to another device, and does not touch anyone's real nickname or
 * display name. Kept in this browser only, the way `voice-prefs.ts` keeps
 * its settings.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'scryproof.local-names.v1';

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as Record<string, string>;
    return typeof stored === 'object' && stored !== null ? stored : {};
  } catch {
    return {};
  }
}

let current = load();
const listeners = new Set<() => void>();

export const localNames = {
  /** The name this device calls them, if one has been set. */
  get(userId: string): string | undefined {
    return current[userId];
  },

  /** Set the local name for someone, or clear it with an empty string. */
  set(userId: string, name: string): void {
    const trimmed = name.trim();
    const next = { ...current };
    if (trimmed) next[userId] = trimmed;
    else delete next[userId];
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Private windows can refuse storage. The name still holds for this tab.
    }
    for (const listener of listeners) listener();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** A stable reference to the whole map, for `useSyncExternalStore`. */
  snapshot(): Record<string, string> {
    return current;
  },
};

/**
 * The one function everything that shows a name should call: the local
 * name, if this device has set one, otherwise whatever it would have shown
 * anyway (a server nickname, a display name, "Someone").
 */
export function nameFor(userId: string, fallback: string): string {
  return localNames.get(userId) ?? fallback;
}

/**
 * Subscribes a component to local-name changes, so a rename shows up on
 * screen without a reload. Call once near the top of any component that
 * shows names (directly or through `nameOf`/`useNames`); nothing below it
 * needs to know local names exist.
 */
export function useLocalNames(): void {
  useSyncExternalStore(localNames.subscribe, localNames.snapshot, localNames.snapshot);
}

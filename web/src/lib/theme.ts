/**
 * Which theme this browser paints. Kept here only, like the voice
 * preferences: what colour your room is happens to be nobody's business but
 * yours, and it is not worth a round trip.
 *
 * Importing this module applies the saved theme to `<html>` at once, so
 * `main.tsx` imports it before the first render and the first frame is already
 * the right room.
 */

import { DEFAULT_THEME, isThemeId } from './themes';

const STORAGE_KEY = 'scryproof.theme.v1';

/** What a stored value means. Anything unknown (a theme since removed, junk) is the default. */
export function chooseTheme(stored: string | null | undefined): string {
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

function load(): string {
  try {
    return chooseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function paint(id: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = id;
}

let current = typeof localStorage === 'undefined' ? DEFAULT_THEME : load();
paint(current);

const listeners = new Set<() => void>();

export const theme = {
  get: (): string => current,

  set(id: string): void {
    const next = chooseTheme(id);
    if (next === current) return;
    current = next;
    paint(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private windows can refuse storage. The theme still holds for this tab.
    }
    for (const listener of listeners) listener();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

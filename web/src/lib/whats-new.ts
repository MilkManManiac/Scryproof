/**
 * Whether the person has read the newest entry in the changelog. Kept on
 * this device only, like the theme: a dot on your name until you open the
 * list, then nothing until the next release. Never a pop-up, never a sound
 * (Wes, 2026-09-22: "it doesn't notify them but they can see what has
 * changed").
 */

import { LATEST_RELEASE } from '../changelog';

const STORAGE_KEY = 'scryproof.whats-new.v1';

/** Pure, for the test: is there something newer than what was last read? */
export function unreadSince(seen: string | null, latest: string = LATEST_RELEASE.id): boolean {
  // A first visit does not get a dot: everything is new to a new person, and
  // a dot on day one only teaches them to ignore it.
  if (seen === null) return false;
  return seen !== latest;
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

export function hasUnread(): boolean {
  return unreadSince(readSeen());
}

export function subscribeUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markRead(): void {
  try {
    localStorage.setItem(STORAGE_KEY, LATEST_RELEASE.id);
  } catch {
    // Private windows can refuse storage. The dot comes back next time; harmless.
  }
  for (const listener of listeners) listener();
}

/**
 * On first sight of the app, remember the newest entry as read, so the dot
 * only ever means "something since you were last here".
 */
export function noteFirstVisit(): void {
  if (readSeen() === null) markRead();
}

/**
 * The one-time "How Scryproof works" walkthrough (Wes, 2026-09-25: "a 1 time
 * 'How the app works' tutorial at the beginning... in laymens terms").
 *
 * Shown by itself once, to someone new on this device, then never again on
 * its own, whether they finished it or skipped it. The menu behind your name
 * opens it any time. No sound, nothing that comes back.
 *
 * "New" means this device has never seen Scryproof: the What's new store is
 * empty too. People who were already here when this shipped are told about it
 * in the changelog instead of having it put in front of them.
 */

const STORAGE_KEY = 'scryproof.walkthrough.v1';
const WHATS_NEW_KEY = 'scryproof.whats-new.v1';

export type WalkthroughMark = 'due' | 'done';

/** Pure, for the test: what to write on first sight of the app, if anything. */
export function markOnFirstSight(walkthrough: string | null, whatsNew: string | null): WalkthroughMark | null {
  if (walkthrough !== null) return null;
  return whatsNew === null ? 'due' : 'done';
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(value: WalkthroughMark): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage refused (a private window). It may show again next visit; harmless.
  }
}

/**
 * Runs before `noteFirstVisit` in `main.tsx`, which fills the What's new
 * store and would make everyone look like they had been here before.
 */
export function noteWalkthroughFirstSight(): void {
  const mark = markOnFirstSight(read(STORAGE_KEY), read(WHATS_NEW_KEY));
  if (mark) write(mark);
}

const listeners = new Set<() => void>();
let openedByHand = false;

function tell(): void {
  for (const listener of listeners) listener();
}

export function subscribeWalkthrough(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Waiting to be shown by itself. */
export function walkthroughDue(): boolean {
  return read(STORAGE_KEY) === 'due';
}

/** Opened from the menu. */
export function walkthroughOpened(): boolean {
  return openedByHand;
}

export function openWalkthrough(): void {
  openedByHand = true;
  tell();
}

/** Finished or skipped: either way it does not come back by itself. */
export function closeWalkthrough(): void {
  openedByHand = false;
  write('done');
  tell();
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GAP = 16;

/** Beside the target if there is room, otherwise in the middle. Pure, for the test. */
export function placeCard(
  spot: Box | null,
  card: { width: number; height: number },
  view: { width: number; height: number },
): { top: number; left: number } {
  const middle = {
    top: Math.max(GAP, (view.height - card.height) / 2),
    left: Math.max(GAP, (view.width - card.width) / 2),
  };
  if (!spot) return middle;
  // Level with the middle of what it points at, kept on screen.
  const level = spot.top + spot.height / 2 - card.height / 2;
  const top = Math.min(Math.max(GAP, level), Math.max(GAP, view.height - card.height - GAP));
  if (spot.left + spot.width + GAP + card.width <= view.width - GAP) return { top, left: spot.left + spot.width + GAP };
  if (spot.left - GAP - card.width >= GAP) return { top, left: spot.left - GAP - card.width };
  // A wide target (the whole bar across the bottom, a phone screen): above or below it.
  if (spot.top - GAP - card.height >= GAP) return { top: spot.top - GAP - card.height, left: middle.left };
  if (spot.top + spot.height + GAP + card.height <= view.height - GAP) {
    return { top: spot.top + spot.height + GAP, left: middle.left };
  }
  return middle;
}

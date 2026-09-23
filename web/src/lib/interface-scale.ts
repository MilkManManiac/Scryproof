/**
 * How big the interface reads on this device. Same idea as theme.ts: kept
 * here only, applied to `<html>` at once so the first frame is already the
 * right size, and never sent anywhere.
 *
 * The steps are percentages of the browser's own default root size (usually
 * 16px), the standard way to scale everything defined in rem. Most of this
 * app's sizes are still fixed px, so this only moves what is written in rem
 * or em, or inherits from an ancestor that is: currently the base body text,
 * message text and the composer. Everything else (icon buttons, avatars,
 * the rail and sidebar widths, most badges and labels) stays the size it is.
 */

export const SCALE_STEPS = [90, 100, 110, 120, 130] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];

const DEFAULT_SCALE: ScaleStep = 100;
const STORAGE_KEY = 'scryproof.interface-scale.v1';

function isScaleStep(value: unknown): value is ScaleStep {
  return typeof value === 'number' && (SCALE_STEPS as readonly number[]).includes(value);
}

/** What a stored value means. Anything unknown (junk, a step since removed) is the default. */
export function chooseScale(stored: string | null | undefined): ScaleStep {
  const parsed = stored ? Number(stored) : NaN;
  return isScaleStep(parsed) ? parsed : DEFAULT_SCALE;
}

function load(): ScaleStep {
  try {
    return chooseScale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SCALE;
  }
}

function paint(percent: ScaleStep): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = percent === 100 ? '' : `${percent}%`;
}

let current = typeof localStorage === 'undefined' ? DEFAULT_SCALE : load();
paint(current);

const listeners = new Set<() => void>();

export const interfaceScale = {
  get: (): ScaleStep => current,

  set(percent: number): void {
    const next = isScaleStep(percent) ? percent : DEFAULT_SCALE;
    if (next === current) return;
    current = next;
    paint(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Private windows can refuse storage. The size still holds for this tab.
    }
    for (const listener of listeners) listener();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * How big the interface is on this device. Same idea as theme.ts: kept here
 * only, applied at once, never sent anywhere.
 *
 * In the desktop app this is the window's own zoom (`setZoom` on the
 * bridge), which scales every size and every pop-up position together. A
 * first try set the root font size instead; most of the stylesheet is px,
 * so that moved the message text and little else. Scaling the page with CSS
 * `zoom` looked right but puts anything placed at the mouse (menus, the
 * profile card) in the wrong spot. A browser has its own zoom (Ctrl and +),
 * so there this setting is not offered.
 */

import { canZoom, setZoom } from "./desktop";

export const SCALE_STEPS = [90, 100, 110, 120, 130] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];

const DEFAULT_SCALE: ScaleStep = 100;
const STORAGE_KEY = "scryproof.interface-scale.v1";

function isScaleStep(value: unknown): value is ScaleStep {
  return (
    typeof value === "number" &&
    (SCALE_STEPS as readonly number[]).includes(value)
  );
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
  if (canZoom) setZoom(percent / 100);
}

let current = typeof localStorage === "undefined" ? DEFAULT_SCALE : load();
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

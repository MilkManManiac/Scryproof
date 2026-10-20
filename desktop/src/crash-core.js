/**
 * What to do when the window's page dies (`render-process-gone`). The first
 * time, reload it. A second death within a minute of the last one is not
 * going to be fixed by a third try: say so plainly and quit.
 *
 * No Electron in this file, so `node --test` can run it.
 */

export const CRASH_WINDOW_MS = 60_000;

/** Call on every crash. Returns 'reload' or 'quit'. */
export function crashGuard(now = Date.now) {
  let last = null;
  return () => {
    const at = now();
    const again = last !== null && at - last < CRASH_WINDOW_MS;
    last = at;
    return again ? 'quit' : 'reload';
  };
}

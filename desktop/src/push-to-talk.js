/**
 * Push-to-talk that works while a game has the keyboard.
 *
 * A page only hears keys while its window is focused, so push-to-talk in the
 * browser stops the moment someone alt-tabs into a game. Here the main
 * process watches the keyboard system-wide through `uiohook-napi` (a
 * low-level Windows hook; vetted 2026-09-21: no network, imports only
 * kernel32/user32/advapi32; on macOS it is a CGEventTap) and tells the page one thing: whether the one
 * chosen key is held. The rules that keep a keyboard hook honest:
 *
 *   - It runs only while the page asks, which is only in a voice channel with
 *     push-to-talk chosen. Leave the channel, pick another mode, and it stops.
 *   - It watches for one key. Every other key is dropped here, in this
 *     process. Nothing about what was typed reaches the page, the server, or
 *     a file.
 *   - It watches; it does not intercept. The game still gets the key.
 *   - On macOS it does not start, and does not ask, until the page has chosen
 *     a key and the Accessibility permission is there. Starting the hook
 *     without the grant is what made macOS put its prompt up over and over
 *     (15 times in 20 minutes in spike 3); here it is asked once, through
 *     `systemPreferences`, and the hook is started only if it was granted.
 *   - A key held while the person leaves (Cmd-Tab, Alt-Tab, the screen locks,
 *     the machine sleeps) is released here, not left to a key-up that never
 *     comes. `push-to-talk-core.js` has the reasoning.
 */

import { createRequire } from 'node:module';

import { holdTracker, keycodeFor } from './push-to-talk-core.js';

const require = createRequire(import.meta.url);

let hook = null;
let listener = null;

/** The hook, loaded the first time it is wanted. Null where the module cannot load (no prebuilt for this machine). */
function loadHook() {
  if (hook) return hook;
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    hook = { io: uIOhook, keys: UiohookKey, started: false };
  } catch {
    hook = null;
  }
  return hook;
}

/** What the OS tells us about leaving: the screen locking, the machine going to sleep. */
const LEAVING = ['lock-screen', 'suspend'];

function stop() {
  if (!listener) return;
  const { hook: loaded, power } = listener;
  // A key still held when watching ends (re-armed after the Accessibility grant,
  // a changed key, the page going) must not leave the page believing it is held:
  // the next tracker starts from "up" and would swallow the real key-up.
  listener.leave();
  loaded.io.off('keydown', listener.down);
  loaded.io.off('keyup', listener.up);
  for (const name of LEAVING) power?.off(name, listener.leave);
  listener = null;
  if (loaded.started) {
    try { loaded.io.stop(); } catch { /* already stopped */ }
    loaded.started = false;
  }
}

/**
 * Watch `code` (a DOM key name), calling `onHold(true|false)` as it goes
 * down and up. `null` stops watching. Returns whether the key is watched.
 * `env` is for tests and for main.js: `platform`, `power` (Electron's
 * `powerMonitor`) and `loadHook` (a stand-in for the real hook).
 */
export function watchKey(code, onHold, env = {}) {
  stop();
  if (code === null) return false;
  const loaded = (env.loadHook ?? loadHook)();
  if (!loaded) return false;
  const keycode = keycodeFor(code, loaded.keys);
  if (keycode === null) return false;

  const platform = env.platform ?? process.platform;
  const track = holdTracker(keycode, onHold, { platform, keys: loaded.keys });
  listener = {
    hook: loaded,
    power: env.power ?? null,
    down: (event) => track({ type: 'keydown', keycode: event.keycode, altKey: event.altKey, metaKey: event.metaKey }),
    up: (event) => track({ type: 'keyup', keycode: event.keycode }),
    leave: () => track.release(),
  };
  loaded.io.on('keydown', listener.down);
  loaded.io.on('keyup', listener.up);
  for (const name of LEAVING) listener.power?.on(name, listener.leave);
  if (!loaded.started) {
    try {
      loaded.io.start();
      loaded.started = true;
    } catch {
      stop();
      return false;
    }
  }
  return true;
}

/**
 * Wire the page's requests. `ours` says whether a request came from our own
 * page; `target` is where held/released goes. `env` is `{ platform, power,
 * accessibility, loadHook }`: `accessibility(prompt)` is
 * `systemPreferences.isTrustedAccessibilityClient`, used on macOS only.
 */
export function armPushToTalk(ipcMain, ours, target, env = {}) {
  const platform = env.platform ?? process.platform;
  let asked = false;
  ipcMain.handle('scryproof:ptt-watch', (event, code) => {
    if (!ours(event)) return false;
    if (code !== null && typeof code !== 'string') return false;
    if (code !== null && platform === 'darwin') {
      // The first request puts up the system prompt; later ones only look.
      // Without the grant the hook is not started at all, so macOS has nothing
      // to ask about again. The page tries again after the person has said yes.
      const prompt = !asked;
      asked = true;
      if (!env.accessibility?.(prompt)) {
        stop();
        return false;
      }
    }
    return watchKey(code, (held) => target()?.webContents.send('scryproof:ptt', held), { ...env, platform });
  });
}

export const stopPushToTalk = stop;

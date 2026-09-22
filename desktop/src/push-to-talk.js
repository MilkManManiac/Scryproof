/**
 * Push-to-talk that works while a game has the keyboard.
 *
 * A page only hears keys while its window is focused, so push-to-talk in the
 * browser stops the moment someone alt-tabs into a game. Here the main
 * process watches the keyboard system-wide through `uiohook-napi` (a
 * low-level Windows hook; vetted 2026-09-21: no network, imports only
 * kernel32/user32/advapi32) and tells the page one thing: whether the one
 * chosen key is held. The rules that keep a keyboard hook honest:
 *
 *   - It runs only while the page asks, which is only in a voice channel with
 *     push-to-talk chosen. Leave the channel, pick another mode, and it stops.
 *   - It watches for one key. Every other key is dropped here, in this
 *     process. Nothing about what was typed reaches the page, the server, or
 *     a file.
 *   - It watches; it does not intercept. The game still gets the key.
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

function stop() {
  if (!hook || !listener) return;
  hook.io.off('keydown', listener.down);
  hook.io.off('keyup', listener.up);
  listener = null;
  if (hook.started) {
    try { hook.io.stop(); } catch { /* already stopped */ }
    hook.started = false;
  }
}

/**
 * Watch `code` (a DOM key name), calling `onHold(true|false)` as it goes
 * down and up. `null` stops watching. Returns whether the key is watched.
 */
export function watchKey(code, onHold) {
  stop();
  if (code === null) return false;
  const loaded = loadHook();
  if (!loaded) return false;
  const keycode = keycodeFor(code, loaded.keys);
  if (keycode === null) return false;

  const track = holdTracker(keycode, onHold);
  listener = {
    down: (event) => track({ type: 'keydown', keycode: event.keycode }),
    up: (event) => track({ type: 'keyup', keycode: event.keycode }),
  };
  loaded.io.on('keydown', listener.down);
  loaded.io.on('keyup', listener.up);
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

/** Wire the page's requests. `ours` says whether a request came from our own page; `target` is where held/released goes. */
export function armPushToTalk(ipcMain, ours, target) {
  ipcMain.handle('scryproof:ptt-watch', (event, code) => {
    if (!ours(event)) return false;
    if (code !== null && typeof code !== 'string') return false;
    return watchKey(code, (held) => target()?.webContents.send('scryproof:ptt', held));
  });
}

export const stopPushToTalk = stop;

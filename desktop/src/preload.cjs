/**
 * What the page is told: which server this build talks to. It needs
 * that for two addresses it cannot work out from `app://scryproof`: the gateway
 * socket, and the invite links it writes for people to paste into a browser.
 *
 *
 * And two things it can ask for: to be reloaded onto a newer client that the
 * main process has already fetched and checked (the page never sees the update
 * and has no say in whether it is genuine), and to be told when its
 * push-to-talk key goes down and up while another program has the keyboard.
 *
 * CommonJS because a sandboxed preload cannot be a module.
 */

const { contextBridge, ipcRenderer } = require('electron');

const read = (name) => {
  const flag = `--scryproof-${name}=`;
  const found = process.argv.find((value) => value.startsWith(flag));
  return found ? found.slice(flag.length) : '';
};

contextBridge.exposeInMainWorld(
  'scryproofDesktop',
  Object.freeze({
    server: read('server'),
    gateway: read('gateway'),
    shell: read('shell'),
    /** The version waiting, or null. */
    updateState: () => ipcRenderer.invoke('scryproof:update-state'),
    onUpdateReady: (listener) => {
      ipcRenderer.on('scryproof:update-ready', (_event, version) => listener(version));
    },
    applyUpdate: () => ipcRenderer.invoke('scryproof:update-apply'),
    /**
     * Watch one key (a `KeyboardEvent.code`) system-wide, or null to stop.
     * Resolves to whether it is being watched; false means fall back to the
     * window's own key events.
     */
    watchPushKey: (code) => ipcRenderer.invoke('scryproof:ptt-watch', code),
    /** Held or released, for the watched key only. Returns the way to stop listening. */
    onPushHold: (listener) => {
      const relay = (_event, held) => listener(held === true);
      ipcRenderer.on('scryproof:ptt', relay);
      return () => ipcRenderer.removeListener('scryproof:ptt', relay);
    },
  }),
);

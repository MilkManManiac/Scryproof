/**
 * What the page is told: which server this build talks to. It needs
 * that for two addresses it cannot work out from `app://scryproof`: the gateway
 * socket, and the invite links it writes for people to paste into a browser.
 *
 *
 * And the one thing it can ask for: to be reloaded onto a newer client that the
 * main process has already fetched and checked. The page never sees the update
 * and has no say in whether it is genuine.
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
    /** The version waiting, or null. */
    updateState: () => ipcRenderer.invoke('scryproof:update-state'),
    onUpdateReady: (listener) => {
      ipcRenderer.on('scryproof:update-ready', (_event, version) => listener(version));
    },
    applyUpdate: () => ipcRenderer.invoke('scryproof:update-apply'),
  }),
);

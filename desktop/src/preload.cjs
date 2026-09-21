/**
 * The only thing the page is told: which server this build talks to. It needs
 * that for two addresses it cannot work out from `app://scryproof`: the gateway
 * socket, and the invite links it writes for people to paste into a browser.
 *
 * CommonJS because a sandboxed preload cannot be a module.
 */

const { contextBridge } = require('electron');

const read = (name) => {
  const flag = `--scryproof-${name}=`;
  const found = process.argv.find((value) => value.startsWith(flag));
  return found ? found.slice(flag.length) : '';
};

contextBridge.exposeInMainWorld('scryproofDesktop', Object.freeze({ server: read('server'), gateway: read('gateway') }));

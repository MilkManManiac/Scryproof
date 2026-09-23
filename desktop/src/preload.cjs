/**
 * What the page is told: which server this build talks to. It needs
 * that for two addresses it cannot work out from `app://scryproof`: the gateway
 * socket, and the invite links it writes for people to paste into a browser.
 *
 *
 * And three things it can ask for: to be reloaded onto a newer client that the
 * main process has already fetched and checked (the page never sees the update
 * and has no say in whether it is genuine), to be restarted onto a newer
 * installer checked the same way, and to be told when its
 * push-to-talk key goes down and up while another program has the keyboard.
 * And the screen-share picker: the page draws it, the main process decides
 * what is actually shared.
 *
 * CommonJS because a sandboxed preload cannot be a module.
 */

const { contextBridge, ipcRenderer, webFrame } = require('electron');

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
    /** The same for the app itself: the version of a checked installer waiting, or null. */
    shellUpdateState: () => ipcRenderer.invoke('scryproof:shell-state'),
    onShellUpdateReady: (listener) => {
      ipcRenderer.on('scryproof:shell-ready', (_event, version) => listener(version));
    },
    /** Runs the installer and closes the app; the installer opens it again. */
    applyShellUpdate: () => ipcRenderer.invoke('scryproof:shell-apply'),
    /**
     * Watch one key (a `KeyboardEvent.code`) system-wide, or null to stop.
     * Resolves to whether it is being watched; false means fall back to the
     * window's own key events.
     */
    watchPushKey: (code) => ipcRenderer.invoke('scryproof:ptt-watch', code),
    /** Held or released, for the watched key only. Returns the way to stop listening. */
    /**
     * The interface scale from the page's settings: the browser's own zoom,
     * so every size and every pop-up position scales together.
     */
    setZoom: (factor) => {
      if (typeof factor === 'number' && factor >= 0.5 && factor <= 2) webFrame.setZoomFactor(factor);
    },
    onPushHold: (listener) => {
      const relay = (_event, held) => listener(held === true);
      ipcRenderer.on('scryproof:ptt', relay);
      return () => ipcRenderer.removeListener('scryproof:ptt', relay);
    },
    /**
     * The screen-share picker. `open` is called with the screens and windows
     * to choose from when the page asks to share, `close` when the shell has
     * answered for it (a newer request, say). Listening tells the shell this
     * page draws the picker. Returns the way to stop.
     */
    onShareRequest: (open, close) => {
      const relayOpen = (_event, request) => open(request);
      const relayClose = () => close();
      ipcRenderer.on('scryproof:share-open', relayOpen);
      ipcRenderer.on('scryproof:share-close', relayClose);
      ipcRenderer.send('scryproof:share-listen', true);
      return () => {
        ipcRenderer.removeListener('scryproof:share-open', relayOpen);
        ipcRenderer.removeListener('scryproof:share-close', relayClose);
        ipcRenderer.send('scryproof:share-listen', false);
      };
    },
    /** `{ id, withSound }` to share, null to cancel. Resolves to whether a share was started. */
    answerShare: (answer) =>
      ipcRenderer.invoke(
        'scryproof:share-answer',
        answer && typeof answer.id === 'string' ? { id: answer.id, withSound: answer.withSound === true } : null,
      ),
    /** Fresh pictures while the picker is open, or null once it is not. */
    refreshShare: () => ipcRenderer.invoke('scryproof:share-refresh'),
  }),
);

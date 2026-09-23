/**
 * Scryproof for the desktop.
 *
 * The point of this app is GAMEPLAN 1b, finding 2: a web page's code comes
 * from the server it is trying not to trust. Here the client is a folder inside
 * the installer, served to the window from `app://scryproof`. The server is
 * asked for data and nothing else. It is never asked for code.
 *
 * Three things leave this machine, all to the one server named below:
 *   - `/api/*`, which this process forwards, keeping the session cookie in its
 *     own jar. To the page it is still a relative path on its own origin, so
 *     the client is the same code the browser runs.
 *   - the gateway WebSocket, which the page opens itself. The cookie is added
 *     to the handshake here, because the page cannot see it (httpOnly) and the
 *     browser would not send it across origins.
 *   - voice, which goes to LiveKit with a token and needs nothing from us.
 *
 * Two things arrive that are code: a newer client, from /desktop-update/, and
 * a newer installer for this app itself, from /download/. Each is used only if
 * it was signed by the key this build was made with, which is on Wes's PC and
 * not on the server. `update-core.js` and `installer-core.js`.
 *
 * One thing this process does that a browser cannot: hear the push-to-talk
 * key while a game has the keyboard. `push-to-talk.js`, and its rules.
 */

import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, net, protocol, session, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { armContextMenu } from './context-menu.js';
import {
  installerFileName,
  isNewerVersion,
  readInstallerManifest,
  verifyInstallerFile,
  versionFromFileName,
} from './installer-core.js';
import { armPushToTalk, stopPushToTalk } from './push-to-talk.js';
import { shareMenuTemplate, shareStreams } from './share-menu.js';
import { MAX_BUNDLE_BYTES, openBundle, readManifest } from './update-core.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The one server this build talks to. Overridable only for development. */
const SERVER = new URL(app.isPackaged ? 'https://scryproof.com' : (process.env.SCRYPROOF_SERVER ?? 'https://scryproof.com'));
/** Development only: where a local LiveKit listens, so the page is allowed to reach it. */
const DEV_MEDIA = app.isPackaged ? '' : (process.env.SCRYPROOF_DEV_MEDIA ?? '');

const APP_ORIGIN = 'app://scryproof';
const CLIENT_DIR = app.isPackaged ? join(process.resourcesPath, 'client') : join(here, '..', '..', 'web', 'dist');
const GATEWAY = `${SERVER.protocol === 'https:' ? 'wss' : 'ws'}://${SERVER.host}/gateway`;

/** Where newer clients are looked for. An installed copy looks on its one server and cannot be told otherwise. */
const UPDATE_URL = app.isPackaged ? `${SERVER.origin}/desktop-update/` : (process.env.SCRYPROOF_UPDATE_URL ?? '');
const UPDATE_KEY_FILE = join(here, 'update-key.pub.pem');
const UPDATE_KEY = existsSync(UPDATE_KEY_FILE) ? readFileSync(UPDATE_KEY_FILE, 'utf8') : '';
const UPDATE_EVERY_MS = app.isPackaged ? 5 * 60_000 : Number(process.env.SCRYPROOF_UPDATE_EVERY_MS ?? 5 * 60_000);
/**
 * Where newer installers are looked for. An installed copy only: a
 * development run is electron.exe from node_modules, and running an installer
 * from it would install over the real app.
 */
const INSTALLER_URL = app.isPackaged ? `${SERVER.origin}/download/` : '';
const INSTALLER_EVERY_MS = 60 * 60_000;
const BUNDLED_VERSION = (() => {
  try {
    return Number(JSON.parse(readFileSync(join(here, 'client-version.json'), 'utf8')).version) || 0;
  } catch {
    return 0;
  }
})();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/**
 * The same policy nginx sends with the web client, except that the page may
 * also connect to the server by name: here it is no longer 'self'.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' ${SERVER.origin} ${GATEWAY.replace(/\/gateway$/, '')} ${DEV_MEDIA}`.trim(),
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

// Must happen before the app is ready. `secure` is what keeps crypto.subtle,
// IndexedDB and the microphone available: they exist only in a secure context.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// An installed copy does not open a debugging port for whoever asks. That port
// is a way to run code in the page, which is where the keys are.
const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk'];
const debugged = app.isPackaged && DEBUG_SWITCHES.some((name) => app.commandLine.hasSwitch(name));

if (debugged || !app.requestSingleInstanceLock()) app.exit(0);

/* --------------------------------- serving --------------------------------- */

/**
 * The client being shown. `files` is null for the one inside the installer,
 * which is read from disk, and a Map for an update, which is held in memory:
 * it was verified as one piece, so it is served from that piece, and nothing
 * on disk can be edited between the check and the use.
 */
let client = { version: BUNDLED_VERSION, files: null };
/** A verified update that is waiting for the person to say reload. */
let pending = null;

function serveUpdate(pathname, headers) {
  const path = decodeURIComponent(pathname).replace(/^\/+/, '');
  const asFile = extname(path) ? client.files.get(path) : undefined;
  if (extname(path) && !asFile) return new Response('Not found', { status: 404, headers });
  const body = asFile ?? client.files.get('index.html');
  const type = asFile ? (TYPES[extname(path)] ?? 'application/octet-stream') : TYPES['.html'];
  return new Response(body, { headers: { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' } });
}

/** A file from the client. Anything that is not a file is the app itself. */
async function serveClient(pathname) {
  const headers = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP };
  if (client.files) return serveUpdate(pathname, headers);

  const wanted = normalize(join(CLIENT_DIR, decodeURIComponent(pathname)));
  const inside = wanted === CLIENT_DIR || wanted.startsWith(CLIENT_DIR + sep);

  if (inside && extname(wanted)) {
    try {
      const body = await readFile(wanted);
      return new Response(body, { headers: { ...headers, 'Content-Type': TYPES[extname(wanted)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('Not found', { status: 404, headers });
    }
  }
  const index = await readFile(join(CLIENT_DIR, 'index.html'));
  return new Response(index, { headers: { ...headers, 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' } });
}

/** Headers the page's request carries that are about the page, not the request. */
const NOT_FORWARDED = new Set(['origin', 'referer', 'host', 'cookie', 'connection', 'content-length']);

/**
 * Pass an API call to the server. No Origin goes with it: that header would
 * say `app://scryproof`, which the server has never heard of, and this is not
 * a browser wandering in from another site. The session cookie lives in this
 * process's jar and is attached by `credentials: 'include'`.
 */
function forward(request, url) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!NOT_FORWARDED.has(name.toLowerCase()) && !name.toLowerCase().startsWith('sec-')) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return net.fetch(new URL(url.pathname + url.search, SERVER).toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? 'half' : undefined,
    credentials: 'include',
    redirect: 'manual',
    // Without this the request would come back round to the handler below.
    bypassCustomProtocolHandlers: true,
  });
}

function handle(request) {
  const url = new URL(request.url);
  if (url.host !== 'scryproof') return new Response('Not found', { status: 404 });
  if (url.pathname.startsWith('/api/')) return forward(request, url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Not allowed', { status: 405 });
  return serveClient(url.pathname);
}

/* --------------------------------- updates --------------------------------- */

const updateDir = () => join(app.getPath('userData'), 'client-update');

/** An update fetched on an earlier run. Checked again from scratch: the folder is only a cache. */
async function loadStoredUpdate() {
  if (!UPDATE_KEY) return;
  try {
    const manifest = readManifest(await readFile(join(updateDir(), 'client.json'), 'utf8'), UPDATE_KEY);
    if (!manifest || manifest.version <= client.version) return;
    const files = openBundle(await readFile(join(updateDir(), 'client.bin')), manifest);
    if (files) client = { version: manifest.version, files };
  } catch { /* nothing stored, or not readable: the bundled client is fine */ }
}

async function checkForUpdate() {
  if (!UPDATE_URL || !UPDATE_KEY) return;
  try {
    const get = (name) => net.fetch(new URL(name, UPDATE_URL).toString(), { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    const reply = await get('client.json');
    if (!reply.ok) return;
    const manifest = readManifest(await reply.text(), UPDATE_KEY);
    // Forward only. An older client, however genuinely signed, is not an update.
    if (!manifest || manifest.version <= Math.max(client.version, pending?.version ?? 0)) return;

    const download = await get('client.bin');
    if (!download.ok || Number(download.headers.get('content-length') ?? 0) > MAX_BUNDLE_BYTES) return;
    const bundle = Buffer.from(await download.arrayBuffer());
    const files = openBundle(bundle, manifest);
    if (!files) return;

    await mkdir(updateDir(), { recursive: true });
    for (const [name, body] of [['client.bin', bundle], ['client.json', JSON.stringify(manifest)]]) {
      await writeFile(join(updateDir(), `${name}.part`), body);
      await rename(join(updateDir(), `${name}.part`), join(updateDir(), name));
    }
    pending = { version: manifest.version, files };
    win?.webContents.send('scryproof:update-ready', manifest.version);
  } catch { /* offline, or the server is down. Ask again later. */ }
}

/** Whether a request over the bridge came from our own page. */
const ours = (event) => event.senderFrame?.url.startsWith(`${APP_ORIGIN}/`) ?? false;

/** The page asks whether anything is waiting, and says when to switch. Only our own page is listened to. */
function armUpdates() {
  ipcMain.handle('scryproof:update-state', (event) => (ours(event) ? (pending?.version ?? null) : null));
  ipcMain.handle('scryproof:update-apply', (event) => {
    if (!ours(event) || !pending) return false;
    client = pending;
    pending = null;
    win?.reload();
    return true;
  });
  void checkForUpdate();
  setInterval(() => void checkForUpdate(), UPDATE_EVERY_MS).unref();
}

/* ------------------------------ shell updates ------------------------------ */

/**
 * The app around the client (Electron, this folder) changes only by running a
 * new installer. The installer is fetched and checked here, in full, before
 * the page hears about it; the page only chooses the moment, as it does for a
 * client. When both are waiting the installer wins, because it carries a
 * client of its own.
 *
 * What is never done: run a file that failed a check (it is deleted), or run
 * an installer that is not newer than the app running it, however genuinely
 * signed. There is no going back through this path; that is a reinstall by
 * hand.
 */
const shellDir = () => join(app.getPath('userData'), 'shell-update');
/** A verified installer waiting for the person to say restart: { version, path, manifest }. */
let pendingShell = null;
let shellChecking = false;

/** Anything in the folder that is not a newer installer is gone: half downloads, and the installer that put this version here. */
async function tidyShellDir() {
  try {
    for (const name of await readdir(shellDir())) {
      const version = versionFromFileName(name);
      if (!version || !isNewerVersion(version, app.getVersion())) await rm(join(shellDir(), name), { force: true });
    }
  } catch { /* no folder yet */ }
}

/** Download `url` to `path`, stopping as soon as it is bigger than it said it would be. */
async function download(url, path, size) {
  const reply = await net.fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!reply.ok || !reply.body) throw new Error(`HTTP ${reply.status}`);
  if (Number(reply.headers.get('content-length') ?? 0) > size) throw new Error('bigger than it was signed at');
  let written = 0;
  await pipeline(
    Readable.fromWeb(reply.body),
    async function* (source) {
      for await (const chunk of source) {
        written += chunk.length;
        if (written > size) throw new Error('bigger than it was signed at');
        yield chunk;
      }
    },
    createWriteStream(path),
  );
}

async function checkForShellUpdate() {
  if (!INSTALLER_URL || !UPDATE_KEY || shellChecking) return;
  shellChecking = true;
  const part = join(shellDir(), 'installer.part');
  try {
    const get = (name) => net.fetch(new URL(name, INSTALLER_URL).toString(), { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    const reply = await get('installer.json');
    if (!reply.ok) return;
    const manifest = readInstallerManifest(await reply.text(), UPDATE_KEY);
    // Forward only, and nothing already waiting is fetched twice.
    if (!manifest || !isNewerVersion(manifest.version, app.getVersion())) return;
    if (pendingShell && !isNewerVersion(manifest.version, pendingShell.version)) return;

    await mkdir(shellDir(), { recursive: true });
    const path = join(shellDir(), installerFileName(manifest.version));
    // Fetched on an earlier run: kept only if it is still exactly what was signed.
    if (!(await verifyInstallerFile(path, manifest))) {
      await rm(path, { force: true });
      await download(new URL('Scryproof-Setup.exe', INSTALLER_URL).toString(), part, manifest.size);
      if (!(await verifyInstallerFile(part, manifest))) return;
      await rename(part, path);
    }
    if (pendingShell) await rm(pendingShell.path, { force: true });
    pendingShell = { version: manifest.version, path, manifest };
    win?.webContents.send('scryproof:shell-ready', manifest.version);
  } catch {
    /* offline, the server is down, or it is mid-publish. Ask again later. */
  } finally {
    await rm(part, { force: true }).catch(() => {});
    shellChecking = false;
  }
}

/**
 * Run the waiting installer and get out of its way. `--updated` is what
 * electron-builder's own updater passes: the installer waits for this app to
 * close instead of killing it, and keeps the shortcuts. `/S` is silent (a
 * one-click install needs no questions), `--force-run` starts the new version
 * when it is done. The login is in userData, which an upgrade leaves alone.
 */
async function applyShellUpdate() {
  const waiting = pendingShell;
  if (!waiting) return false;
  // Checked again from scratch: the file sat on disk since it was verified.
  if (!isNewerVersion(waiting.version, app.getVersion()) || !(await verifyInstallerFile(waiting.path, waiting.manifest))) {
    pendingShell = null;
    await rm(waiting.path, { force: true }).catch(() => {});
    return false;
  }
  // Quit only once Windows has actually started it. An installer that never ran leaves the app open, not gone.
  const started = await new Promise((resolve) => {
    try {
      const child = spawn(waiting.path, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' });
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
      child.once('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
  if (!started) return false;
  quitting = true;
  app.quit();
  return true;
}

function armShellUpdates() {
  ipcMain.handle('scryproof:shell-state', (event) => (ours(event) ? (pendingShell?.version ?? null) : null));
  ipcMain.handle('scryproof:shell-apply', (event) => (ours(event) ? applyShellUpdate() : false));
  if (!INSTALLER_URL) return;
  void tidyShellDir().then(checkForShellUpdate);
  setInterval(() => void checkForShellUpdate(), INSTALLER_EVERY_MS).unref();
}

/* --------------------------------- gateway --------------------------------- */

/**
 * The page opens the gateway socket itself. Two things about the handshake are
 * put right on the way out: it gets the session cookie, and it loses an Origin
 * the server would refuse.
 */
function armGateway(ses) {
  ses.webRequest.onBeforeSendHeaders({ urls: [`${GATEWAY}*`] }, (details, done) => {
    void (async () => {
      const headers = { ...details.requestHeaders };
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'origin' || name.toLowerCase() === 'cookie') delete headers[name];
      }
      const cookies = await ses.cookies.get({ url: SERVER.origin });
      if (cookies.length > 0) headers.Cookie = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
      done({ requestHeaders: headers });
    })();
  });
}

/* ------------------------------- permissions ------------------------------- */

const GRANTED = new Set(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);

function armPermissions(ses) {
  const ours = (origin) => typeof origin === 'string' && origin.replace(/\/$/, '') === APP_ORIGIN;
  ses.setPermissionRequestHandler((contents, permission, done) => done(ours(contents.getURL().slice(0, APP_ORIGIN.length)) && GRANTED.has(permission)));
  ses.setPermissionCheckHandler((_contents, permission, origin) => ours(origin) && GRANTED.has(permission));

  // Windows has no picker of its own to hand over to, so this is ours: a plain
  // list, and a sound checkbox that is off until ticked. "With sound" is the
  // whole machine's audio, the call included; `share-menu.js` says why.
  ses.setDisplayMediaRequestHandler((request, done) => {
    void (async () => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      let answered = false;
      let reopening = false;
      const answer = (streams) => {
        if (answered) return;
        answered = true;
        try { done(streams); } catch { /* an empty answer throws to cancel; that is the cancel */ }
      };
      const open = () => {
        const withSound = shareWithSound();
        Menu.buildFromTemplate(
          shareMenuTemplate(sources, {
            audioRequested: request.audioRequested,
            platform: process.platform,
            withSound,
            onPick: (source) => answer(shareStreams(source, { audioRequested: request.audioRequested, platform: process.platform, withSound })),
            onToggleSound: (on) => {
              // Any click closes the menu, the checkbox too. Save the choice and put the menu back.
              reopening = true;
              void setShareWithSound(on);
              setTimeout(() => {
                reopening = false;
                open();
              }, 0);
            },
          }),
        ).popup({
          callback: () => {
            // Closed without choosing. Electron wants an answer either way. A
            // tick later, because the item's click can arrive after the close.
            setTimeout(() => {
              if (!reopening) answer({});
            }, 0);
          },
        });
      };
      open();
    })();
  });
}

/** Whether the last share was sent with sound. Remembered on this machine; off until ticked once. */
const shareFile = () => join(app.getPath('userData'), 'share.json');
let withSoundCache = null;
function shareWithSound() {
  if (withSoundCache === null) {
    try {
      withSoundCache = JSON.parse(readFileSync(shareFile(), 'utf8')).withSound === true;
    } catch {
      withSoundCache = false;
    }
  }
  return withSoundCache;
}
async function setShareWithSound(on) {
  withSoundCache = on;
  try {
    await writeFile(shareFile(), JSON.stringify({ withSound: on }));
  } catch { /* not remembered next time; this time still holds */ }
}

/* ---------------------------------- window --------------------------------- */

/** Opens a web address in the real browser. Used for links out of the page, and "Open link" on the right-click menu. */
const outside = (target) => {
  try {
    const url = new URL(target);
    if (url.protocol === 'https:' || url.protocol === 'http:') void shell.openExternal(url.toString());
  } catch { /* not an address */ }
};

let win = null;
let tray = null;
/** Closing the window leaves the app in the tray, so a call or a pop-up survives it. Quit is in the tray menu. */
let quitting = false;

/* ----------------------------- start with Windows ----------------------------- */

/**
 * Off until the person turns it on in the tray menu. Turning it on writes one
 * Run entry for this account (HKCU, nothing machine-wide), and Windows then
 * starts the app at sign-in with `--hidden`: into the tray, no window in
 * anyone's face. An installed copy only; a development run is electron.exe and
 * must not be put in anyone's start-up.
 */
const HIDDEN_ARG = '--hidden';
const loginItem = { openAtLogin: false, args: [HIDDEN_ARG] };
const startsWithWindows = () => app.isPackaged && app.getLoginItemSettings({ args: loginItem.args }).openAtLogin;
const setStartsWithWindows = (on) => app.setLoginItemSettings({ ...loginItem, openAtLogin: on });
const startedHidden = process.argv.includes(HIDDEN_ARG);

function show() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Scryproof', click: show },
    { type: 'separator' },
    {
      label: 'Start with Windows (in the tray)',
      type: 'checkbox',
      checked: startsWithWindows(),
      enabled: app.isPackaged,
      click: (item) => {
        setStartsWithWindows(item.checked);
        // Read back what Windows has, not what was asked for.
        tray.setContextMenu(trayMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(join(here, '..', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Scryproof');
  tray.setContextMenu(trayMenu());
  tray.on('click', show);
}

function createWindow(visible = true) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#14161c',
    title: 'Scryproof',
    autoHideMenuBar: true,
    // Started by Windows at sign-in: load the page (so the gateway connects and
    // pop-ups arrive) but stay in the tray until clicked.
    show: visible,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--scryproof-server=${SERVER.origin}`, `--scryproof-gateway=${GATEWAY}`, `--scryproof-shell=${app.getVersion()}`],
    },
  });

  // The window shows this app and nothing else. A link in a message opens in
  // the real browser, and only if it is a web address.
  win.webContents.setWindowOpenHandler(({ url }) => {
    outside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${APP_ORIGIN}/`)) return;
    event.preventDefault();
    outside(url);
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  armContextMenu(win.webContents, outside);
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  // A page that goes away (reload onto a newer client) takes its request for
  // the key with it. The next page asks again if it wants it.
  win.webContents.on('did-navigate', stopPushToTalk);
  win.on('closed', () => {
    win = null;
    stopPushToTalk();
  });

  void win.loadURL(`${APP_ORIGIN}/`);
}

app.on('second-instance', show);
app.on('before-quit', () => {
  quitting = true;
  stopPushToTalk();
});
app.on('window-all-closed', () => app.quit());

void app.whenReady().then(async () => {
  await loadStoredUpdate();
  // Windows files pop-ups under this name, and shows none at all without it.
  app.setAppUserModelId('com.scryproof.desktop');
  Menu.setApplicationMenu(null);
  createTray();
  protocol.handle('app', handle);
  armGateway(session.defaultSession);
  armPermissions(session.defaultSession);
  createWindow(!startedHidden);
  armUpdates();
  armShellUpdates();
  armPushToTalk(ipcMain, ours, () => win);
});

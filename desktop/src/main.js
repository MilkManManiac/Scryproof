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
 * One thing arrives that is code: a newer client, from /desktop-update/. It is
 * used only if it was signed by the key this build was made with, which is on
 * Wes's PC and not on the server. `update-core.js`.
 */

import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, net, protocol, session, shell, Tray } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const UPDATE_EVERY_MS = app.isPackaged ? 10 * 60_000 : Number(process.env.SCRYPROOF_UPDATE_EVERY_MS ?? 10 * 60_000);
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

/** The page asks whether anything is waiting, and says when to switch. Only our own page is listened to. */
function armUpdates() {
  const ours = (event) => event.senderFrame?.url.startsWith(`${APP_ORIGIN}/`) ?? false;
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
  // list for now. "With sound" is the whole machine's audio; Windows offers
  // nothing finer to an app like this one.
  ses.setDisplayMediaRequestHandler((request, done) => {
    void (async () => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      let chosen = false;
      const pick = (source) => () => {
        chosen = true;
        done(request.audioRequested && process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source });
      };
      const entry = (source) => ({ label: source.name.slice(0, 80) || 'Untitled', click: pick(source) });
      const screens = sources.filter((source) => source.id.startsWith('screen:'));
      const windows = sources.filter((source) => source.id.startsWith('window:'));
      Menu.buildFromTemplate([
        { label: 'Share a screen', enabled: false },
        ...screens.map(entry),
        { type: 'separator' },
        { label: 'Share a window', enabled: false },
        ...windows.map(entry),
      ]).popup({
        callback: () => {
          // Closed without choosing. Electron wants an answer either way.
          if (!chosen) try { done({}); } catch { /* it throws to cancel; that is the cancel */ }
        },
      });
    })();
  });
}

/* ---------------------------------- window --------------------------------- */

let win = null;
let tray = null;
/** Closing the window leaves the app in the tray, so a call or a pop-up survives it. Quit is in the tray menu. */
let quitting = false;

function show() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(join(here, '..', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Scryproof');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Scryproof', click: show },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', show);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#14161c',
    title: 'Scryproof',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--scryproof-server=${SERVER.origin}`, `--scryproof-gateway=${GATEWAY}`],
    },
  });

  // The window shows this app and nothing else. A link in a message opens in
  // the real browser, and only if it is a web address.
  const outside = (target) => {
    try {
      const url = new URL(target);
      if (url.protocol === 'https:' || url.protocol === 'http:') void shell.openExternal(url.toString());
    } catch { /* not an address */ }
  };
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
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    win = null;
  });

  void win.loadURL(`${APP_ORIGIN}/`);
}

app.on('second-instance', show);
app.on('before-quit', () => {
  quitting = true;
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
  createWindow();
  armUpdates();
});

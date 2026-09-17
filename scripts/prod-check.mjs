/**
 * Rehearse production on this machine, before there is a box.
 *
 * Three things only ever happen in production, and each one is a classic way
 * for a first deploy to fail at the worst moment:
 *
 *   1. The API runs from its bundled build with NODE_ENV=production.
 *   2. The client is served as built files under a strict Content-Security-
 *      Policy. One inline script or stray data: URL and the page is blank.
 *   3. Everything goes through a reverse proxy, including the WebSocket.
 *
 * So this starts the production build of the API, puts a small stand-in for
 * nginx in front of it, and drives a real headless browser through sign-up.
 * The stand-in reads its headers out of the real nginx template
 * (infra/custom/templates/site-nginx.conf.j2), so what is tested here is the
 * policy that ships, not a copy of it.
 *
 *   npm run build && npm run test:prod
 *
 * It does not prove nginx itself is configured correctly. It proves the app
 * survives the conditions nginx will impose.
 */

import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

import { WebSocket } from 'ws';

const ROOT = resolve(import.meta.dirname, '..');
const WEB_DIST = join(ROOT, 'web/dist');
const SERVER_BUNDLE = join(ROOT, 'server/dist/index.js');
const TEMPLATE = join(ROOT, 'infra/custom/templates/site-nginx.conf.j2');

const API_PORT = 8798;
const FRONT_PORT = 8797;
const DEBUG_PORT = 9334;
const ORIGIN = `http://localhost:${FRONT_PORT}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n      ${detail}` : ''}`);
};

for (const needed of [SERVER_BUNDLE, join(WEB_DIST, 'index.html')]) {
  if (!existsSync(needed)) {
    console.error(`Missing ${needed}. Run "npm run build" first.`);
    process.exit(2);
  }
}

// ---- headers, from the real template -----------------------------------------

/** The add_header lines inside `location / { ... }`, which is what serves the page. */
function headersFromTemplate() {
  const text = readFileSync(TEMPLATE, 'utf8');
  const start = text.indexOf('location / {');
  const block = text.slice(start, text.indexOf('}', start));
  const headers = {};
  for (const match of block.matchAll(/add_header\s+(\S+)\s+"([^"]*)"/g)) headers[match[1]] = match[2];
  return headers;
}

const PAGE_HEADERS = headersFromTemplate();

// ---- the production API ------------------------------------------------------

const dataDir = mkdtempSync(join(tmpdir(), 'gooffline-prod-'));
const api = spawn(process.execPath, [SERVER_BUNDLE], {
  cwd: join(ROOT, 'server'),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(API_PORT),
    DATA_DIR: dataDir,
    DATABASE_URL: '',
    PUBLIC_URL: ORIGIN,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    REGISTRATION_REQUIRES_INVITE: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let apiLog = '';
api.stdout.on('data', (chunk) => (apiLog += chunk));
api.stderr.on('data', (chunk) => (apiLog += chunk));

// ---- the stand-in for nginx ---------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function forwardedFor(request) {
  const existing = request.headers['x-forwarded-for'];
  const peer = request.socket.remoteAddress ?? '';
  // Exactly what $proxy_add_x_forwarded_for does: append, never replace.
  return existing ? `${existing}, ${peer}` : peer;
}

const front = createServer((request, response) => {
  const url = new URL(request.url, ORIGIN);

  if (url.pathname.startsWith('/api/')) {
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: API_PORT,
        path: request.url,
        method: request.method,
        headers: {
          ...request.headers,
          'x-forwarded-for': forwardedFor(request),
          'x-forwarded-proto': 'https',
        },
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
    return;
  }

  // try_files $uri /index.html
  let file = normalize(join(WEB_DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(WEB_DIST) || !existsSync(file) || !statSync(file).isFile()) {
    file = join(WEB_DIST, 'index.html');
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    ...PAGE_HEADERS,
  });
  createReadStream(file).pipe(response);
});

// The WebSocket: replay the upgrade request upstream and splice the two sockets.
front.on('upgrade', (request, socket, head) => {
  if (!request.url.startsWith('/gateway')) {
    socket.destroy();
    return;
  }
  const upstream = netConnect(API_PORT, '127.0.0.1', () => {
    const headers = { ...request.headers, 'x-forwarded-for': forwardedFor(request) };
    const lines = [
      `${request.method} ${request.url} HTTP/1.1`,
      ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
      '',
      '',
    ];
    upstream.write(lines.join('\r\n'));
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

// ---- the browser ---------------------------------------------------------------

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);
const browserPath = CANDIDATES.find((path) => existsSync(path));
if (!browserPath) {
  console.error('No Chromium-based browser found. Set CHROME to one.');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'gooffline-prodcheck-'));
let browser;
let socket;

function cleanup() {
  try {
    socket?.close();
  } catch {}
  try {
    browser?.kill();
  } catch {}
  try {
    api.kill();
  } catch {}
  try {
    front.close();
  } catch {}
  for (const dir of [profile, dataDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}
process.on('exit', cleanup);

let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolveSend, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      socket.off('message', onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolveSend(message.result);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function until(probe, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => null);
    if (value) return value;
    await sleep(200);
  }
  return null;
}

async function main() {
  await new Promise((done) => front.listen(FRONT_PORT, '127.0.0.1', done));

  const healthy = await until(
    async () => (await fetch(`http://127.0.0.1:${API_PORT}/api/health`)).ok,
    20_000,
  );
  check('the bundled API starts with NODE_ENV=production', Boolean(healthy), apiLog.slice(-600));
  if (!healthy) return;

  const policy = PAGE_HEADERS['Content-Security-Policy'] ?? '';
  check('the page is served with a Content-Security-Policy', policy.length > 0);
  check('the policy allows no inline or eval script', !/unsafe-inline|unsafe-eval/.test(policy));

  browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,800',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const target = await until(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    return targets.find((entry) => entry.type === 'page')?.webSocketDebuggerUrl;
  });
  if (!target) throw new Error('The browser never opened its debugging port.');
  socket = await new Promise((opened, reject) => {
    const ws = new WebSocket(target);
    ws.once('open', () => opened(ws));
    ws.once('error', reject);
  });

  // Everything the browser complains about, and every WebSocket frame it gets.
  const complaints = [];
  let gatewayFrames = 0;
  let gatewayOpened = false;
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      // Two refusals are this script's own doing: 401 from /api/auth/me is how
      // a signed-out visitor is detected, and the uninvited sign-up below is
      // supposed to be turned away.
      const expected =
        entry.source === 'network' &&
        (/\b401\b/.test(entry.text) || (entry.url ?? '').endsWith('/api/auth/register'));
      if ((entry.level === 'error' || entry.source === 'security') && !expected) {
        complaints.push(`[${entry.source}] ${entry.text} ${entry.url ?? ''}`);
      }
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      complaints.push(`[exception] ${details.exception?.description ?? details.text}`);
    }
    if (message.method === 'Network.webSocketHandshakeResponseReceived') {
      gatewayOpened = message.params.response.status === 101;
    }
    if (message.method === 'Network.webSocketFrameReceived') gatewayFrames += 1;
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__csp.push(event.violatedDirective + ' blocked ' + (event.blockedURI || 'inline'));
      });
    `,
  });

  await send('Page.navigate', { url: `${ORIGIN}/` });
  const rendered = await until(() =>
    evaluate(`document.getElementById('root')?.children.length > 0 && document.body.innerText.length > 0`),
  );
  check('the built client renders under the policy', Boolean(rendered), complaints.join('\n      '));

  // Sign up from inside the page, so the request carries a real browser Origin,
  // gets a real Secure cookie, and crosses the proxy like a visitor's would.
  const name = `prod${Date.now().toString(36)}`;
  const registered = await evaluate(`
    fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '${name}', displayName: 'Prod Check', password: 'a-long-enough-passphrase' }),
    }).then(async (reply) => ({ status: reply.status, body: await reply.text() }))
  `);
  check('the first account registers through the proxy (origin check passes)', registered.status === 200, registered.body);

  const me = await evaluate(`fetch('/api/auth/me', { credentials: 'include' }).then((reply) => reply.status)`);
  check('the Secure session cookie is kept and sent back', me === 200, `GET /api/auth/me -> ${me}`);

  const uninvited = await evaluate(`
    fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '${name}x', displayName: 'Nope', password: 'a-long-enough-passphrase' }),
    }).then((reply) => reply.status)
  `);
  check('a second sign-up without an invite is refused', uninvited !== 200, `status ${uninvited}`);

  await send('Page.navigate', { url: `${ORIGIN}/` });
  await until(async () => gatewayOpened && gatewayFrames > 0, 15_000);
  check('the gateway WebSocket upgrades through the proxy', gatewayOpened);
  check('the gateway delivers events through the proxy', gatewayFrames > 0, `${gatewayFrames} frames`);

  const signedIn = await until(() =>
    evaluate(`!/sign in/i.test(document.body.innerText) && document.body.innerText.length > 40`),
  );
  check('the signed-in app renders', Boolean(signedIn));

  await sleep(1500);
  const violations = await evaluate('window.__csp');
  check('no Content-Security-Policy violations', violations.length === 0, violations.join('\n      '));
  check('no browser errors', complaints.length === 0, complaints.join('\n      '));

  // The forged-address attack, end to end through a proxy that appends.
  const statuses = [];
  for (let attempt = 1; attempt <= 13; attempt += 1) {
    const reply = await fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.66.0.${attempt}` },
      body: JSON.stringify({ username: 'nobody', password: 'wrong-wrong-wrong' }),
    });
    statuses.push(reply.status);
  }
  check('a forged X-Forwarded-For does not dodge the login rate limit', statuses.includes(429), statuses.join(' '));

  if (process.env.PROD_CHECK_SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.PROD_CHECK_SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`screenshot: ${process.env.PROD_CHECK_SHOT}`);
  }
}

main()
  .catch((problem) => check('the rehearsal ran to completion', false, problem.stack ?? String(problem)))
  .finally(() => {
    const failed = results.filter((entry) => !entry.ok).length;
    console.log(
      failed === 0 ? `RESULT: ALL PASS (${results.length})` : `RESULT: ${failed} FAILED of ${results.length}`,
    );
    cleanup();
    process.exit(failed === 0 ? 0 : 1);
  });

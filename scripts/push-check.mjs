/**
 * Prove a phone notification end to end, with a real browser and a real relay.
 *
 * `npm test` covers what the server decides. This covers the rest: that
 * Google's relay accepts our signed, empty ping, that the service worker is
 * woken by it, asks our server what it was about, and draws the notification.
 *
 * Real Chrome (not headless: headless Chrome never connects to Google's push
 * service), window pushed off screen, its own throwaway profile. It signs in
 * as wes but never opens the app itself, so nobody is "at a window" and the
 * phone rule lets the ping through. alex then mentions wes.
 *
 * Needs `npm run dev` (API with this build, web on :5173), the seeded wes and
 * alex, and an internet connection (the ping goes through Google).
 *
 *   node scripts/push-check.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const WEB = 'http://localhost:5173';
const PASSWORD = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const PORT = 9341;

const chrome = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((path) => path && existsSync(path));
if (!chrome) {
  console.error('Google Chrome not found (Edge uses a different relay). Set CHROME.');
  process.exit(2);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let failed = false;
const check = (name, ok, detail = '') => {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};

/** A minimal DevTools connection. */
async function devtools(url) {
  const ws = new WebSocket(url);
  await new Promise((done, fail) => {
    ws.once('open', done);
    ws.once('error', fail);
  });
  let next = 0;
  const waiting = new Map();
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((done) => {
      next += 1;
      waiting.set(next, done);
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result?.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function signIn(username) {
  const response = await fetch(`${WEB}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`${username} could not sign in: ${response.status}`);
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

const profile = mkdtempSync(join(tmpdir(), 'scryproof-push-check-'));
const browser = spawn(
  chrome,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-position=-2400,0',
    // Chrome's own notification pop-ups, not Windows': those cannot be listed
    // back afterwards, and they would land on the desktop of whoever runs this.
    '--disable-features=NativeNotifications,SystemNotifications',
    '--window-size=800,600',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  let version = null;
  for (let tries = 0; tries < 40 && !version; tries += 1) {
    await sleep(250);
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
  }
  const root = await devtools(version.webSocketDebuggerUrl);
  await root.send('Browser.grantPermissions', { origin: WEB, permissions: ['notifications'] });

  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = await devtools(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: `${WEB}/sw.js` });
  await sleep(1500);

  // Signed in inside the browser, but no app open: nobody is "at a window".
  const signedIn = await page.evaluate(`fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'wes', password: ${JSON.stringify(PASSWORD)} }),
    }).then((r) => r.status)`);
  check('wes signs in inside the browser', signedIn === 200, `status ${signedIn}`);

  const subscribed = await page.evaluate(`(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { publicKey } = await fetch('/api/push').then((r) => r.json());
    const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const saved = await fetch('/api/push/subscription', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint, mutedServers: [], mutedChannels: [] }),
    });
    return { endpoint: subscription.endpoint, status: saved.status };
  })()`);
  check(
    'the browser subscribes through Google and the server keeps it',
    subscribed?.status === 200 && subscribed.endpoint.startsWith('https://fcm.googleapis.com/'),
    JSON.stringify(subscribed),
  );

  // alex mentions wes in a channel they share.
  const alex = await signIn('alex');
  const servers = await fetch(`${WEB}/api/servers`, { headers: { cookie: alex, origin: WEB } }).then((r) => r.json());
  const list = servers.servers ?? servers;
  let channelId = null;
  let me = null;
  for (const server of list) {
    const detail = await fetch(`${WEB}/api/servers/${server.id}`, { headers: { cookie: alex, origin: WEB } }).then((r) =>
      r.json(),
    );
    const members = await fetch(`${WEB}/api/servers/${server.id}/members`, { headers: { cookie: alex, origin: WEB } }).then(
      (r) => r.json(),
    );
    const wes = (members.members ?? members).find((member) => (member.user?.username ?? member.username) === 'wes');
    const text = (detail.server?.channels ?? detail.channels ?? []).find(
      (channel) => channel.type === 'text' && !channel.encrypted,
    );
    if (wes && text) {
      channelId = text.id;
      me = wes.user?.id ?? wes.userId ?? wes.id;
      break;
    }
  }
  check('alex and wes share a plain text channel', Boolean(channelId && me));

  const sent = await fetch(`${WEB}/api/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { cookie: alex, origin: WEB, 'content-type': 'application/json' },
    body: JSON.stringify({ content: `<@${me}> push check, secret words that must not show` }),
  });
  check('alex mentions wes', sent.ok, `status ${sent.status}`);

  let shown = [];
  for (let tries = 0; tries < 120 && shown.length === 0; tries += 1) {
    await sleep(500);
    shown = await page.evaluate(`navigator.serviceWorker.ready
      .then((r) => r.getNotifications())
      .then((list) => list.map((n) => ({ title: n.title, body: n.body, tag: n.tag })))`);
  }
  check('Google delivered the ping and the notification appeared', shown.length > 0, JSON.stringify(shown));
  if (shown.length > 0) {
    check('it says "Someone mentioned you"', shown[0].title === 'Someone mentioned you', shown[0].title);
    check(
      'it never says who, where, or what',
      !/secret|Alex|general|Table/.test(JSON.stringify(shown)),
      JSON.stringify(shown),
    );
  }

  // Part two: the app itself. Its own switch code turns it on, and while
  // wes is looking at the app, alex's mention must not wake anything.
  const notifications = () =>
    page.evaluate(`navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((list) => list.map((n) => n.title))`);
  const clearAll = () =>
    page.evaluate(`navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((list) => list.forEach((n) => n.close()))`);
  const mention = () =>
    fetch(`${WEB}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { cookie: alex, origin: WEB, 'content-type': 'application/json' },
      body: JSON.stringify({ content: `<@${me}> again` }),
    });

  await page.evaluate(`navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => s && s.unsubscribe())`);
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.navigate', { url: `${WEB}/` });
  await sleep(5000);
  const turnedOn = await page.evaluate(`import('/src/lib/push.ts').then(async (push) => {
    await push.preparePush();
    return push.enablePush();
  })`);
  check("the app's own switch turns it on", turnedOn === 'on', String(turnedOn));

  await sleep(1000);
  await clearAll();
  await mention();
  await sleep(8000);
  const whileHere = await notifications();
  check('nothing arrives while wes is looking at the app', whileHere.length === 0, JSON.stringify(whileHere));

  // Out of sight. An off-screen test window never really goes to the
  // background, so the browser's own signal is played to the app: the page
  // reports itself hidden, exactly as a phone switching apps does.
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'))`);
  await sleep(1500);
  await mention();
  let afterLeaving = [];
  for (let tries = 0; tries < 60 && afterLeaving.length === 0; tries += 1) {
    await sleep(500);
    afterLeaving = await notifications();
  }
  check('it arrives once the app is out of sight', afterLeaving.length > 0, JSON.stringify(afterLeaving));

  await page.evaluate(`import('/src/lib/push.ts').then((push) => push.disablePush())`);
  page.close();
  root.close();
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  browser.kill();
  await sleep(1000);
  rmSync(profile, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);

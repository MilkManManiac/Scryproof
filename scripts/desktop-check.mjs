/**
 * The desktop app, started for real and driven over its debugging port.
 *
 * What is being proved is the part a browser never exercises: the page comes
 * from the app and not the server, the session cookie lives in the app's own
 * jar, API calls and uploads go through the forwarder, and the gateway socket
 * is let in.
 *
 * Needs the local API on 8787, seeded, and a built client:
 *   bash scripts/dev-restart.sh && npm run seed && npm run build --workspace web
 *   npm run test:desktop
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'desktop');
const electron = createRequire(join(desktop, 'package.json'))('electron');

const SERVER = process.env.DESKTOP_CHECK_SERVER ?? 'http://127.0.0.1:8787';
const PASSWORD = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const PORT = 9351;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const profile = mkdtempSync(join(tmpdir(), 'scryproof-desktop-'));
/*
 * A stand-in for /desktop-update/ on the box. It serves whichever folder
 * `serving` points at, so the test can play a server that tampers, one that is
 * honest, and one that replays something old.
 */
const UPDATE_PORT = 9352;
const updates = mkdtempSync(join(tmpdir(), 'scryproof-updates-'));
let serving = null;
const updateServer = createServer((request, reply) => {
  const name = (request.url ?? '').split('/').pop();
  if (!serving || !['client.json', 'client.bin'].includes(name)) return reply.writeHead(404).end();
  try {
    reply.writeHead(200).end(readFileSync(join(serving, name)));
  } catch {
    reply.writeHead(404).end();
  }
});
await new Promise((listening) => updateServer.listen(UPDATE_PORT, '127.0.0.1', listening));

/** A signed update of the client as built, made the way a release makes one. */
function makeUpdate(name, version) {
  const out = join(updates, name);
  const made = spawnSync(process.execPath, [join(root, 'desktop', 'scripts', 'make-update.mjs')], {
    env: { ...process.env, SCRYPROOF_UPDATE_OUT: out, SCRYPROOF_UPDATE_SKIP_BUILD: '1', SCRYPROOF_UPDATE_VERSION: String(version) },
  });
  if (made.status !== 0) throw new Error(`make-update failed: ${made.stderr}`);
  return out;
}

const child = spawn(electron, [desktop, `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], {
  env: {
    ...process.env,
    SCRYPROOF_SERVER: SERVER,
    SCRYPROOF_UPDATE_URL: `http://127.0.0.1:${UPDATE_PORT}/desktop-update/`,
    SCRYPROOF_UPDATE_EVERY_MS: '700',
  },
  stdio: 'ignore',
});

let socket = null;
let nextId = 1;
const complaints = [];

const send = (method, params = {}) => {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      socket.off('message', onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
};
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
  return result.result.value;
};
const until = async (expression, ms = 20_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await evaluate(expression).catch(() => null);
    if (value) return value;
    await sleep(200);
  }
  return null;
};

try {
  let target = null;
  for (let attempt = 0; attempt < 80 && !target; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = targets.find((entry) => entry.type === 'page' && entry.url.startsWith('app://'))?.webSocketDebuggerUrl ?? null;
    } catch {}
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('The app never opened a window at app://.');

  socket = await new Promise((opened, reject) => {
    const ws = new WebSocket(target);
    ws.once('open', () => opened(ws));
    ws.once('error', reject);
  });
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      complaints.push(details.exception?.description ?? details.text);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  /* The page is the app's own, and is somewhere keys are allowed to exist. */
  await until(`document.readyState === 'complete'`);
  check('the window is at app://scryproof', (await evaluate('location.origin')) === 'app://scryproof');
  check('it is a secure context, with WebCrypto and IndexedDB', await evaluate(`isSecureContext && Boolean(crypto.subtle) && Boolean(window.indexedDB)`));
  check('the sign-in screen drew', Boolean(await until(`document.querySelector('input[type=password]') !== null`)));
  check('the page was told which server it talks to', (await evaluate('window.scryproofDesktop.server')) === new URL(SERVER).origin);

  /* Signing in: through the forwarder, cookie kept by the app. */
  const status = await evaluate(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'wes', password: '${PASSWORD}' }),
    }).then((reply) => reply.status)
  `);
  check('signing in through the app works', status === 200, String(status));
  check('the page cannot read the session cookie', (await evaluate('document.cookie')) === '');

  await send('Page.reload');
  check('after a reload it is still signed in', Boolean(await until(`document.querySelector('.rail-dms') !== null && document.querySelector('.member') !== null`)));

  /* The gateway: the panel says Connecting/Reconnecting/Disconnected until it is open. */
  const live = await until(`(() => {
    const panel = document.querySelector('.user-panel');
    return panel && !/Connecting|Reconnecting|Disconnected/.test(panel.textContent);
  })()`);
  check('the gateway socket is open', Boolean(live), live ? '' : await evaluate(`document.querySelector('.user-panel')?.textContent ?? 'no panel'`));

  /* An upload with a body, which is the forwarder's hard case. */
  const upload = await evaluate(`(async () => {
    const me = await fetch('/api/auth/me').then((r) => r.json());
    const { servers } = await fetch('/api/servers').then((r) => r.json());
    const { members } = await fetch('/api/servers/' + servers[0].id + '/members').then((r) => r.json());
    const other = members.map((member) => member.user ?? member).find((user) => user.id !== me.user.id);
    const { dm } = await fetch('/api/dms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: other.id }) }).then((r) => r.json());
    const form = new FormData();
    const bytes = crypto.getRandomValues(new Uint8Array(40000));
    form.append('file', new Blob([bytes]), 'sealed.bin');
    const made = await fetch('/api/dms/' + dm.id + '/files', { method: 'POST', body: form });
    if (!made.ok) return { status: made.status, text: await made.text() };
    const { file } = await made.json();
    const back = new Uint8Array(await fetch('/api/dms/' + dm.id + '/files/' + file.id).then((r) => r.arrayBuffer()));
    return { status: made.status, same: back.length === bytes.length && back.every((b, i) => b === bytes[i]) };
  })()`).catch((problem) => ({ status: 0, text: String(problem) }));
  check('a file goes up through the app and comes back the same', upload.same === true, JSON.stringify(upload));

  /* The window is not a browser. */
  await evaluate(`void (location.href = ${JSON.stringify(SERVER)})`).catch(() => undefined);
  await sleep(800);
  check('it refuses to navigate to the server, or anywhere', (await evaluate('location.origin').catch(() => 'gone')) === 'app://scryproof');

  // The system-wide key hook is a native module; loading in plain Node proves
  // nothing about loading inside Electron. Asking the shell to watch a key
  // starts it for real, and its answer is whether that worked.
  check('the shell can watch the push-to-talk key system-wide', (await evaluate(`window.scryproofDesktop.watchPushKey('Backquote')`)) === true);
  check('and a nonsense key is refused, not watched', (await evaluate(`window.scryproofDesktop.watchPushKey('NoSuchKey')`)) === false);
  await evaluate(`window.scryproofDesktop.watchPushKey(null)`);

  /* Updates: only what Wes's key signed, only forwards. */
  {
    const waiting = () => evaluate('window.scryproofDesktop.updateState()');
    const genuine = makeUpdate('genuine', Date.now() + 1_000_000);

    const tampered = join(updates, 'tampered');
    mkdirSync(tampered);
    writeFileSync(join(tampered, 'client.json'), readFileSync(join(genuine, 'client.json')));
    const bytes = readFileSync(join(genuine, 'client.bin'));
    bytes[bytes.length >> 1] ^= 1;
    writeFileSync(join(tampered, 'client.bin'), bytes);
    serving = tampered;
    await sleep(2500);
    check('an update with one bit changed is not offered', (await waiting()) === null);

    const forged = join(updates, 'forged');
    mkdirSync(forged);
    const manifest = JSON.parse(readFileSync(join(genuine, 'client.json'), 'utf8'));
    writeFileSync(join(forged, 'client.json'), JSON.stringify({ ...manifest, version: manifest.version + 5 }));
    writeFileSync(join(forged, 'client.bin'), readFileSync(join(genuine, 'client.bin')));
    serving = forged;
    await sleep(2500);
    check('nor is one whose version the server changed', (await waiting()) === null);

    serving = genuine;
    check('a genuine one is fetched, checked and offered', Boolean(await until(`window.scryproofDesktop.updateState().then((v) => v !== null)`)));
    check('the page says so', Boolean(await until(`document.querySelector('.banner.update') !== null`)));
    await evaluate(`window.__before = true; document.querySelector('.banner.update button').click()`);
    check('Reload moves to the new client', Boolean(await until(`window.__before === undefined && document.querySelector('.rail-dms') !== null`)));
    check('still signed in afterwards', (await evaluate(`fetch('/api/auth/me').then((r) => r.status)`)) === 200);
    check('and nothing is left waiting', (await waiting()) === null);

    serving = makeUpdate('old', 5);
    await sleep(2500);
    check('an older client, genuinely signed, is not an update', (await waiting()) === null);
  }

  if (process.env.DESKTOP_CHECK_SHOT) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.DESKTOP_CHECK_SHOT, Buffer.from(data, 'base64'));
  }
  check('no uncaught errors', complaints.length === 0, complaints.join('\n      '));
} catch (problem) {
  check('the run finished', false, String(problem?.stack ?? problem));
} finally {
  socket?.close();
  child.kill();
  updateServer.close();
  await sleep(500);
  try { rmSync(updates, { recursive: true, force: true }); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

console.log(failures === 0 ? '\nAll desktop checks passed.' : `\n${failures} desktop check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

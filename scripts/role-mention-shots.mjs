/**
 * Proof that pinging a role works in a real browser (2026-10-01), against a
 * seeded local instance. Alex holds Table Mods and sits in #general; Mara
 * pings the role in another channel. Checks the pop-up and the red count,
 * then that the chip is lit in the channel, then that typing @Table Mods in
 * the message box is stored as a role token and not as text.
 *
 *   API_PORT=8797 WEB_URL=http://localhost:5179 node scripts/role-mention-shots.mjs docs/shots
 *
 * Needs the API and a web dev server for this checkout running, and the seed.
 * Exits non-zero when a check fails.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const outDir = process.argv[2] ?? 'docs/shots';
const api = `http://127.0.0.1:${process.env.API_PORT ?? '8787'}`;
const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const password = 'seed-passphrase-for-local-dev';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const debugPort = Number(process.env.DEBUG_PORT ?? 9363);
const windowSize = process.env.WINDOW ?? '1440,900';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed += 1;
};

/** A seeded friend, talking through the API as a browser would. */
async function actor(username) {
  let cookie = '';
  const request = async (method, path, body) => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        origin: 'http://localhost:5173',
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
  const { user } = await request('POST', '/api/auth/login', { username, password });
  return { id: user.id, request };
}

const profile = mkdtempSync(join(tmpdir(), 'scryproof-role-shot-'));
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  `--window-size=${windowSize}`, 'about:blank',
], { stdio: 'ignore' });

try {
  let target = null;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      target = list.find((entry) => entry.type === 'page')?.webSocketDebuggerUrl ?? null;
    } catch {}
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('the browser never offered a page to drive');
  const socket = await new Promise((opened, reject) => {
    const ws = new WebSocket(target);
    ws.once('open', () => opened(ws));
    ws.once('error', reject);
  });
  let nextId = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      socket.off('message', onMessage);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  const shoot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
    console.log('wrote', join(outDir, name));
  };
  const clickText = (selector, text) =>
    run(`(() => { for (const el of document.querySelectorAll(${JSON.stringify(selector)})) { if (el.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})) { el.click(); return true; } } return false; })()`);

  // The role, pingable by anyone. Alex holds it (the seed gave it to him) and is the one watching.
  const wes = await actor('wes');
  const alex = await actor('alex');
  const mara = await actor('mara');
  const { servers } = await wes.request('GET', '/api/servers');
  const table = servers.find((server) => server.name === 'The Table');
  const detail = await wes.request('GET', `/api/servers/${table.id}`);
  const server = detail.server ?? detail;
  const mods = server.roles.find((role) => role.name === 'Table Mods');
  await wes.request('PATCH', `/api/roles/${mods.id}`, { mentionable: true });
  const text = server.channels.filter((channel) => channel.type === 'text');
  const general = text.find((channel) => channel.name === 'general');
  const maps = text.find((channel) => channel.name === 'maps');

  await send('Page.enable');
  // Headless windows are never "focused" by default; a person at their desk is.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: webUrl });
  await sleep(1500);
  const status = await run(
    `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alex', password: ${JSON.stringify(password)} }) }).then((r) => r.status)`,
  );
  if (status !== 200) throw new Error(`sign in as alex answered ${status}`);
  await run(`localStorage.setItem('scryproof.walkthrough.v1', 'done') || true`);
  await send('Page.navigate', { url: webUrl });
  await sleep(3000);
  for (const channel of text) {
    await clickText('button.channel', channel.name);
    await sleep(700);
  }
  await clickText('button.channel', general.name);
  await sleep(1200);

  // Mara pings the role from another channel. Nothing names Alex.
  const sent = await mara.request('POST', `/api/channels/${maps.id}/messages`, {
    content: `<@&${mods.id}> the river map is up, have a look before saturday`,
  });
  const stored = sent.message ?? sent;
  check('the server recorded the role', (stored.mentionRoles ?? []).includes(mods.id), JSON.stringify(stored.mentionRoles));
  check('and named nobody', (stored.mentions ?? []).length === 0);
  await sleep(1000);
  const popup = await run(`document.querySelector('.popup-stack')?.textContent ?? ''`);
  check('a pop-up says Mara mentioned you', /mara/i.test(popup) && /mention/i.test(popup), popup);
  const badge = await run(`(() => { for (const el of document.querySelectorAll('button.channel')) { if (el.textContent.includes('maps')) return el.textContent; } return ''; })()`);
  check('#maps shows a count', /\d/.test(badge), badge);
  await shoot('role-mention.png');

  await clickText('button.channel', maps.name);
  await sleep(1200);
  const chip = await run(`(() => { const el = document.querySelector('.mention.role'); return el ? { text: el.textContent, me: el.classList.contains('me') } : null; })()`);
  check('the message shows @Table Mods as a chip', chip?.text === '@Table Mods', JSON.stringify(chip));
  check('lit for someone who holds the role', chip?.me === true);
  const left = await run(`document.querySelectorAll('.popup-stack .popup-slot:not(.leaving)').length`);
  check('the pop-up went away once the channel was opened', left === 0, String(left));
  await shoot('role-mention-channel.png');

  // Typed by hand: the list offers the role, and what is stored is the token.
  await run(`document.querySelector('textarea.composer-input')?.focus() || true`);
  await send('Input.insertText', { text: '@Tab' });
  await sleep(600);
  const offered = await run(`document.querySelector('.composer')?.textContent ?? ''`);
  check('typing @Tab offers Table Mods', offered.includes('Table Mods'), '');
  await shoot('role-mention-picker.png');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.insertText', { text: 'le Mods typed by hand' });
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1500);
  const after = await alex.request('GET', `/api/channels/${maps.id}/messages?limit=5`);
  const list = after.messages ?? after;
  const typed = list.find((message) => (message.content ?? '').includes('typed by hand'));
  check('the typed message was sent', Boolean(typed));
  check('stored as a role token', typed?.content === `<@&${mods.id}> typed by hand`, typed?.content);
  check('and pinged the role', (typed?.mentionRoles ?? []).includes(mods.id));

  socket.close();
} finally {
  browser.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('all checks passed');

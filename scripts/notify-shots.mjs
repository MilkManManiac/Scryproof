/**
 * Pictures of the notifications rebuild (2026-10-01), against a seeded local
 * instance: Wes sits in one channel while friends talk in others, then the
 * pop-ups, the sidebar counts, the bell, a channel's right-click menu and the
 * settings are photographed.
 *
 *   API_PORT=8797 WEB_URL=http://localhost:5179 node scripts/notify-shots.mjs docs/shots
 *
 * Needs the API and a web dev server for this checkout running, and the seed.
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
const debugPort = Number(process.env.DEBUG_PORT ?? 9361);
const windowSize = process.env.WINDOW ?? '1440,900';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

const profile = mkdtempSync(join(tmpdir(), 'scryproof-notify-shot-'));
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

  await send('Page.enable');
  // Headless windows are never "focused" by default; Wes at his desk is.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: webUrl });
  await sleep(1500);
  const status = await run(
    `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'wes', password: ${JSON.stringify(password)} }) }).then((r) => r.status)`,
  );
  if (status !== 200) throw new Error(`sign in as wes answered ${status}`);
  await run(`localStorage.setItem('scryproof.walkthrough.v1', 'done') || true`);
  await send('Page.navigate', { url: webUrl });
  await sleep(3000);

  // Wes reads every channel once, so each has a "last read" to count from,
  // then sits in #general.
  const wes = await actor('wes');
  const { servers } = await wes.request('GET', '/api/servers');
  const table = servers.find((server) => server.name === 'The Table');
  const detail = await wes.request('GET', `/api/servers/${table.id}`);
  const server = detail.server ?? detail;
  const text = server.channels.filter((channel) => channel.type === 'text');
  const byName = (name) => text.find((channel) => channel.name === name);
  for (const channel of text) {
    await clickText('button.channel', channel.name);
    await sleep(700);
  }
  const home = byName('general') ?? text[0];
  await clickText('button.channel', home.name);
  await sleep(1200);

  const alex = await actor('alex');
  const mara = await actor('mara');
  const dev = await actor('dev');
  const others = text.filter((channel) => channel.id !== home.id);
  const busy = others[0];
  const quiet = others[1] ?? others[0];
  const lines = [
    [alex, busy, 'ok so the dragon is definitely not dead'],
    [mara, busy, 'it fled north, I have the map'],
    [dev, busy, 'who has the bag of holding'],
    [alex, busy, 'mara does, she never gave it back'],
    [mara, busy, 'slander'],
    [dev, quiet, 'posting the session notes in a sec'],
  ];
  for (const [who, channel, content] of lines) {
    await who.request('POST', `/api/channels/${channel.id}/messages`, { content });
    await sleep(250);
  }
  await mara.request('POST', `/api/channels/${quiet.id}/messages`, {
    content: `<@${wes.id}> are we still on for saturday? bring the dice`,
  });
  await sleep(900);
  await shoot('notify-popup.png');

  await sleep(6500);
  await shoot('notify-sidebar.png');

  await run(`document.querySelector('.rail-bell')?.click() || true`);
  await sleep(800);
  await shoot('notify-bell.png');
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) || true`);
  await sleep(500);

  // A channel's right-click menu.
  await run(`(() => { for (const el of document.querySelectorAll('button.channel')) { if (el.textContent.includes(${JSON.stringify(busy.name)})) { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })); return true; } } return false; })()`);
  await sleep(600);
  await shoot('notify-menu.png');
  await clickText('.menu-item', 'Every message');
  await sleep(500);

  // The settings, opened the way a person would: the gear by your name.
  const opened = await run(`(() => {
    const open = window.__openNotifySettings;
    if (open) { open(); return 'hook'; }
    return 'none';
  })()`);
  if (opened === 'none') {
    await run(`document.querySelector('button[aria-label="Settings"]')?.click() || true`);
    await sleep(600);
    await run(`(() => { for (const el of document.querySelectorAll('button')) { if (el.textContent.trim() === 'Notifications') { el.click(); return true; } } return false; })()`);
  }
  await sleep(900);
  await shoot('notify-settings.png');
  await run(`document.querySelector('.modal-body')?.scrollBy(0, 640) || true`);
  await sleep(400);
  await shoot('notify-settings-rows.png');
  await run(`document.querySelector('.modal-body')?.scrollBy(0, 2000) || true`);
  await sleep(400);
  await shoot('notify-settings-places.png');

  socket.close();
} finally {
  browser.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}

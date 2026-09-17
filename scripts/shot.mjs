/**
 * Take a picture of the app, signed in, without a person clicking through it.
 *
 *   node scripts/shot.mjs docs/shots/unread.png
 *   node scripts/shot.mjs docs/shots/unread.png --as mara --channel session-planning
 *
 * Needs the API and the web dev server running, and a seeded database. Every
 * milestone has to end in something Wes can look at, so this is the cheapest
 * path from "it works" to a file he can open.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const out = args[0] && !args[0].startsWith('--') ? args[0] : 'docs/shots/shot.png';
const user = flag('as', 'wes');
const channel = flag('channel', null);
const password = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = mkdtempSync(join(tmpdir(), 'gooffline-shot-'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--remote-debugging-port=9352', `--user-data-dir=${profile}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

try {
  let target = null;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9352/json/list')).json();
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

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:5173' });
  await sleep(1500);

  const status = await run(
    `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: ${JSON.stringify(user)}, password: ${JSON.stringify(password)} }) }).then((r) => r.status)`,
  );
  if (status !== 200) throw new Error(`sign in as ${user} answered ${status}`);

  await send('Page.navigate', { url: 'http://localhost:5173' });
  await sleep(2500);

  if (channel) {
    const clicked = await run(
      `(() => {
        const wanted = ${JSON.stringify(channel)}.toLowerCase();
        for (const button of document.querySelectorAll('button.channel')) {
          if (button.querySelector('.channel-name')?.textContent?.trim().toLowerCase() === wanted) {
            button.click();
            return true;
          }
        }
        return false;
      })()`,
    );
    if (!clicked) throw new Error(`no channel called #${channel} in the sidebar`);
    await sleep(1200);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${out} (as ${user}${channel ? `, in #${channel}` : ''})`);
  socket.close();
} finally {
  browser.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

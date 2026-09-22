/**
 * Take a picture of the app, signed in, without a person clicking through it.
 *
 *   node scripts/shot.mjs docs/shots/unread.png
 *   node scripts/shot.mjs docs/shots/unread.png --as mara --channel session-planning
 *   node scripts/shot.mjs docs/shots/x.png --hover '.category-row' --click '.menu-item'
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
/** Every occurrence, so a screen two clicks deep can be photographed. */
const flags = (name) =>
  args.flatMap((entry, at) => (entry === `--${name}` ? [args[at + 1]] : []));

const out = args[0] && !args[0].startsWith('--') ? args[0] : 'docs/shots/shot.png';
const user = flag('as', 'wes');
const channel = flag('channel', null);
const password = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// Several worktrees can photograph themselves at once against one API if each
// runs its own web dev server and its own debugging port.
const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const debugPort = Number(process.env.DEBUG_PORT ?? 9352);
// WINDOW=390,844 photographs a phone-sized window. The default is a laptop.
const windowSize = process.env.WINDOW ?? '1440,900';
// --signed-out photographs the door: the sign-in screen, nobody logged in.
const signedOut = args.includes('--signed-out');
const profile = mkdtempSync(join(tmpdir(), 'scryproof-shot-'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

  await send('Page.enable');
  // e.g. --user-agent 'Mozilla/5.0 ... Firefox/130.0', to photograph what a
  // browser we cannot drive would be told. Only the string changes.
  const userAgent = flag('user-agent', null);
  if (userAgent) {
    await send('Network.enable');
    await send('Network.setUserAgentOverride', { userAgent });
  }
  await send('Page.navigate', { url: webUrl });
  await sleep(1500);

  if (!signedOut) {
    const status = await run(
      `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: ${JSON.stringify(user)}, password: ${JSON.stringify(password)} }) }).then((r) => r.status)`,
    );
    if (status !== 200) throw new Error(`sign in as ${user} answered ${status}`);

    // e.g. --theme scry: the room the page paints, stored the way the
    // Themes dialog stores it, so the next load is already in that theme.
    const themeId = flag('theme', null);
    if (themeId) await run(`localStorage.setItem('scryproof.theme.v1', ${JSON.stringify(themeId)}) || true`);

    await send('Page.navigate', { url: webUrl });
    await sleep(2500);
  }

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

  // e.g. --click 'button[title="Notifications"]'. Repeatable, in order, for a
  // screen that takes more than one press to reach.
  for (const click of flags('click')) {
    const hit = await run(
      `(() => { const el = document.querySelector(${JSON.stringify(click)}); if (!el) return false; el.click(); return true; })()`,
    );
    if (!hit) throw new Error(`nothing on the page matches ${click}`);
    await sleep(700);
  }

  // e.g. --eval "window.__openPicture({ url: '/backdrops/ridge.jpg', name: 'ridge.jpg' })":
  // a hand on the page for the screens no click reaches from seed data.
  for (const code of flags('eval')) {
    await run(code);
    await sleep(700);
  }

  // e.g. --hover '.category-row'. A real mouse move, not a class: half the
  // controls in this app only appear under the pointer, and a screenshot that
  // cannot show them cannot be used to check them.
  const hover = flag('hover', null);
  if (hover) {
    const box = await run(
      `(() => { const el = document.querySelector(${JSON.stringify(hover)}); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    if (!box) throw new Error(`nothing on the page matches ${hover}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await sleep(400);
  }

  // e.g. --focus 'button[aria-label="Reorder maps"]', so that --press lands on
  // an element's own key handler rather than on the window.
  const focus = flag('focus', null);
  if (focus) {
    const hit = await run(
      `(() => { const el = document.querySelector(${JSON.stringify(focus)}); if (!el) return false; el.focus(); return document.activeElement === el; })()`,
    );
    if (!hit) throw new Error(`could not focus ${focus}`);
  }

  // e.g. --press ctrl+k, to photograph something only a shortcut opens.
  // Repeatable. Goes to the focused element if --focus was given.
  for (const press of flags('press')) {
    const parts = press.toLowerCase().split('+');
    const key = parts.pop();
    const target = focus ? 'document.activeElement' : 'window';
    // Arrow keys are spelt the way KeyboardEvent spells them.
    const named = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', esc: 'Escape' };
    await run(
      `${target}.dispatchEvent(new KeyboardEvent('keydown', {
        key: ${JSON.stringify(named[key] ?? key)},
        ctrlKey: ${parts.includes('ctrl')},
        metaKey: ${parts.includes('meta')},
        shiftKey: ${parts.includes('shift')},
        altKey: ${parts.includes('alt')},
        bubbles: true,
        cancelable: true,
      })) || true`,
    );
    await sleep(600);
  }

  // e.g. --then '.settings-nav-item:last-child'. A click after the presses,
  // for photographing what the presses did once the dialog is out of the way.
  for (const then of flags('then')) {
    const hit = await run(
      `(() => { const el = document.querySelector(${JSON.stringify(then)}); if (!el) return false; el.click(); return true; })()`,
    );
    if (!hit) throw new Error(`nothing on the page matches ${then}`);
    await sleep(700);
  }

  const type = flag('type', null);
  if (type) {
    for (const letter of type) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: letter });
      await send('Input.dispatchKeyEvent', { type: 'keyUp' });
      await sleep(40);
    }
    await sleep(400);
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

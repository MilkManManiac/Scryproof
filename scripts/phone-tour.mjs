/**
 * Walk every screen of the app at phone sizes, photograph each one, and
 * measure what a person would trip on: things hanging off the edge, taps
 * too small for a thumb, text boxes that make an iPhone zoom in.
 *
 *   node scripts/phone-tour.mjs                   every device, every screen
 *   node scripts/phone-tour.mjs --device iphone   one device
 *   node scripts/phone-tour.mjs --only drawer     screens whose name contains "drawer"
 *
 * Writes .shots/phone-tour/<device>/<nn-screen>.png and report.json beside
 * them, then python scripts/phone-sheet.py lays each screen out across the
 * devices in one picture. Needs the API and the web dev server running, and
 * a seeded database (same as shot.mjs).
 *
 * What it cannot see: this is Chrome pretending to be a phone. Safari's own
 * quirks (its toolbar eating the bottom of the page, the notch in an
 * installed app) are checked by reading the stylesheet, not by looking.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const password = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const debugPort = Number(process.env.DEBUG_PORT ?? 9353);
const outRoot = flag('out', '.shots/phone-tour');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

// The phones the group actually holds, roughly: a current iPhone, the small
// one, a big Android and a narrow one.
const DEVICES = [
  { id: 'iphone', label: 'iPhone 15', width: 393, height: 852, scale: 3, ua: IOS_UA },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, scale: 2, ua: IOS_UA },
  { id: 'pixel', label: 'Pixel 8', width: 412, height: 915, scale: 2.625, ua: ANDROID_UA },
  { id: 'galaxy', label: 'Galaxy A (narrow)', width: 360, height: 780, scale: 3, ua: ANDROID_UA },
];

/*
 * Each screen starts from a fresh load of the app, signed in, in #general
 * of The Table, then runs its steps. A step is one of:
 *   { tap: css }          click the first match
 *   { label: text }       click the first visible button whose label, title or text is `text`
 *   { channel: name }     open that channel (through the drawer on a phone)
 *   { server: name }      open that server (through the drawer)
 *   { type: text }        type into whatever has focus
 *   { hold: css }         press and hold the last visible match with a finger
 *   { swipe: [x0, y0, x1, y1] }  drag a finger, in fractions of the screen
 *   { back: true }        the phone's back button (history.back)
 *   { focus: css }        focus an element
 *   { eval: js }          anything else
 *   { wait: ms }
 */
const SCREENS = [
  { name: 'sign-in', signedOut: true },
  { name: 'channel', steps: [] },
  { name: 'drawer-left', steps: [{ label: 'Servers and channels' }] },
  { name: 'drawer-left-scrolled', steps: [{ label: 'Servers and channels' }, { eval: `document.querySelector('.dock.left .rail')?.scrollTo(0, 9999)` }] },
  { name: 'drawer-right-members', steps: [{ label: 'Members' }] },
  { name: 'other-server', steps: [{ server: 'Hearth' }] },
  { name: 'channel-planning', steps: [{ channel: 'session-planning' }] },
  { name: 'channel-maps', steps: [{ channel: 'maps' }] },
  { name: 'composer-typing', steps: [{ focus: '.composer textarea, .composer [contenteditable]' }, { type: 'hey is anyone on tonight' }] },
  { name: 'emoji-picker', steps: [{ label: 'Emoji' }] },
  { name: 'message-actions', steps: [{ hold: '.messages .message .message-text' }] },
  { name: 'message-actions-react', steps: [{ hold: '.messages .message .message-text' }, { label: 'React' }] },
  { name: 'search', steps: [{ label: 'Search (Ctrl+F)' }, { type: 'map' }, { eval: `document.activeElement?.form?.requestSubmit?.() ?? document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))` }] },
  { name: 'pinned', steps: [{ label: 'Pinned messages' }] },
  { name: 'notifications', steps: [{ label: 'Servers and channels' }, { tap: '.rail .rail-bell' }] },
  { name: 'dms', steps: [{ label: 'Servers and channels' }, { tap: '.rail button[title^="Direct messages"]' }] },
  { name: 'dms-drawer-closed', steps: [{ label: 'Servers and channels' }, { tap: '.rail button[title^="Direct messages"]' }, { tap: '.dock-backdrop' }] },
  { name: 'dm-conversation', steps: [{ label: 'Servers and channels' }, { tap: '.rail button[title^="Direct messages"]' }, { tap: '.dock.left button.dm-row' }] },
  { name: 'profile-card', steps: [{ label: 'Members' }, { tap: '.members .member' }] },
  { name: 'profile-self', steps: [{ label: 'Servers and channels' }, { label: 'Your profile' }] },
  { name: 'you-menu', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel-identity' }] },
  { name: 'settings-menu', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel button[aria-label="Settings"]' }] },
  { name: 'settings-voice', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel button[aria-label="Settings"]' }, { label: 'Voice and audio' }] },
  { name: 'settings-notify', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel button[aria-label="Settings"]' }, { tap: '.panel-menu-item:nth-child(2)' }] },
  { name: 'themes', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel button[aria-label="Settings"]' }, { label: 'Choose a theme' }] },
  { name: 'edit-profile', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel button[aria-label="Settings"]' }, { label: 'Edit profile' }] },
  { name: 'account', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel button[aria-label="Settings"]' }, { label: 'Account' }] },
  { name: 'whats-new', steps: [{ label: 'Servers and channels' }, { tap: '.user-panel-identity' }, { label: 'What changed in the last few releases' }] },
  { name: 'server-settings', steps: [{ label: 'Servers and channels' }, { label: 'Server settings' }] },
  { name: 'server-roles', steps: [{ label: 'Servers and channels' }, { label: 'Server settings' }, { label: 'Roles' }] },
  { name: 'channel-settings', steps: [{ label: 'Channel settings' }] },
  { name: 'create-server', steps: [{ label: 'Servers and channels' }, { label: 'Create a server' }] },
  { name: 'invite', steps: [{ label: 'Servers and channels' }, { label: 'Invite someone' }] },
  { name: 'plan-event', steps: [{ label: 'Servers and channels' }, { label: 'Plan an event' }] },
  { name: 'attach-menu', steps: [{ label: 'Attach a file' }] },
  { name: 'walkthrough', walkthrough: true, steps: [] },
  { name: 'swipe-open-servers', steps: [{ swipe: [0.3, 0.5, 0.85, 0.52] }] },
  { name: 'swipe-open-members', steps: [{ swipe: [0.8, 0.5, 0.2, 0.52] }] },
  { name: 'swipe-close-servers', steps: [{ label: 'Servers and channels' }, { swipe: [0.8, 0.5, 0.1, 0.5] }] },
  { name: 'back-closes-drawer', steps: [{ label: 'Servers and channels' }, { back: true }] },
  { name: 'dialog-from-drawer', steps: [{ label: 'Servers and channels' }, { label: 'Invite someone' }] },
  { name: 'back-closes-dialog', steps: [{ label: 'Servers and channels' }, { label: 'Invite someone' }, { back: true }] },
  { name: 'back-closes-settings', steps: [{ label: 'Servers and channels' }, { label: 'Server settings' }, { back: true }] },
  { name: 'back-closes-hold', steps: [{ hold: '.messages .message .message-text' }, { back: true }] },
  { name: 'voice-call', media: true, steps: [{ channel: 'General', voice: true }, { wait: 2500 }] },
  { name: 'voice-soundboard', media: true, steps: [{ channel: 'General', voice: true }, { wait: 2500 }, { label: 'Soundboard' }] },
];

// ---------------------------------------------------------------- the page

const profile = mkdtempSync(join(tmpdir(), 'scryproof-tour-'));
const browser = spawn(chrome, [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let socket;
let nextId = 1;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  const onMessage = (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id !== id) return;
    socket.off('message', onMessage);
    message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result);
  };
  socket.on('message', onMessage);
  socket.send(JSON.stringify({ id, method, params }));
});
const run = async (expression) => {
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
  return reply.result.value;
};

// Visible means a person could see it now: laid out, not hidden, and not
// inside a drawer that is shut.
const HELPERS = `
  window.__visible = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.closest('.dock:not(.open)') && matchMedia('(max-width: 640px)').matches) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let at = el; at; at = at.parentElement) {
      const s = getComputedStyle(at);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  window.__byLabel = (text) => {
    const want = text.toLowerCase();
    const all = [...document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"]')];
    const said = (el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].map((v) => (v ?? '').trim().toLowerCase());
    return all.find((el) => __visible(el) && said(el).some((v) => v === want))
      ?? all.find((el) => __visible(el) && said(el).some((v) => v.startsWith(want)))
      ?? null;
  };
  true;
`;

async function step(action) {
  if (action.wait) return sleep(action.wait);
  if (action.eval) {
    const value = await run(action.eval);
    // A string back is something to read: printed beside the screen's line.
    if (typeof value === 'string') console.log(`    ${value}`);
    return sleep(600);
  }
  if (action.tap) {
    const hit = await run(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(action.tap)})].find(__visible); if (!el) return false; el.click(); return true; })()`);
    if (!hit) throw new Error(`nothing visible matches ${action.tap}`);
    return sleep(700);
  }
  if (action.label) {
    await run(HELPERS);
    const hit = await run(`(() => { const el = __byLabel(${JSON.stringify(action.label)}); if (!el) return false; el.click(); return true; })()`);
    if (!hit) throw new Error(`no visible button called "${action.label}"`);
    return sleep(700);
  }
  if (action.hold) {
    // A real touch through the browser's input pipeline, held past the
    // app's long-press time, so this tests what a thumb would do.
    const at = await run(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(action.hold)})].filter(__visible).pop();
      if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect();
      return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 }; })()`);
    if (!at) throw new Error(`nothing visible matches ${action.hold}`);
    const point = [{ x: at.x, y: at.y }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
    await sleep(700);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return sleep(500);
  }
  if (action.swipe) {
    const [x0, y0, x1, y1] = action.swipe;
    const size = await run('({ w: innerWidth, h: innerHeight })');
    const at = (t) => [{ x: size.w * (x0 + (x1 - x0) * t), y: size.h * (y0 + (y1 - y0) * t) }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= 12; i += 1) {
      await sleep(16);
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / 12) });
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return sleep(700);
  }
  if (action.back) {
    await run('history.back() || true');
    return sleep(700);
  }
  if (action.focus) {
    const hit = await run(`(() => { const el = document.querySelector(${JSON.stringify(action.focus)}); if (!el) return false; el.focus(); return true; })()`);
    if (!hit) throw new Error(`could not focus ${action.focus}`);
    return sleep(300);
  }
  if (action.type) {
    for (const letter of action.type) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: letter });
      await send('Input.dispatchKeyEvent', { type: 'keyUp' });
    }
    return sleep(400);
  }
  if (action.channel || action.server) {
    // Through the drawer, the way a thumb gets there.
    await run(HELPERS);
    await run(`(() => { const b = __byLabel('Servers and channels'); if (b) b.click(); return true; })()`);
    await sleep(600);
    if (action.server) {
      const hit = await run(`(() => {
        const want = ${JSON.stringify(action.server)}.toLowerCase();
        const el = [...document.querySelectorAll('.rail button, .rail a')].find((b) =>
          [b.getAttribute('aria-label'), b.getAttribute('title'), b.textContent].some((v) => (v ?? '').trim().toLowerCase() === want));
        if (!el) return false; el.click(); return true; })()`);
      if (!hit) throw new Error(`no server called ${action.server} in the rail`);
    } else {
      const hit = await run(`(() => {
        const want = ${JSON.stringify(action.channel)}.toLowerCase();
        for (const b of document.querySelectorAll(${JSON.stringify(action.voice ? 'button.channel.voice' : 'button.channel.text, button.channel:not(.voice)')})) {
          if (b.querySelector('.channel-name')?.textContent?.trim().toLowerCase() === want) { b.click(); return true; }
        }
        return false; })()`);
      if (!hit) throw new Error(`no ${action.voice ? 'voice' : 'text'} channel called ${action.channel}`);
    }
    return sleep(1200);
  }
  throw new Error(`a step with nothing to do: ${JSON.stringify(action)}`);
}

// ---------------------------------------------------------------- the ruler

const PROBE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (text ? ' "' + text + '"' : '');
  };
  // Clipped by a scrolling or hidden-overflow parent that is itself on screen:
  // then it is scrolled away, not hanging off the phone.
  const clipped = (el) => {
    for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
      const s = getComputedStyle(at);
      if (s.overflowX !== 'visible' || s.overflow !== 'visible') {
        const r = at.getBoundingClientRect();
        if (r.left >= -1 && r.right <= vw + 1) return true;
      }
    }
    return false;
  };
  const all = [...document.querySelectorAll('body *')].filter(__visible);
  const offEdge = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 2 || r.left < -2) && !clipped(el)) {
      // Only the outermost offender; its children say nothing new.
      if (!offEdge.some((o) => o.el.contains(el))) offEdge.push({ el, over: Math.round(Math.max(r.right - vw, -r.left)) });
    }
  }
  const taps = all.filter((el) => el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role="button"]'));
  const tiny = taps.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 32 || r.height < 32; });
  // iOS zooms the whole page in when a text box under 16px gets focus, and
  // does not zoom back out. The classic phone-layout bug.
  const zooms = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable="true"]')]
    .filter(__visible).filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);
  return {
    width: vw, height: vh,
    scrollsSideways: document.documentElement.scrollWidth > vw + 1,
    offEdge: offEdge.slice(0, 8).map((o) => describe(o.el) + ' +' + o.over + 'px'),
    tinyTaps: tiny.length,
    tinyExamples: tiny.slice(0, 6).map((el) => { const r = el.getBoundingClientRect(); return describe(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }),
    zoomOnFocus: zooms.slice(0, 4).map((el) => describe(el) + ' ' + getComputedStyle(el).fontSize),
  };
})()`;

// ---------------------------------------------------------------- the walk

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
  socket = await new Promise((opened, reject) => {
    const ws = new WebSocket(target);
    ws.once('open', () => opened(ws));
    ws.once('error', reject);
  });
  await send('Page.enable');
  await send('Network.enable');

  const onlyDevice = flag('device', null);
  const onlyScreen = flag('only', null);
  const devices = DEVICES.filter((d) => !onlyDevice || d.id === onlyDevice);
  // A comma list picks several: --only channel,dms. An exact name wins over a part of one.
  const wanted = onlyScreen?.split(',') ?? [];
  const screens = SCREENS.filter((s) => !onlyScreen || wanted.some((w) => s.name === w) || (wanted.length === 1 && s.name.includes(wanted[0])));
  if (!devices.length || !screens.length) throw new Error('nothing matches --device / --only');

  for (const device of devices) {
    const dir = join(outRoot, device.id);
    mkdirSync(dir, { recursive: true });
    await send('Emulation.setDeviceMetricsOverride', { width: device.width, height: device.height, deviceScaleFactor: device.scale, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Network.setUserAgentOverride', { userAgent: device.ua, platform: device.ua.includes('iPhone') ? 'iPhone' : 'Linux armv8l' });

    const report = [];
    for (const [at, screen] of screens.entries()) {
      const file = `${String(SCREENS.indexOf(screen) + 1).padStart(2, '0')}-${screen.name}.png`;
      const entry = { screen: screen.name, file };
      try {
        await send('Network.clearBrowserCookies');
        await send('Page.navigate', { url: webUrl });
        await sleep(1200);
        await run(`localStorage.clear(); ${screen.walkthrough ? '' : "localStorage.setItem('scryproof.walkthrough.v1', 'done');"} true`);
        if (!screen.signedOut) {
          const status = await run(`fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'wes', password: ${JSON.stringify(password)} }) }).then((r) => r.status)`);
          if (status !== 200) throw new Error(`sign in answered ${status}`);
          await send('Page.navigate', { url: webUrl });
          await sleep(2500);
        }
        await run(HELPERS);
        for (const action of screen.steps ?? []) await step(action);
        await sleep(500);
        await run(HELPERS);
        Object.assign(entry, await run(PROBE));
      } catch (error) {
        entry.error = String(error.message ?? error);
      }
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(dir, file), Buffer.from(shot.data, 'base64'));
      report.push(entry);
      const notes = [
        entry.error ? `FAILED: ${entry.error}` : null,
        entry.scrollsSideways ? 'scrolls sideways' : null,
        entry.offEdge?.length ? `${entry.offEdge.length} off the edge` : null,
        entry.zoomOnFocus?.length ? 'iOS will zoom' : null,
      ].filter(Boolean).join(', ');
      console.log(`${device.id.padEnd(10)} ${String(at + 1).padStart(2)}/${screens.length} ${screen.name.padEnd(22)} ${notes}`);
    }
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ device, report }, null, 2));
  }
  socket.close();
} finally {
  browser.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

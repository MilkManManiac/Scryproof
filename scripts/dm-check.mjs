/**
 * Prove, with real browsers, that a direct message is readable by the two
 * people in it and by nothing in between.
 *
 * `npm test` covers the sealing in Node, including a server that lies. What it
 * cannot cover is the part a person touches: keys made and kept by a real
 * browser, the screens, and what a second device looks like to everyone else.
 *
 * Three separate Chromium processes, so three separate devices:
 *
 *   1. Wes clicks Alex in the member list and writes to him
 *   2. Alex gets a badge, opens it, and reads exactly that text
 *   3. what the server hands back for that conversation does not contain the text
 *   4. Alex signs in on a second device. It cannot read what came before it,
 *      and says so rather than failing
 *   5. Wes is warned about the new device, and until he accepts it, it gets
 *      no copy of what he sends
 *   6. Wes accepts it. The next message opens there
 *   7. Wes edits a message, Alex replies to one, Wes reacts to the reply and
 *      takes it back; the server is never shown the emoji
 *   8. Wes deletes a message and it goes from Alex's screen
 *
 * Needs `npm run dev` and a seeded database (`npm run seed --workspace server`).
 *
 *   npm run test:dm
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const WEB = process.env.DM_CHECK_WEB ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';

const browserPath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].find((candidate) => candidate && existsSync(candidate));
if (!browserPath) {
  console.error('No Chromium found. Set CHROME_PATH.');
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** One device: its own browser process and profile, so its own keys. */
class Device {
  constructor(label, username, debugPort) {
    this.label = label;
    this.username = username;
    this.debugPort = debugPort;
    this.profile = mkdtempSync(join(tmpdir(), `scryproof-dm-${label}-`));
    this.nextId = 1;
    this.complaints = [];
  }

  async open() {
    this.process = spawn(
      browserPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        `--remote-debugging-port=${this.debugPort}`,
        `--user-data-dir=${this.profile}`,
        '--window-size=1280,800',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );

    let target = null;
    for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${this.debugPort}/json/list`)).json();
        target = targets.find((entry) => entry.type === 'page')?.webSocketDebuggerUrl ?? null;
      } catch {}
      if (!target) await sleep(250);
    }
    if (!target) throw new Error(`${this.label}: the browser never opened its debugging port.`);

    this.socket = await new Promise((opened, reject) => {
      const ws = new WebSocket(target);
      ws.once('open', () => opened(ws));
      ws.once('error', reject);
    });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        this.complaints.push(details.exception?.description ?? details.text);
      }
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    // A headless window never has focus, and the app only marks a conversation
    // read while someone is looking at it.
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id !== id) return;
        this.socket.off('message', onMessage);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      };
      this.socket.on('message', onMessage);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) {
      throw new Error(`${this.label}: ${result.exceptionDetails.exception?.description ?? 'evaluation failed'}`);
    }
    return result.result.value;
  }

  async until(expression, ms = 20_000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const value = await this.evaluate(expression).catch(() => null);
      if (value) return value;
      await sleep(200);
    }
    return null;
  }

  async signIn() {
    await this.send('Page.navigate', { url: WEB });
    await this.until(`document.readyState === 'complete'`);
    const status = await this.evaluate(`
      fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: '${this.username}', password: '${PASSWORD}' }),
      }).then((reply) => reply.status)
    `);
    if (status !== 200) throw new Error(`${this.label}: sign-in returned ${status}. Has the database been seeded?`);
    await this.send('Page.navigate', { url: WEB });
    const ready = await this.until(`document.querySelector('.rail-dms') !== null && document.querySelector('.member') !== null`);
    if (!ready) throw new Error(`${this.label}: the app never finished loading.`);
  }

  /** Click the first element matching a selector whose text contains something. */
  click(selector, text = '') {
    return this.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((node) => node.textContent.includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
  }

  /** Type into the composer and press Enter, through the browser's own input path. */
  async say(text) {
    const ready = await this.until(`(() => {
      const box = document.querySelector('.composer-input');
      if (!box || box.disabled) return false;
      box.focus();
      return document.activeElement === box;
    })()`);
    if (!ready) throw new Error(`${this.label}: the composer never became usable.`);
    await this.send('Input.insertText', { text });
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined });
    }
  }

  /** Press a button in the hover bar of the message containing some text. */
  act(text, title) {
    return this.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('.message')).find((el) => el.textContent.includes(${JSON.stringify(text)}));
      const button = row?.querySelector('.message-actions button[title="${title}"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
  }

  async pressEnter() {
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined });
    }
  }

  sees(text, ms) {
    return this.until(`Array.from(document.querySelectorAll('.message-text')).some((el) => el.textContent.includes(${JSON.stringify(text)}))`, ms);
  }

  screenText() {
    return this.evaluate(`document.querySelector('.main')?.innerText ?? ''`);
  }

  async shot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, Buffer.from(data, 'base64'));
  }

  close() {
    try {
      this.socket?.close();
    } catch {}
    this.process?.kill();
  }

  cleanUp() {
    try {
      rmSync(this.profile, { recursive: true, force: true });
    } catch {}
  }
}

const stamp = Date.now().toString(36);
const FIRST = `first-${stamp} the word is heliotrope`;
const SECOND = `second-${stamp} while the new device waits`;
const THIRD = `third-${stamp} after accepting`;
const EDITED = `edited-${stamp} said better`;
const REPLY = `reply-${stamp} what is a heliotrope`;

const wes = new Device('wes', 'wes', 9341);
const alex = new Device('alex', 'alex', 9342);
const alexPhone = new Device('alex-phone', 'alex', 9343);
const everyone = [wes, alex, alexPhone];

try {
  await Promise.all([wes.open(), alex.open()]);
  await Promise.all([wes.signIn(), alex.signIn()]);

  /* 1 */
  check('Wes finds Alex in the member list', await wes.click('.member', 'Alex'));
  check('the conversation opens and says it is encrypted', Boolean(await wes.until(`document.querySelector('.dm-lock') !== null`)));
  await wes.say(FIRST);
  {
    const saw = Boolean(await wes.sees(FIRST));
    check('Wes sees his own message, opened from the sealed copy', saw, saw ? '' : (await wes.screenText()).slice(-300));
  }

  /* 2 */
  check('Alex gets a badge on the rail', Boolean(await alex.until(`document.querySelector('.rail-dms .badge') !== null`)));
  await alex.click('.rail-dms');
  check('Alex sees the conversation in the list', Boolean(await alex.until(`document.querySelector('.dm-row') !== null`)));
  await alex.click('.dm-row', 'Wes');
  check('Alex reads exactly what Wes wrote', Boolean(await alex.sees(FIRST)));
  check('reading it clears the badge', Boolean(await alex.until(`document.querySelector('.rail-dms .badge') === null`)));

  /* 3 */
  const raw = await alex.evaluate(`
    fetch('/api/dms', { credentials: 'include' }).then((r) => r.json())
      .then((body) => fetch('/api/dms/' + body.dms[0].id + '/messages', { credentials: 'include' }))
      .then((r) => r.text())
  `);
  check('the server returned sealed bytes for it', raw.includes('"ciphertext":"'));
  check('what the server holds does not contain the text', !raw.includes('heliotrope') && !raw.includes(stamp), raw.slice(0, 160));

  /* 4 */
  await alexPhone.open();
  await alexPhone.signIn();
  await alexPhone.click('.rail-dms');
  await alexPhone.until(`document.querySelector('.dm-row') !== null`);
  await alexPhone.click('.dm-row', 'Wes');
  const locked = await alexPhone.until(`Array.from(document.querySelectorAll('.message-text')).some((el) => el.textContent.startsWith('Locked.'))`);
  check("Alex's second device shows the old message as locked", Boolean(locked));
  check('and does not show its text', !(await alexPhone.screenText()).includes('heliotrope'));

  /* 5 */
  await wes.say(SECOND);
  check('Wes is warned that Alex signed in somewhere new', Boolean(await wes.until(`document.querySelector('.dm-warning')?.textContent.includes('Alex signed in somewhere new')`)));
  check("Alex's first device reads the new message", Boolean(await alex.sees(SECOND)));
  await sleep(1500);
  check('the unaccepted device was given no copy of it', !(await alexPhone.screenText()).includes(SECOND));

  /* 6 */
  await wes.click('.dm-warning button', 'Accept');
  check('the warning goes once accepted', Boolean(await wes.until(`document.querySelector('.dm-warning') === null`)));
  await wes.say(THIRD);
  check('the accepted device reads the next message', Boolean(await alexPhone.sees(THIRD)));
  check('and so does the first one', Boolean(await alex.sees(THIRD)));

  /* 7 */
  await wes.act(SECOND, 'Edit');
  await wes.until(`document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value.includes('second-')`);
  await wes.evaluate(`document.activeElement.select()`);
  await wes.send('Input.insertText', { text: EDITED });
  await wes.pressEnter();
  check('Alex sees the edit', Boolean(await alex.sees(EDITED)));
  check('marked as edited', Boolean(await alex.until(`document.querySelector('.message-edited') !== null`)));
  check('and the old wording is gone', !(await alex.screenText()).includes(SECOND));

  await alex.act(FIRST, 'Reply');
  check('Alex is shown what he is replying to', Boolean(await alex.until(`document.querySelector('.composer-reply')?.textContent.includes('heliotrope')`)));
  await alex.say(REPLY);
  check('Wes sees the reply', Boolean(await wes.sees(REPLY)));
  check('with the message it answers quoted above it', Boolean(await wes.until(`Array.from(document.querySelectorAll('.reply-line')).some((el) => el.textContent.includes('the word is heliotrope'))`)));

  {
    const seen = await alex.evaluate(`(() => {
      const line = document.querySelector('.reply-line');
      const text = line?.querySelector('.reply-line-text');
      return JSON.stringify({ html: line?.outerHTML, width: text?.getBoundingClientRect().width ?? 0 });
    })()`);
    check('and the quote can actually be seen, not just found', JSON.parse(seen).width > 20, seen);
  }

  await wes.act(REPLY, 'React');
  await wes.until(`document.querySelector('.reaction-picker-emoji') !== null`);
  const emoji = await wes.evaluate(`(() => { const el = document.querySelector('.reaction-picker-emoji'); el.click(); return el.textContent; })()`);
  check('Alex sees the reaction', Boolean(await alex.until(`Array.from(document.querySelectorAll('.reaction')).some((el) => el.textContent.includes(${JSON.stringify(emoji)}))`)));
  check('a reaction does not mark the conversation unread', await alex.evaluate(`fetch('/api/dms', { credentials: 'include' }).then((r) => r.json()).then((body) => body.dms[0].lastMessageId === body.dms[0].lastReadMessageId)`));
  {
    const held = await alex.evaluate(`
      fetch('/api/dms', { credentials: 'include' }).then((r) => r.json())
        .then((body) => fetch('/api/dms/' + body.dms[0].id + '/messages', { credentials: 'include' }))
        .then((r) => r.text())
    `);
    check('the server holds the reaction', JSON.parse(held).reactions.length === 1);
    check('and was never shown which emoji, the edit or the reply', !held.includes(emoji) && !held.includes(stamp));
  }
  if (process.env.DM_CHECK_SHOT) await alex.shot(process.env.DM_CHECK_SHOT);
  await wes.click('.reaction', emoji);
  check('taking the reaction back removes it for Alex', Boolean(await alex.until(`document.querySelector('.reaction') === null`)));

  /* 8 */
  await wes.act(THIRD, 'Delete');
  check('a deleted message goes from the other screen', Boolean(await alex.until(`!document.querySelector('.main').innerText.includes(${JSON.stringify(THIRD)})`)));

  for (const device of everyone) {
    check(`${device.label}: no uncaught errors`, device.complaints.length === 0, device.complaints.join('\n      '));
  }
} catch (problem) {
  failures += 1;
  console.error(`FAIL  ${problem.message}`);
} finally {
  for (const device of everyone) device.close();
  await sleep(500);
  for (const device of everyone) device.cleanUp();
}

console.log(failures === 0 ? '\nAll direct message checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

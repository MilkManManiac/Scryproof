/**
 * One headless browser, driven over the DevTools protocol: its own process
 * and profile, so its own keys. Shared by the browser checks that need
 * several devices at once. `scripts/dm-check.mjs` has its own copy, older.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const WEB = process.env.CHECK_WEB ?? 'http://localhost:5173';
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

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** One device: its own browser process and profile, so its own keys. */
export class Device {
  constructor(label, username, debugPort) {
    this.label = label;
    this.username = username;
    this.debugPort = debugPort;
    this.profile = mkdtempSync(join(tmpdir(), `scryproof-check-${label}-`));
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

  /** Put files into the composer's hidden picker, as choosing them in the dialog would. */
  async attach(paths) {
    const { root } = await this.send('DOM.getDocument');
    const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.composer input[type=file]' });
    await this.send('DOM.setFileInputFiles', { nodeId, files: paths });
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

  /** Type into one field, through the browser's own input path, so React hears it. */
  async fill(selector, text) {
    const focused = await this.until(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    })()`);
    if (!focused) throw new Error(`${this.label}: no field matching ${selector}.`);
    await this.send('Input.insertText', { text });
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


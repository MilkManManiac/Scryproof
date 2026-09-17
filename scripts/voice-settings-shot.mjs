/**
 * Screenshot the voice settings dialog, with a fake microphone feeding the
 * meter, so the screen can be looked at without a person clicking through it.
 *
 *   node scripts/voice-settings-shot.mjs docs/shots/voice-settings.png
 *
 * Needs the API and the web dev server running, and a seeded database.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const out = process.argv[2] ?? 'docs/shots/voice-settings.png';
const mode = process.argv[3] ?? 'threshold';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = mkdtempSync(join(tmpdir(), 'gooffline-shot-'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=9351', `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

try {
  let target = null;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9351/json/list')).json();
      target = list.find((entry) => entry.type === 'page')?.webSocketDebuggerUrl ?? null;
    } catch {}
    if (!target) await sleep(250);
  }
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
  const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:5173' });
  await sleep(1500);
  await run(`fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'wes', password: 'seed-passphrase-for-local-dev' }) }).then((r) => r.status)`);
  await send('Page.navigate', { url: 'http://localhost:5173' });
  await sleep(2500);
  await run(`window.__voicePrefs.set({ inputMode: '${mode}', thresholdDb: -45 })`);
  await run(`document.querySelector('button[title="Voice and audio settings"]').click()`);
  // The fake microphone beeps in pulses, so watch the meter for a while and
  // take the picture at a moment when it is showing something.
  let widest = 0;
  for (let sample = 0; sample < 80; sample += 1) {
    const width = await run(`parseFloat(document.querySelector('.voice-meter-fill')?.style.width ?? '0')`);
    widest = Math.max(widest, width);
    if (sample > 20 && width > 30) break;
    await sleep(50);
  }
  console.log(`meter peaked at ${widest.toFixed(0)}% of its width`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${out}`);
  socket.close();
} finally {
  browser.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}

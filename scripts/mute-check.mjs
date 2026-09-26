/**
 * Prove, with two real browsers and the real media server, that muted means
 * nobody hears you, in every input mode: always on, voice activity (the
 * threshold) and push-to-talk with the key held.
 *
 *   node scripts/mute-check.mjs
 *
 * Found 2026-09-25: the gate that runs voice activity and push-to-talk works
 * by switching the microphone track on and off, and so does mute. The gate did
 * not know about mute, so it could switch a muted microphone back on. This
 * joins wes and alex, mutes wes in each mode, and measures from alex's side
 * whether any of wes's voice is decoded, plus whether wes's track ever turns on.
 *
 * Needs the same three things as `voice-check.mjs`: LiveKit, the dev servers,
 * and a seeded database.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const WEB = process.env.VOICE_CHECK_WEB ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);
const browserPath = CANDIDATES.find((path) => existsSync(path));
if (!browserPath) {
  console.error('No Chromium-based browser found. Set CHROME to one.');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** A picture of one person's window, into VOICE_CHECK_SHOTS if it is set. */
async function shoot(person, name) {
  if (!process.env.VOICE_CHECK_SHOTS) return;
  await sleep(600);
  const shot = await person.send('Page.captureScreenshot', { format: 'png' });
  const path = join(process.env.VOICE_CHECK_SHOTS, `${name}.png`);
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
  console.log(`screenshot: ${path}`);
}

/** One person: their own browser process, profile and DevTools connection. */
class Person {
  constructor(username, debugPort) {
    this.username = username;
    this.debugPort = debugPort;
    this.profile = mkdtempSync(join(tmpdir(), `scryproof-voice-${username}-`));
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
        // A synthetic microphone that beeps, and no permission prompt for it.
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        // Headless Chrome still plays a call out of the real speakers. The test
        // reads decoded energy from WebRTC stats, which sit before the output,
        // so silencing the speakers costs it nothing.
        '--mute-audio',
        // Let WebRTC use 127.0.0.1. Without it Chrome only offers the machine's
        // network addresses, and a VPN's firewall can drop traffic between those
        // and the local LiveKit even though neither end ever leaves this computer.
        '--allow-loopback-in-peer-connection',
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
    if (!target) throw new Error(`${this.username}: the browser never opened its debugging port.`);

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
    // userGesture: the browser only opens a screen share for a real click.
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) {
      throw new Error(`${this.username}: ${result.exceptionDetails.exception?.description ?? 'evaluation failed'}`);
    }
    return result.result.value;
  }

  async until(expression, ms = 30_000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const value = await this.evaluate(expression).catch(() => null);
      if (value) return value;
      await sleep(250);
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
    if (status !== 200) throw new Error(`${this.username}: sign-in returned ${status}. Has the database been seeded?`);
    await this.send('Page.navigate', { url: WEB });
    const ready = await this.until(`Boolean(window.__voice) && document.querySelector('.channel-name') !== null`);
    if (!ready) throw new Error(`${this.username}: the app never finished loading.`);
    this.userId = await this.evaluate(`fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()).then((b) => b.user.id)`);
  }

  /** Click the voice channel in the sidebar, the way a person would. */
  async clickVoiceChannel() {
    return this.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('button, [role="button"], .channel'));
      const row = rows.find((el) => el.textContent.includes('\\u266B'));
      if (!row) return false;
      row.click();
      return true;
    })()`);
  }

  async clickButton(label) {
    return this.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((el) => el.textContent.trim() === '${label}' || el.getAttribute('aria-label') === '${label}');
      if (!button) return false;
      button.click();
      return true;
    })()`);
  }

  snapshot() {
    return this.evaluate(`window.__voice.getSnapshot()`);
  }

  inbound() {
    return this.evaluate(`window.__voice.debugInbound()`);
  }

  /** Decoded energy and packets gained from one person over a few seconds. */
  async listenTo(userId, ms = 4000) {
    const before = (await this.inbound())[userId] ?? { energy: 0, packets: 0 };
    await sleep(ms);
    const after = (await this.inbound())[userId] ?? { energy: 0, packets: 0 };
    return { energy: after.energy - before.energy, packets: after.packets - before.packets };
  }

  /** Pictures decoded from one source ("<userId>:camera" or "<userId>:screen") over a few seconds. */
  async watch(key, ms = 3000) {
    const zero = { frames: 0, width: 0, packets: 0 };
    const before = (await this.evaluate(`window.__voice.debugVideo()`))[key] ?? zero;
    await sleep(ms);
    const after = (await this.evaluate(`window.__voice.debugVideo()`))[key] ?? zero;
    return { frames: after.frames - before.frames, packets: after.packets - before.packets, width: after.width };
  }

  async close() {
    try { this.socket?.close(); } catch {}
    try { this.process?.kill(); } catch {}
    await sleep(300);
    try { rmSync(this.profile, { recursive: true, force: true }); } catch {}
  }
}

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}


const wes = new Person('wes', 9361);
const alex = new Person('alex', 9362);

/** On wes's side, every 50 ms: is the microphone track being sent switched on? */
const sampleTrack = (ms) => `new Promise((done) => {
  const publication = window.__voice.room.localParticipant.getTrackPublication('microphone');
  const seen = [];
  const timer = setInterval(() => seen.push(publication?.track?.mediaStreamTrack?.enabled ? 1 : 0), 50);
  setTimeout(() => { clearInterval(timer); done({ on: seen.filter(Boolean).length, of: seen.length, muted: publication?.isMuted ?? null }); }, ${ms});
})`;

/** Packets wes's browser has sent on the microphone track so far. */
const sent = `window.__voice.room.localParticipant.getTrackPublication('microphone')?.track?.getSenderStats().then((s) => s?.packetsSent ?? 0)`;

const key = (type) => `window.dispatchEvent(new KeyboardEvent('${type}', { code: 'Backquote', key: '\`', bubbles: true })) || true`;

async function main() {
  const up = {
    web: await reachable(WEB),
    api: await reachable('http://127.0.0.1:8787/api/health'),
    livekit: await reachable('http://127.0.0.1:7880/'),
  };
  const missing = Object.entries(up).filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`Not running: ${missing.join(', ')}.`);
    process.exit(2);
  }

  await Promise.all([wes.open(), alex.open()]);
  await Promise.all([wes.signIn(), alex.signIn()]);
  await Promise.all([wes.clickVoiceChannel(), alex.clickVoiceChannel()]);
  const connected = `(() => { const s = window.__voice.getSnapshot(); return s.phase === 'connected' && s.people.length === 1 && s.people[0].state === 'secured'; })()`;
  const ready = await Promise.all([wes.until(connected, 45_000), alex.until(connected, 45_000)]);
  const states = await Promise.all([wes.snapshot(), alex.snapshot()]);
  check('both connect', ready.every(Boolean),
    states.map((s) => `${s.phase} ${s.error ?? ''} ${JSON.stringify(s.people.map((p) => p.state))}`).join('   '));
  if (!ready.every(Boolean)) return;
  await sleep(2000);

  const modes = [
    { mode: 'open', name: 'always on' },
    { mode: 'threshold', name: 'voice activity', thresholdDb: -60 },
    { mode: 'push', name: 'push-to-talk, key held' },
  ];
  for (const { mode, name, thresholdDb } of modes) {
    await wes.evaluate(`window.__voicePrefs.set(${JSON.stringify({ inputMode: mode, thresholdDb: thresholdDb ?? -50, pushKey: 'Backquote' })}) || true`);
    await sleep(800);
    if (mode === 'push') await wes.evaluate(key('keydown'));
    await sleep(1000);
    const heard = await alex.listenTo(wes.userId, 3000);
    check(`${name}: alex hears wes while unmuted (the check can see sound at all)`, heard.energy > 0.001,
      `+${heard.packets} packets, +${heard.energy.toFixed(4)} energy`);

    await wes.clickButton('Mute');
    await wes.until(`window.__voice.room.localParticipant.getTrackPublication('microphone')?.isMuted === true`, 5000);
    await sleep(1000);
    if (mode === 'push') {
      // Let go and press again while muted: the ordinary way to talk into a muted push-to-talk.
      await wes.evaluate(key('keyup'));
      await sleep(300);
      await wes.evaluate(key('keydown'));
    }
    const sentBefore = await wes.evaluate(sent);
    const [track, muted, remote] = await Promise.all([
      wes.evaluate(sampleTrack(4000)),
      alex.listenTo(wes.userId, 4000),
      alex.evaluate(`(() => { const p = [...window.__voice.room.remoteParticipants.values()].find((x) => x.identity === '${wes.userId}'); return p?.getTrackPublication('microphone')?.isMuted ?? null; })()`),
    ]);
    check(`${name}: wes's microphone track stays off while muted`, track.on === 0,
      `on in ${track.on} of ${track.of} samples; LiveKit says muted: ${track.muted}`);
    const sentDuring = (await wes.evaluate(sent)) - sentBefore;
    console.log(`      (wes's browser sent ${sentDuring} microphone packets to the media server in those 4 s)`);
    check(`${name}: alex decodes nothing from wes while muted`, muted.energy < 0.0001,
      `+${muted.packets} packets, +${muted.energy.toFixed(6)} energy; alex sees wes muted: ${remote}`);

    if (mode === 'push') await wes.evaluate(key('keyup'));
    await wes.clickButton('Unmute');
    await wes.until(`window.__voice.room.localParticipant.getTrackPublication('microphone')?.isMuted === false`, 5000);
    await sleep(1000);
  }
  await wes.evaluate(`window.__voicePrefs.set({ inputMode: 'open', thresholdDb: -50 }) || true`);
}

try {
  await main();
} catch (problem) {
  check('the check ran to the end', false, problem instanceof Error ? problem.message : String(problem));
} finally {
  await Promise.all([wes.close(), alex.close()]);
}
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

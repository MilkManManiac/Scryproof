/**
 * A window shared with sound, from the real desktop app, in a real local call.
 *
 * What is being proved: when Wes shares one window from the app with its sound
 * on, the people watching hear that program and nothing else. Not another
 * program, not the call. Plus the two ways in to a stream that came with it:
 * "Watch stream" on the name pop-up, and "Pop out" into a window of its own.
 *
 * Wes is the desktop app (its own temporary profile, driven over its debugging
 * port, as in desktop-check). Alex is a headless Chromium on the dev server (as
 * in voice-check). Two silent tone programs stand in for the shared window and
 * for a game in the background: tone-1000 is shared, tone-1500 must not be
 * heard. Their gain is 0.0003, which nobody in the room can hear; keep it so.
 *
 * Then the whole screen with sound (H): both programs go out, the call must
 * not. For that the app is not muted, so it really plays alex (a steady 700 Hz
 * voice) to the PC, at volume 0.001 and with its chimes off: silent in the
 * room, plain to a recorder. app-sound.exe on the app's own window proves the
 * 700 Hz is playing, so "not in the share" cannot mean "never played".
 *
 * Needs, running and seeded:
 *   npm run dev:livekit
 *   npm run dev            (API on 8787, web on 5173)
 *   npm run seed --workspace server
 *   npm run build --workspace web    (the app loads web/dist)
 *
 *   node scripts/share-sound-check.mjs
 *
 * SHARE_SOUND_SHOTS=docs/shots saves the pictures as share-sound-*.png.
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'desktop');
const electron = createRequire(join(desktop, 'package.json'))('electron');

const SERVER = process.env.SHARE_CHECK_SERVER ?? 'http://127.0.0.1:8787';
const WEB = process.env.SHARE_CHECK_WEB ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const SHOTS = process.env.SHARE_SOUND_SHOTS ?? '';
const BROWSER = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => path && existsSync(path));

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const appSoundRunning = () => {
  try {
    return execSync('tasklist /FI "IMAGENAME eq app-sound.exe" /NH').toString().includes('app-sound.exe');
  } catch {
    return false;
  }
};

/** One DevTools connection to one page. */
class Page {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.nextId = 1;
    this.complaints = [];
  }

  async connect() {
    this.socket = await new Promise((opened, reject) => {
      const ws = new WebSocket(this.url);
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
    return this;
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
    if (result.exceptionDetails) throw new Error(`${this.name}: ${result.exceptionDetails.exception?.description ?? 'evaluation failed'}`);
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

  clickButton(label) {
    return this.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((el) => el.textContent.trim() === ${JSON.stringify(label)} || el.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!button) return false;
      button.click();
      return true;
    })()`);
  }

  clickVoiceChannel() {
    return this.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('button, [role="button"], .channel')).find((el) => el.textContent.includes('\\u266B'));
      if (!row) return false;
      row.click();
      return true;
    })()`);
  }

  async shoot(name) {
    if (!SHOTS) return;
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const path = join(SHOTS, `share-sound-${name}.png`);
    writeFileSync(path, Buffer.from(data, 'base64'));
    console.log(`screenshot: ${path}`);
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

async function targets(port) {
  try {
    return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    return [];
  }
}

async function firstTarget(port, test, tries = 80) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const found = (await targets(port)).find(test);
    if (found) return found;
    await sleep(250);
  }
  return null;
}

/*
 * Wes's microphone, in the app: a quiet 440 Hz tone made in the page instead
 * of the real one, so nothing in the room is picked up, and so "the call's own
 * voice" has a frequency the share's sound can be searched for.
 */
const FAKE_MIC = `
  (() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && constraints.video) return real(constraints);
      const context = new AudioContext({ sampleRate: 48000 });
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = 440;
      gain.gain.value = 0.1;
      const out = context.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      void context.resume();
      return out.stream;
    };
    try {
      localStorage.setItem('scryproof.walkthrough.v1', 'done');
      localStorage.setItem('scryproof.voice-prefs.v1', JSON.stringify({ sounds: false, outputVolume: 0.001 }));
    } catch {}
  })();
`;

/** Alex's microphone: a steady 700 Hz voice, untouched by noise removal, so it can be looked for. */
const ALEX_MIC = `
  (() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && constraints.video) return real(constraints);
      const context = new AudioContext({ sampleRate: 48000 });
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = 700;
      gain.gain.value = 0.3;
      const out = context.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      void context.resume();
      return out.stream;
    };
    try {
      localStorage.setItem('scryproof.walkthrough.v1', 'done');
      localStorage.setItem('scryproof.voice-prefs.v1', JSON.stringify({ noiseMode: 'off', autoGain: false, echoCancellation: false }));
    } catch {}
  })();
`;

/** One tone's level in s16 stereo PCM (left channel), dB below full scale. */
const pcmLevel = (pcm, hz) => {
  const n = Math.floor(pcm.length / 4);
  const w = (2 * Math.PI * hz) / 48000;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i += 1) {
    const x = pcm.readInt16LE(i * 4) / 32768;
    re += x * Math.cos(w * i);
    im -= x * Math.sin(w * i);
  }
  return 20 * Math.log10((2 * Math.hypot(re, im)) / n + 1e-12);
};

/** What app-sound.exe hears from one window's program over `ms`. */
const recordWindow = (hwnd, ms) =>
  new Promise((done) => {
    const chunks = [];
    const child = spawn(join(desktop, 'app-sound', 'app-sound.exe'), [hwnd], { stdio: ['pipe', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('exit', () => done(Buffer.concat(chunks)));
    setTimeout(() => child.stdin.end(), ms);
  });

/** Average spectrum of an analyser over `ms`, as dB per bin, read in the page. */
const SPECTRUM = (analyserExpr, ms) => `(async () => {
  const analyser = ${analyserExpr};
  if (!analyser) return null;
  const bins = new Float32Array(analyser.frequencyBinCount);
  const sum = new Float64Array(bins.length);
  let n = 0;
  const end = Date.now() + ${ms};
  while (Date.now() < end) {
    analyser.getFloatFrequencyData(bins);
    for (let i = 0; i < bins.length; i += 1) sum[i] += Number.isFinite(bins[i]) ? 10 ** (bins[i] / 10) : 0;
    n += 1;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { binHz: analyser.context.sampleRate / analyser.fftSize, db: Array.from(sum, (p) => (p > 0 ? 10 * Math.log10(p / n) : -200)) };
})()`;
const at = (spectrum, hz) => {
  const bin = Math.round(hz / spectrum.binHz);
  return Math.max(...spectrum.db.slice(Math.max(0, bin - 1), bin + 2));
};
const floorOf = (spectrum, skip) => {
  const values = spectrum.db
    .map((db, bin) => ({ db, hz: bin * spectrum.binHz }))
    .filter(({ hz }) => hz > 200 && hz < 8000 && skip.every((f) => Math.abs(hz - f) > 3 * spectrum.binHz))
    .map(({ db }) => db)
    .sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};

/** The pitches within 500 Hz of one, for "nothing stands out here": a whole-PC share carries codec hiss around its sounds. */
const around = (spectrum, hz) => {
  const values = spectrum.db
    .filter((_, bin) => {
      const away = Math.abs(bin * spectrum.binHz - hz);
      return away > 3 * spectrum.binHz && away <= 500;
    })
    .sort((x, y) => x - y);
  return values[Math.floor(values.length / 2)];
};

const scratch = mkdtempSync(join(tmpdir(), 'scryproof-share-sound-'));
const tones = [];
let app = null;
let chrome = null;
let wes = null;
let alex = null;
const popups = [];

try {
  for (const [name, url] of [['API', `${SERVER}/api/health`], ['web', WEB], ['LiveKit', 'http://127.0.0.1:7880/']]) {
    try { await fetch(url, { signal: AbortSignal.timeout(3000) }); } catch { throw new Error(`${name} is not running at ${url}`); }
  }
  if (!BROWSER) throw new Error('No Chromium-based browser found. Set CHROME to one.');

  // The two silent programs, as separate processes outside this one.
  for (const freq of [1000, 1500]) {
    const pid = execSync(
      `powershell -NoProfile -Command "(Start-Process -PassThru '${electron}' -ArgumentList '\\"${join(root, 'docs', 'spikes', 'app-sound', 'tone')}\\"','--freq=${freq}').Id"`,
    ).toString().trim();
    tones.push(pid);
  }

  // ---- A. wes in the desktop app, alex in a browser, same channel, encrypted ----
  app = spawn(electron, [desktop, '--remote-debugging-port=9361', `--user-data-dir=${join(scratch, 'app')}`], {
    env: { ...process.env, SCRYPROOF_SERVER: SERVER, SCRYPROOF_DEV_MEDIA: 'ws://127.0.0.1:7880' },
    stdio: 'ignore',
  });
  chrome = spawn(BROWSER, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--allow-loopback-in-peer-connection',
    '--remote-debugging-port=9362', `--user-data-dir=${join(scratch, 'alex')}`, '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  const appTarget = await firstTarget(9361, (t) => t.type === 'page' && t.url.startsWith('app://'));
  if (!appTarget) throw new Error('The app never opened a window at app://.');
  wes = await new Page('wes', appTarget.webSocketDebuggerUrl).connect();
  await wes.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_MIC });
  await wes.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wes.until(`document.readyState === 'complete'`);
  const wesIn = await wes.evaluate(`fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'wes', password: '${PASSWORD}' }) }).then((r) => r.status)`);
  if (wesIn !== 200) throw new Error(`wes could not sign in (${wesIn}). Seeded?`);
  await wes.send('Page.reload');
  if (!(await wes.until(`document.querySelector('.channel-name') !== null`))) throw new Error('the app never finished loading');

  const alexTarget = await firstTarget(9362, (t) => t.type === 'page');
  alex = await new Page('alex', alexTarget.webSocketDebuggerUrl).connect();
  await alex.send('Page.addScriptToEvaluateOnNewDocument', { source: ALEX_MIC });
  await alex.send('Page.navigate', { url: WEB });
  await alex.until(`document.readyState === 'complete'`);
  const alexIn = await alex.evaluate(`fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alex', password: '${PASSWORD}' }) }).then((r) => r.status)`);
  if (alexIn !== 200) throw new Error(`alex could not sign in (${alexIn})`);
  await alex.send('Page.navigate', { url: WEB });
  if (!(await alex.until(`Boolean(window.__voice) && document.querySelector('.channel-name') !== null`))) throw new Error('alex never finished loading');
  const wesId = await wes.evaluate(`fetch('/api/auth/me').then((r) => r.json()).then((b) => b.user.id)`);

  check('A. both find the voice channel', (await wes.clickVoiceChannel()) && (await alex.clickVoiceChannel()));
  const alexSecured = await alex.until(`(() => { const s = window.__voice.getSnapshot(); return s.phase === 'connected' && s.encrypted && s.people.length === 1 && s.people[0].state === 'secured'; })()`, 45_000);
  const wesSecured = await wes.until(`(document.querySelector('.connection-panel')?.textContent ?? '').includes('Encrypted end to end · 2 people')`, 45_000);
  check('A. both connected with end-to-end encryption (alex: secured + encrypted; wes\'s panel: "Encrypted end to end · 2 people")',
    Boolean(alexSecured && wesSecured), `alex ${JSON.stringify(await alex.evaluate(`(() => { const s = window.__voice.getSnapshot(); return { phase: s.phase, encrypted: s.encrypted, people: s.people.map((p) => p.state) }; })()`))}; wes panel: ${await wes.evaluate(`document.querySelector('.connection-panel')?.textContent ?? 'none'`)}`);

  // ---- B. wes shares the tone-1000 window, with its sound ----
  check('B. wes presses Share your screen', await wes.clickButton('Share your screen'));
  const pickerUp = await wes.until(`document.querySelector('.share-picker') !== null`, 15_000);
  check('B. the in-page picker appears', Boolean(pickerUp));
  await wes.evaluate(`Array.from(document.querySelectorAll('.share-picker [role=tab]')).find((t) => t.textContent.includes('Applications'))?.click()`);
  const tile = await wes.until(`(() => {
    const tile = Array.from(document.querySelectorAll('.share-tile')).find((t) => t.getAttribute('title') === 'tone-1000');
    if (!tile) return false;
    tile.click();
    return true;
  })()`, 10_000);
  check('B. the tone-1000 window is offered and selected', Boolean(tile),
    tile ? '' : `offered: ${await wes.evaluate(`Array.from(document.querySelectorAll('.share-tile')).map((t) => t.title).join(' | ')`)}`);
  await sleep(300);
  await wes.evaluate(`(() => { const box = document.querySelector('.share-picker-sound input'); if (box && !box.checked) box.click(); })()`);
  await sleep(300);
  const label = await wes.evaluate(`document.querySelector('.share-picker-sound span')?.textContent ?? null`);
  const switched = await wes.evaluate(`document.querySelector('.share-picker-sound input')?.checked === true`);
  check(`B. the sound switch is on and reads "Include this app's sound"`, switched && label === "Include this app's sound", `label: ${label}, on: ${switched}`);
  await wes.shoot('picker');
  check('B. wes presses Share', await wes.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('.share-picker button')).find((b) => b.textContent.trim() === 'Share');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`));

  // ---- D. wes's panel says what sound goes out ----
  const panelSays = await wes.until(`(document.querySelector('.connection-panel')?.textContent ?? '').includes('Share sound this window only')`, 15_000);
  check('D. wes\'s connection panel shows "Share sound this window only"', Boolean(panelSays),
    await wes.evaluate(`document.querySelector('.connection-panel')?.textContent ?? 'none'`));
  check('B. app-sound.exe is recording while the window is shared', appSoundRunning());

  // ---- C. alex watches, turns the screen's sound on, and only tone-1000 is in it ----
  const screenListed = await alex.until(`window.__voice.getSnapshot().videos.some((v) => v.userId === '${wesId}' && v.source === 'screen')`, 15_000);
  check('C. alex sees wes\'s screen card', Boolean(screenListed));
  const watched = await alex.evaluate(`(() => {
    const card = Array.from(document.querySelectorAll('.call-tile')).find((t) => Array.from(t.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Watch'));
    const button = card && Array.from(card.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Watch');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  const playing = (state = 'playing') => `window.__voice.getSnapshot().videos.some((v) => v.userId === '${wesId}' && v.source === 'screen' && v.state === '${state}')`;
  check('C. alex presses Watch and the screen plays', watched && Boolean(await alex.until(playing(), 15_000)));
  const soundOf = `window.__voice.getSnapshot().videos.find((v) => v.userId === '${wesId}' && v.source === 'screen')`;
  check('C. the screen has sound, and alex turns it on', (await alex.evaluate(`${soundOf}?.sound === true`)) &&
    (await alex.clickButton('Unmute screen sound')) && Boolean(await alex.until(`${soundOf}?.soundOn === true`, 5000)),
    JSON.stringify(await alex.evaluate(`(() => { const v = ${soundOf}; return v && { sound: v.sound, soundOn: v.soundOn }; })()`)));
  await sleep(2000);
  const share = await alex.evaluate(SPECTRUM(`window.__voice.mix?.voices?.get('${wesId}:screen')?.analyser`, 4000));
  // What alex's own (fake) microphone sounds like, so it can be looked for in wes's share.
  const mic = await alex.evaluate(SPECTRUM(`(() => {
    const track = window.__voice.room.localParticipant.getTrackPublication('microphone')?.track?.mediaStreamTrack;
    if (!track) return null;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    void context.resume();
    return analyser;
  })()`, 2000));
  if (!share) {
    check('C. the received screen sound can be measured', false, 'no analyser for the screen sound in alex\'s mix');
  } else {
    const alexBeep = mic ? mic.db.reduce((best, db, bin) => (bin * mic.binHz > 150 && db > mic.db[best] ? bin : best), 4) * mic.binHz : null;
    const floor = floorOf(share, [1000, 1500, 440, ...(alexBeep ? [alexBeep] : [])]);
    const tone1000 = at(share, 1000);
    const tone1500 = at(share, 1500);
    const ownVoice = at(share, 440);
    const alexVoice = alexBeep ? at(share, alexBeep) : null;
    const f = (db) => `${db.toFixed(1)} dB`;
    console.log(`      received screen sound at alex: 1000 Hz ${f(tone1000)}, 1500 Hz ${f(tone1500)}, floor ${f(floor)}, wes's mic 440 Hz ${f(ownVoice)}, alex's mic ${alexBeep ? `${alexBeep.toFixed(0)} Hz ${f(alexVoice)}` : 'unmeasured'}`);
    check('C. 1000 Hz (the shared window) is clearly above the floor (>= 20 dB)', tone1000 - floor >= 20, `${(tone1000 - floor).toFixed(1)} dB above`);
    check('C. 1500 Hz (the other program) is at the floor (< 6 dB above)', tone1500 - floor < 6, `${(tone1500 - floor).toFixed(1)} dB above`);
    check('C. no own voice: wes\'s 440 Hz mic tone is at the floor', ownVoice - floor < 6, `${(ownVoice - floor).toFixed(1)} dB above`);
    if (alexBeep && Math.abs(alexBeep - 1000) > 3 * share.binHz && Math.abs(alexBeep - 1500) > 3 * share.binHz) {
      check(`C. no call voice: alex's mic (${alexBeep.toFixed(0)} Hz) is at the floor`, alexVoice - floor < 6, `${(alexVoice - floor).toFixed(1)} dB above`);
    }
  }
  await alex.shoot('stage');

  // ---- E. the name pop-up: Watch stream ----
  check('E. alex presses Stop watching first', await alex.clickButton('Stop watching') && Boolean(await alex.until(playing('waiting'), 10_000)));
  const cardOpen = await alex.evaluate(`(() => {
    const row = Array.from(document.querySelectorAll('.voice-member')).find((el) => /wes/i.test(el.querySelector('.channel-name')?.textContent ?? ''));
    if (!row) return false;
    row.click();
    return true;
  })()`);
  const offered = cardOpen && (await alex.until(`Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Watch stream')`, 5000));
  check('E. clicking wes in the sidebar opens his card with "Watch stream"', Boolean(offered));
  check('E. Watch stream makes the screen play', (await alex.clickButton('Watch stream')) && Boolean(await alex.until(playing(), 15_000)));
  check('E. and the picture shows in the main window', Boolean(await alex.until(`(document.querySelector('.voice-focus-video')?.videoWidth ?? 0) > 0`, 10_000)));

  // ---- F. Pop out ----
  const before = new Set((await targets(9362)).map((t) => t.id));
  check('F. alex presses Pop out', await alex.clickButton('Pop out'));
  const popupTarget = await firstTarget(9362, (t) => t.type === 'page' && !before.has(t.id), 40);
  if (!popupTarget) {
    check('F. a pop-out window opens', false);
  } else {
    const popup = await new Page('popup', popupTarget.webSocketDebuggerUrl).connect();
    popups.push(popup);
    const frames = `(() => { const v = document.querySelector('video'); return v ? { width: v.videoWidth, frames: v.getVideoPlaybackQuality().totalVideoFrames } : null; })()`;
    await popup.until(`(document.querySelector('video')?.videoWidth ?? 0) > 0`, 10_000);
    const first = await popup.evaluate(frames);
    const mainBefore = (await alex.evaluate(`window.__voice.debugVideo()`))[`${wesId}:screen`];
    await sleep(3000);
    const second = await popup.evaluate(frames);
    const mainAfter = (await alex.evaluate(`window.__voice.debugVideo()`))[`${wesId}:screen`];
    console.log(`      decoded for wes's screen in alex's page over those 3 s: ${JSON.stringify(mainBefore)} -> ${JSON.stringify(mainAfter)}`);
    console.log(`      popup video: ${JSON.stringify(await popup.evaluate(`(() => { const v = document.querySelector('video'); const t = v?.srcObject?.getVideoTracks?.()[0]; return v && { readyState: v.readyState, paused: v.paused, track: t ? { state: t.readyState, muted: t.muted, enabled: t.enabled } : null }; })()`))}`);
    check('F. a pop-out window opens, its video has a picture and new frames over 3 s',
      Boolean(first && second && first.width > 0 && second.frames > first.frames),
      `width ${first?.width}, frames ${first?.frames} -> ${second?.frames}`);
    await popup.shoot('popout');
    check('F. alex presses Stop watching in the main window', await alex.clickButton('Stop watching'));
    let gone = false;
    for (let i = 0; i < 20 && !gone; i += 1) {
      gone = !(await targets(9362)).some((t) => t.id === popupTarget.id);
      if (!gone) await sleep(250);
    }
    check('F. and the pop-out closes', gone);
  }

  // ---- G. wes stops: the recorder goes ----
  check('G. wes presses Stop sharing', await wes.clickButton('Stop sharing'));
  const stoppedAt = Date.now();
  while (appSoundRunning() && Date.now() - stoppedAt < 3000) await sleep(200);
  check('G. within 3 s there is no app-sound.exe', !appSoundRunning(), `${Date.now() - stoppedAt} ms`);

  // ---- H. wes shares his whole screen with sound: both programs, not the call ----
  await sleep(1000);
  check('H. wes presses Share your screen again', await wes.clickButton('Share your screen'));
  await wes.until(`document.querySelector('.share-picker') !== null`, 15_000);
  await wes.evaluate(`Array.from(document.querySelectorAll('.share-picker [role=tab]')).find((t) => t.textContent.includes('Screens'))?.click()`);
  await sleep(300);
  check('H. a whole screen is selected', await wes.evaluate(`(() => { const t = document.querySelector('.share-tile'); if (!t) return false; t.click(); return true; })()`));
  await sleep(300);
  await wes.evaluate(`(() => { const box = document.querySelector('.share-picker-sound input'); if (box && !box.checked) box.click(); })()`);
  await sleep(300);
  const screenLabel = await wes.evaluate(`document.querySelector('.share-picker-sound span')?.textContent ?? null`);
  check('H. the sound switch is on and reads "Include sound"', screenLabel === 'Include sound' && (await wes.evaluate(`document.querySelector('.share-picker-sound input')?.checked === true`)), `label: ${screenLabel}`);
  check('H. wes presses Share', await wes.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('.share-picker button')).find((b) => b.textContent.trim() === 'Share');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`));
  const machine = await wes.until(`(document.querySelector('.connection-panel')?.textContent ?? '').includes('Share sound whole PC')`, 15_000);
  const machineSays = await wes.evaluate(`(document.querySelector('.connection-panel')?.textContent ?? '').match(/Share sound (whole PC, call [a-z]+( out)?)/)?.[1] ?? 'none'`);
  check('H. wes\'s panel shows "Share sound whole PC, call left out"', Boolean(machine) && machineSays === 'whole PC, call left out', machineSays);
  check('H. alex presses Watch', Boolean(await alex.until(`(() => {
    const button = Array.from(document.querySelectorAll('.call-tile button')).find((b) => b.textContent.trim() === 'Watch');
    if (!button) return false;
    button.click();
    return true;
  })()`, 15_000)) && Boolean(await alex.until(playing(), 15_000)));
  if (!(await alex.evaluate(`${soundOf}?.soundOn === true`))) await alex.clickButton('Unmute screen sound');
  check('H. the screen sound is on at alex', Boolean(await alex.until(`${soundOf}?.soundOn === true`, 5000)));
  await sleep(2000);
  const appHwnd = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${app.pid}).MainWindowHandle"`).toString().trim();
  const [whole, appPcm] = await Promise.all([
    alex.evaluate(SPECTRUM(`window.__voice.mix?.voices?.get('${wesId}:screen')?.analyser`, 4000)),
    recordWindow(appHwnd, 3000),
  ]);
  const playedAlex = appPcm.length ? pcmLevel(appPcm, 700) : -200;
  console.log(`      wes's app is playing alex's 700 Hz at ${playedAlex.toFixed(1)} dBFS (app-sound.exe on its window, ${appPcm.length} bytes)`);
  check('H. control: wes\'s app really is playing alex to the PC (700 Hz above -100 dBFS)', playedAlex > -100);
  if (!whole) {
    check('H. the received whole-screen sound can be measured', false);
  } else {
    const floor = floorOf(whole, [1000, 1500, 700, 440]);
    const above = (hz) => at(whole, hz) - floor;
    const standsOut = (hz) => at(whole, hz) - around(whole, hz);
    console.log(`      received whole-screen sound at alex: 1000 Hz +${above(1000).toFixed(1)}, 1500 Hz +${above(1500).toFixed(1)} over a floor of ${floor.toFixed(1)} dB; against the pitches around them, alex 700 Hz ${standsOut(700).toFixed(1)}, wes's mic 440 Hz ${standsOut(440).toFixed(1)} dB`);
    check('H. both programs are in it (1000 and 1500 Hz >= 20 dB above the floor)', above(1000) >= 20 && above(1500) >= 20);
    check("H. the call is not: alex's 700 Hz voice does not stand out from the pitches around it (< 6 dB)", standsOut(700) < 6);
    check("H. and wes's own mic is not: 440 Hz does not stand out (< 6 dB)", standsOut(440) < 6);
  }
  check('H. wes presses Stop sharing', await wes.clickButton('Stop sharing'));

  check('no uncaught errors in either page', wes.complaints.length + alex.complaints.length === 0, [...wes.complaints, ...alex.complaints].join('\n      '));
} catch (problem) {
  check('the run finished', false, String(problem?.stack ?? problem));
} finally {
  for (const page of [...popups, wes, alex]) page?.close();
  try { app?.kill(); } catch {}
  try { chrome?.kill(); } catch {}
  for (const pid of tones) try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(800);
  try { rmSync(scratch, { recursive: true, force: true }); } catch {}
}

console.log(failures === 0 ? '\nAll share-sound checks passed.' : `\n${failures} share-sound check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

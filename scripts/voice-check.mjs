/**
 * Prove, with real browsers and a real media server, that a call is encrypted
 * end to end and that the encryption is doing something.
 *
 * `npm test` covers the key agreement in Node. What Node cannot cover is the
 * last hop: whether LiveKit actually encrypts frames with the keys we hand it,
 * and whether someone holding the wrong key actually hears nothing. That is the
 * claim the interface makes, so it gets tested where it is true or false.
 *
 * Two separate Chromium processes (separate profiles, so separate device
 * identities) sign in as two seeded users, join the same voice channel through
 * the real interface, and then:
 *
 *   1. both reach "connected" with E2EE on, and each holds the other's key
 *   2. both compute the same twenty-digit verification code
 *   3. decoded audio energy from the other person is climbing
 *   4. SABOTAGE: one side swaps the other's key for random bytes. Packets keep
 *      arriving; decoded energy stops. That is what "cannot decrypt" looks like.
 *   5. the other person leaves and rejoins. The epoch goes up, fresh keys are
 *      exchanged, and audio comes back without anyone doing anything.
 *   6. the same two start a call inside their direct message: it takes them
 *      out of the server channel, is marked in the other's list, refuses a
 *      third person who shares the server but not the conversation, and is
 *      encrypted and measured exactly like a channel call.
 *
 * Needs three things running:
 *
 *   npm run dev:livekit          the media server
 *   npm run dev                  API on :8787 and web on :5173
 *   npm run seed --workspace server   (once, for the wes and alex accounts)
 *
 * Chromium's fake microphone is a steady beep, which is what makes "energy is
 * climbing" a meaningful check.
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

const wes = new Person('wes', 9341);
const alex = new Person('alex', 9342);
const mara = new Person('mara', 9343);

async function main() {
  const up = {
    'the web dev server (npm run dev)': await reachable(WEB),
    'the API (npm run dev)': await reachable('http://127.0.0.1:8787/api/health'),
    'LiveKit (npm run dev:livekit)': await reachable('http://127.0.0.1:7880/'),
  };
  const missing = Object.entries(up).filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`Not running: ${missing.join(', ')}.`);
    process.exit(2);
  }

  await Promise.all([wes.open(), alex.open()]);
  await Promise.all([wes.signIn(), alex.signIn()]);

  check('both people can find the voice channel', (await wes.clickVoiceChannel()) && (await alex.clickVoiceChannel()));

  const connected = `(() => { const s = window.__voice.getSnapshot(); return s.phase === 'connected' && s.people.length === 1 && s.people[0].state === 'secured' && s.code; })()`;
  const [wesReady, alexReady] = await Promise.all([wes.until(connected, 45_000), alex.until(connected, 45_000)]);
  let [w, a] = await Promise.all([wes.snapshot(), alex.snapshot()]);
  check('both connect, and each holds the other\'s verified key', Boolean(wesReady && alexReady),
    `wes: ${w.phase} ${w.error ?? ''} ${JSON.stringify(w.people.map((p) => p.state))}   alex: ${a.phase} ${a.error ?? ''} ${JSON.stringify(a.people.map((p) => p.state))}`);
  if (!wesReady || !alexReady) return;

  check('LiveKit reports end-to-end encryption on, for both', w.encrypted && a.encrypted);
  check('both compute the same verification code', w.code === a.code && /^\d{5} \d{5} \d{5} \d{5}$/.test(w.code), `${w.code}  /  ${a.code}`);
  check('both are on the same epoch', w.epoch === a.epoch && w.epoch > 0, `wes ${w.epoch}, alex ${a.epoch}`);
  check('first contact is labelled as first contact, not silently trusted as known',
    w.people[0].verdict === 'first-seen' && a.people[0].verdict === 'first-seen');

  const clear = await wes.listenTo(alex.userId);
  check('wes is decoding real audio from alex', clear.energy > 0.001 && clear.packets > 50,
    `+${clear.packets} packets, +${clear.energy.toFixed(4)} energy`);

  // The speaking ring reaches both lists, not only the voice view. The fake
  // microphone is a steady tone, so alex is "speaking" the whole time.
  const ringed = await wes.until(`(() => {
    const inList = Array.from(document.querySelectorAll('.voice-member.speaking')).some((el) => el.textContent.includes('Alex'));
    const inMembers = Array.from(document.querySelectorAll('.member.speaking')).some((el) => el.textContent.includes('Alex'));
    return inList && inMembers;
  })()`, 15_000);
  const ringReport = await wes.evaluate(`JSON.stringify({
    speaking: window.__voice.getSnapshot().speaking,
    tile: document.querySelectorAll('.call-tile.speaking').length,
    list: document.querySelectorAll('.voice-member.speaking').length,
    members: document.querySelectorAll('.member.speaking').length,
    channel: window.__voice.getSnapshot().channelId,
  })`);
  check('the channel list and the member list both ring alex while he speaks', Boolean(ringed), ringReport);
  check('the member list marks alex as in voice', await wes.evaluate(`Array.from(document.querySelectorAll('.member.in-voice')).some((el) => el.textContent.includes('Alex'))`));

  await sleep(2500); // let a stats sample land
  w = await wes.snapshot();
  check('the connection panel has measured numbers, not dashes', w.stats.rttMs !== null && w.stats.codec !== null && w.stats.relayed !== null,
    JSON.stringify(w.stats));

  await shoot(wes, 'channel-call');
  if (process.env.VOICE_CHECK_SHOT) {
    await wes.clickButton('Verify');
    await sleep(400);
    const shot = await wes.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.VOICE_CHECK_SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`screenshot: ${process.env.VOICE_CHECK_SHOT}`);
  }

  // ---- nobody else is told where we are --------------------------------------
  const iceServers = await wes.evaluate(`window.__voice.debugIceServers()`);
  const foreign = iceServers.filter((url) => !/^(stun|turns?):(127\.0\.0\.1|localhost)[:?]/.test(url));
  check('the browser is pointed at no STUN or TURN server that is not ours', foreign.length === 0,
    iceServers.length === 0 ? 'none at all' : iceServers.join(', '));

  // ---- the sound path: volume, and the gate ------------------------------------
  await wes.evaluate(`window.__voicePrefs.setVolumeFor('${alex.userId}', 0)`);
  await sleep(300);
  const silenced = await wes.listenTo(alex.userId, 3000);
  await wes.evaluate(`window.__voicePrefs.setVolumeFor('${alex.userId}', 2)`);
  await sleep(300);
  const boosted = await wes.listenTo(alex.userId, 3000);
  await wes.evaluate(`window.__voicePrefs.setVolumeFor('${alex.userId}', 1)`);
  await sleep(300);
  const normal = await wes.listenTo(alex.userId, 3000);
  check('one person can be turned down to nothing, and up past 100%',
    silenced.energy === 0 && boosted.energy > normal.energy * 2.5 && normal.energy > 0,
    `0%: ${silenced.energy.toFixed(4)}  100%: ${normal.energy.toFixed(4)}  200%: ${boosted.energy.toFixed(4)}`);

  await alex.evaluate(`window.__voicePrefs.set({ inputMode: 'push', pushKey: 'F8' })`);
  await sleep(1200);
  const shut = await wes.listenTo(alex.userId, 3000);
  await alex.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }))`);
  await sleep(800);
  const held = await wes.listenTo(alex.userId, 3000);
  await alex.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F8' }))`);
  await sleep(800);
  const released = await wes.listenTo(alex.userId, 3000);
  await alex.evaluate(`window.__voicePrefs.set({ inputMode: 'open' })`);
  await sleep(800);
  check('push-to-talk sends nothing until the key is held, and nothing again after',
    shut.energy < held.energy * 0.02 && released.energy < held.energy * 0.02 && held.energy > 0.001,
    `up ${shut.energy.toFixed(5)}  held ${held.energy.toFixed(5)}  up again ${released.energy.toFixed(5)}`);

  // ---- camera and screen, through the same encryption --------------------------
  check('alex has a camera button and presses it', await alex.clickButton('Turn camera on'));
  const cameraKey = `${alex.userId}:camera`;
  await wes.until(`window.__voice.getSnapshot().videos.some((v) => v.userId === '${alex.userId}' && v.source === 'camera')`, 15_000);
  await sleep(1500);
  const seen = await wes.watch(cameraKey);
  check('wes is decoding real pictures from the camera alex turned on', seen.frames > 20 && seen.width > 0,
    `+${seen.frames} frames at ${seen.width}px wide, +${seen.packets} packets`);
  check('the picture is on screen for wes, in a tile',
    await wes.evaluate(`(() => { const v = document.querySelector('video.voice-tile-video, video.voice-focus-video'); return Boolean(v && v.videoWidth > 0); })()`));
  await sleep(2500);
  const videoCodec = (await wes.snapshot()).stats.videoCodec;
  check('the pictures come as VP9, not the VP8 fallback', videoCodec === 'VP9', String(videoCodec));

  check('alex has a share button and presses it', await alex.clickButton('Share your screen'));
  const screenKey = `${alex.userId}:screen`;
  const sharing = await wes.until(`window.__voice.getSnapshot().videos.some((v) => v.userId === '${alex.userId}' && v.source === 'screen')`, 15_000);
  await sleep(1500);
  const shared = sharing ? await wes.watch(screenKey) : { frames: 0, width: 0, packets: 0 };
  const alexMedia = await alex.snapshot();
  check('both lists show the screen mark beside alex',
    await wes.evaluate(`document.querySelector('.voice-member .voice-flag.sharing') !== null && document.querySelector('.member .voice-flag.sharing') !== null`));
  check('wes is decoding the screen alex shared, and it took over the stage',
    shared.frames > 5 && (await wes.evaluate(`Boolean(document.querySelector('video.voice-focus-video'))`)),
    `+${shared.frames} frames at ${shared.width}px wide${alexMedia.mediaError ? `, alex: ${alexMedia.mediaError}` : ''}`);
  await shoot(wes, 'focus');
  check('the stream quality menu opens from inside the call', await wes.clickButton('Stream quality') &&
    Boolean(await wes.until(`Boolean(document.querySelector('.call-quality'))`, 3000)));
  await shoot(wes, 'quality');
  await wes.clickButton('Stream quality');

  // The watcher's choice, not the sharer's: wes asks for less and gets less,
  // while alex changes nothing. The check reads the decoded frame width.
  await wes.evaluate(`window.__voicePrefs.set({ receiveQuality: 'low' })`);
  const smaller = await wes.until(`window.__voice.debugVideo().then((v) => (v['${screenKey}']?.width ?? 0) > 0 && v['${screenKey}'].width < ${shared.width} ? v['${screenKey}'].width : 0)`, 15_000);
  check('asking for Low shrinks the screen wes receives, without touching what alex sends',
    Boolean(smaller), `${shared.width}px wide became ${smaller || 'no smaller'}`);
  const panelSays = await wes.evaluate(`(document.querySelector('.connection-panel')?.textContent ?? '')`);
  check('the connection panel says what size is arriving', /Video \d+x\d+/.test(panelSays), panelSays.match(/Video \S+/)?.[0] ?? panelSays);
  await wes.evaluate(`window.__voicePrefs.set({ receiveQuality: 'auto' })`);
  const regrown = await wes.until(`window.__voice.debugVideo().then((v) => (v['${screenKey}']?.width ?? 0) > ${smaller} ? v['${screenKey}'].width : 0)`, 15_000);
  check('back on Sharp, the picture grows again', Boolean(smaller) && Boolean(regrown), `${regrown || 'stayed small'}px wide`);

  if (process.env.VOICE_CHECK_VIDEO_SHOT) {
    const shot = await wes.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.VOICE_CHECK_VIDEO_SHOT, Buffer.from(shot.data, 'base64'));
    await wes.clickButton('Make small');
    await sleep(600);
    const tiles = await wes.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.VOICE_CHECK_VIDEO_SHOT.replace('.png', '-tiles.png'), Buffer.from(tiles.data, 'base64'));
  }

  // ---- sabotage: the wrong key ------------------------------------------------
  await wes.evaluate(`window.__voice.debugCorruptKeyFor('${alex.userId}')`);
  await sleep(1500); // frames already in the jitter buffer drain out
  const blind = wes.watch(cameraKey, 4000);
  const garbled = await wes.listenTo(alex.userId);
  const unseen = await blind;
  check('with the WRONG key, the camera goes dark too: packets arrive, no picture decodes',
    unseen.packets > 20 && unseen.frames === 0,
    `+${unseen.packets} packets, +${unseen.frames} frames (was +${seen.frames})`);
  check('with the WRONG key, packets still arrive but nothing can be decoded',
    garbled.packets > 50 && garbled.energy < clear.energy * 0.02,
    `+${garbled.packets} packets, +${garbled.energy.toFixed(6)} energy (was +${clear.energy.toFixed(4)} with the right key)`);

  // ---- rotation: alex leaves and comes back ------------------------------------
  const epochBefore = (await wes.snapshot()).epoch;
  await alex.clickButton('Leave');
  const alone = await wes.until(`window.__voice.getSnapshot().people.length === 0`, 15_000);
  check('when alex leaves, wes rotates to a new epoch alone', Boolean(alone) && (await wes.snapshot()).epoch > epochBefore);

  await alex.clickButton('Join');
  const [wesBack, alexBack] = await Promise.all([wes.until(connected, 45_000), alex.until(connected, 45_000)]);
  [w, a] = await Promise.all([wes.snapshot(), alex.snapshot()]);
  check('alex rejoins and fresh keys are exchanged with nobody doing anything', Boolean(wesBack && alexBack) && w.epoch === a.epoch && w.epoch > epochBefore + 1,
    `epoch ${epochBefore} -> ${w.epoch}`);
  check('the second time, alex is simply known', w.people[0]?.verdict === 'known', w.people[0]?.verdict);

  const restored = await wes.listenTo(alex.userId);
  check('audio comes back after the rotation', restored.energy > 0.001, `+${restored.packets} packets, +${restored.energy.toFixed(4)} energy`);

  // ---- a third person: keys go pairwise, so three is where ordering bites -------
  await mara.open();
  await mara.signIn();
  await mara.clickVoiceChannel();
  const three = `(() => { const s = window.__voice.getSnapshot(); return s.phase === 'connected' && s.people.length === 2 && s.people.every((p) => p.state === 'secured') && s.code; })()`;
  const trio = await Promise.all([wes.until(three, 45_000), alex.until(three, 45_000), mara.until(three, 45_000)]);
  const [w3, a3, m3] = await Promise.all([wes.snapshot(), alex.snapshot(), mara.snapshot()]);
  check('a third person joins and all three hold one another\'s keys', trio.every(Boolean),
    [w3, a3, m3].map((s) => JSON.stringify(s.people.map((p) => p.state))).join('  '));
  check('all three see the same code, and it is not the two-person code',
    w3.code === a3.code && a3.code === m3.code && w3.code !== w.code, `${w3.code} (was ${w.code})`);
  {
    // The code box names whose keys the digits cover, from the call's own key
    // list: a server that adds a listener of its own shows up here by name.
    await mara.clickButton('Verify');
    const covers = await mara.until(`document.querySelector('.voice-code-covers')?.textContent ?? ''`, 10_000);
    check('the code box names exactly who the code covers', covers === 'Covers: you, Wes, Alex.' || covers === 'Covers: you, Alex, Wes.', String(covers));
    await mara.clickButton('Hide code');
  }
  const [fromWes, fromAlex] = await Promise.all([mara.listenTo(wes.userId), mara.listenTo(alex.userId)]);
  check('the newcomer decodes both of the others', fromWes.energy > 0.001 && fromAlex.energy > 0.001,
    `wes +${fromWes.energy.toFixed(4)}, alex +${fromAlex.energy.toFixed(4)}`);

  // ---- two screens at once: Wes and his brother tried it and "it did not work" --
  const alexScreen = `${alex.userId}:screen`;
  const wesScreen = `${wes.userId}:screen`;
  check('alex shares his screen again', await alex.clickButton('Share your screen'));
  await mara.until(`window.__voice.getSnapshot().videos.some((v) => v.userId === '${alex.userId}' && v.source === 'screen')`, 15_000);
  check('wes shares his screen while alex is still sharing', await wes.clickButton('Share your screen'));
  const bothListed = await mara.until(`(() => { const v = window.__voice.getSnapshot().videos; return v.some((x) => x.userId === '${alex.userId}' && x.source === 'screen') && v.some((x) => x.userId === '${wes.userId}' && x.source === 'screen'); })()`, 15_000);
  const [ws2, as2] = await Promise.all([wes.snapshot(), alex.snapshot()]);
  check('mara is told about both screens', Boolean(bothListed),
    JSON.stringify((await mara.snapshot()).videos.map((v) => `${v.userId === wes.userId ? 'wes' : v.userId === alex.userId ? 'alex' : v.userId}:${v.source}`))
      + `  wes: ${ws2.sharing ?? ''} ${ws2.mediaError ?? ''}  alex: ${as2.sharing ?? ''} ${as2.mediaError ?? ''}`);
  await sleep(1500);
  const [maraSeesAlex, maraSeesWes] = await Promise.all([mara.watch(alexScreen), mara.watch(wesScreen)]);
  check('mara decodes both screens at once', maraSeesAlex.frames > 5 && maraSeesWes.frames > 5,
    `alex +${maraSeesAlex.frames} frames ${maraSeesAlex.width}px, wes +${maraSeesWes.frames} frames ${maraSeesWes.width}px`);
  const [wesSeesAlex, alexSeesWes] = await Promise.all([wes.watch(alexScreen), alex.watch(wesScreen)]);
  check('each sharer still sees the other one\'s screen', wesSeesAlex.frames > 5 && alexSeesWes.frames > 5,
    `wes sees alex +${wesSeesAlex.frames}, alex sees wes +${alexSeesWes.frames}`);
  const onStage = await mara.evaluate(`document.querySelectorAll('video.voice-focus-video, video.voice-tile-video').length`);
  check('mara has both screens on her screen, one big and one tile', onStage >= 2, `${onStage} video elements`);
  await shoot(mara, 'two-screens');

  await mara.clickButton('Leave');
  const pair =await Promise.all([wes.until(connected, 30_000), alex.until(connected, 30_000)]);
  const [w4, a4] = await Promise.all([wes.snapshot(), alex.snapshot()]);
  check('when the third leaves, the two who stay move to a key she never had',
    pair.every(Boolean) && w4.epoch > w3.epoch && w4.epoch === a4.epoch, `epoch ${w3.epoch} -> ${w4.epoch}`);
  const after = await wes.listenTo(alex.userId);
  check('and they can still hear each other', after.energy > 0.001, `+${after.energy.toFixed(4)} energy`);

  // ---- a call inside a direct message ------------------------------------------
  // Wes and alex are still in the server's voice channel. Starting the DM call
  // from there is also the one-call-at-a-time check: the channel must lose them.
  const dmId = await wes.evaluate(`fetch('/api/dms', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '${alex.userId}' }),
  }).then((r) => r.json()).then((b) => b.dm.id)`);
  // Opened the way a person opens it, from Alex's card: on a fresh database
  // the conversation is new, and only the device that opened it knows so far.
  await wes.evaluate(`Array.from(document.querySelectorAll('.member')).find((el) => el.textContent.includes('Alex')).click()`);
  await wes.until(`document.querySelector('.profile-card') !== null`);
  await wes.evaluate(`Array.from(document.querySelectorAll('.profile-card-actions button')).find((el) => el.textContent.trim() === 'Message').click()`);
  check('the conversation has a Call button, and wes presses it', Boolean(await wes.until(`Boolean(document.querySelector('.dm-call-toggle'))`, 10_000)) && (await wes.clickButton('Call')));

  const wesInDm = await wes.until(`(() => { const s = window.__voice.getSnapshot(); return s.dmId === '${dmId}' && s.channelId === null && s.phase === 'connected'; })()`, 45_000);
  check('wes is in the DM call, and out of the server channel', Boolean(wesInDm) &&
    Boolean(await alex.until(`!document.querySelector('.voice-member') || !Array.from(document.querySelectorAll('.voice-member')).some((el) => el.textContent.includes('Wes'))`, 10_000)));

  await alex.evaluate(`document.querySelector('.rail-dms').click()`);
  const marked = await alex.until(`Array.from(document.querySelectorAll('.dm-row')).some((el) => el.textContent.includes('Wes') && el.querySelector('.dm-call-mark'))`, 15_000);
  check('alex sees the call marked in his list', Boolean(marked));
  check('and it rings for alex: the incoming call card names wes',
    Boolean(await alex.until(`document.querySelector('.incoming-call')?.textContent.includes('Wes')`, 10_000)));
  await shoot(alex, 'ringing');
  // Mara shares the server with both of them but is not in the conversation.
  const maraToken = await mara.evaluate(`fetch('/api/dms/${dmId}/voice/token', { method: 'POST', credentials: 'include' }).then((r) => r.status)`);
  check('mara, who is not in the conversation, sees no mark and is refused a token as if it did not exist',
    maraToken === 404 && !(await mara.evaluate(`Array.from(document.querySelectorAll('.member.in-voice')).some((el) => el.textContent.includes('Wes'))`)),
    `token: ${maraToken}`);

  await alex.evaluate(`Array.from(document.querySelectorAll('.dm-row')).find((el) => el.textContent.includes('Wes')).click()`);
  check('alex joins by clicking', Boolean(await alex.until(`Boolean(document.querySelector('.dm-call-toggle'))`, 10_000)) && (await alex.clickButton('Join call')));

  const [wesDm, alexDm] = await Promise.all([wes.until(connected, 45_000), alex.until(connected, 45_000)]);
  const [wd, ad] = await Promise.all([wes.snapshot(), alex.snapshot()]);
  check('both connect in the DM call, each holding the other\'s verified key', Boolean(wesDm && alexDm) && wd.dmId === dmId && ad.dmId === dmId,
    `wes: ${wd.phase} ${wd.error ?? ''} ${wd.dmId}   alex: ${ad.phase} ${ad.error ?? ''} ${ad.dmId}`);
  check('the DM call is end-to-end encrypted, with one code for both', wd.encrypted && ad.encrypted && wd.code === ad.code && Boolean(wd.code),
    `${wd.code}  /  ${ad.code}`);
  check('the DM call is known to alex as the device he already met', wd.people[0]?.verdict === 'known', wd.people[0]?.verdict);
  const dmHeard = await wes.listenTo(alex.userId);
  check('wes decodes alex in the DM call', dmHeard.energy > 0.001, `+${dmHeard.packets} packets, +${dmHeard.energy.toFixed(4)} energy`);
  check('the DM call has its stage above the messages and the connection panel below',
    await wes.evaluate(`Boolean(document.querySelector('.dm-call .voice-stage')) && Boolean(document.querySelector('.connection-panel'))`));
  check('the ringing stopped for alex once he joined', await alex.evaluate(`document.querySelector('.incoming-call') === null`));
  await shoot(wes, 'dm-call');
  await sleep(2500);
  const dmStats = (await wes.snapshot()).stats;
  check('the connection panel measures the DM call too', dmStats.rttMs !== null && dmStats.relayed !== null, JSON.stringify(dmStats));

  const dmEpoch = (await wes.snapshot()).epoch;
  await alex.clickButton('Leave call');
  const dmAlone = await wes.until(`window.__voice.getSnapshot().people.length === 0`, 15_000);
  check('when alex hangs up, wes rotates alone and alex\'s mark clears for no one else',
    Boolean(dmAlone) && (await wes.snapshot()).epoch > dmEpoch);
  await wes.clickButton('Leave call');

  const errors = [...wes.complaints, ...alex.complaints, ...mara.complaints];
  check('no uncaught exceptions in any browser', errors.length === 0, errors.join('\n      '));
}

main()
  .catch((problem) => check('the check ran to completion', false, problem.stack ?? String(problem)))
  .finally(async () => {
    await Promise.all([wes.close(), alex.close(), mara.close()]);
    const failed = results.filter((entry) => !entry.ok).length;
    console.log(failed === 0 ? `RESULT: ALL PASS (${results.length})` : `RESULT: ${failed} FAILED of ${results.length}`);
    process.exit(failed === 0 ? 0 : 1);
  });

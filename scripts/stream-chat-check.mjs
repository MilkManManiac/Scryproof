/**
 * Stream chat checks, in the style of scripts/voice-check.mjs: separate headless
 * Chrome processes (separate profiles), driven over DevTools, against the local
 * dev servers. Never targets production.
 *
 * Needs `npm run dev:livekit`, `npm run dev` and a seeded database.
 *
 *   node scripts/stream-chat-check.mjs 0   encryption proof (our own seal; a wrong key drops it)
 *   node scripts/stream-chat-check.mjs 2   comments reach the watcher's snapshot; stop clears
 *   node scripts/stream-chat-check.mjs 3   the strip on a screen, both ways, pop-out, screenshots
 *   node scripts/stream-chat-check.mjs 4   the strip on music, screenshot
 *
 * CHAT_SHOTS=docs/shots saves the pictures as stream-chat-*.png.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WEB = process.env.CHAT_WEB ?? 'http://localhost:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(WEB).hostname)) throw Error('Local development only');
const PASSWORD = 'seed-passphrase-for-local-dev';
const SHOTS = process.env.CHAT_SHOTS ?? '';
const browserPath = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => path && existsSync(path));
if (!browserPath) throw Error('No Chromium-based browser found. Set CHROME.');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

class Person {
  constructor(username, port) {
    this.username = username;
    this.port = port;
    this.profile = mkdtempSync(join(tmpdir(), `scryproof-chat-${username}-`));
    this.nextId = 1;
    this.complaints = [];
    this.waiting = new Map();
  }

  async open() {
    this.process = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--allow-loopback-in-peer-connection',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profile}`,
      '--window-size=1400,900',
      'about:blank',
    ], { stdio: 'ignore' });
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        target = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
      } catch {}
      if (!target) await sleep(250);
    }
    if (!target) throw Error(`${this.username}: no debugging port`);
    this.socket = await new Promise((ok, bad) => {
      const ws = new WebSocket(target);
      ws.addEventListener('open', () => ok(ws), { once: true });
      ws.addEventListener('error', bad, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.waiting.has(message.id)) {
        const { resolve, reject, method } = this.waiting.get(message.id);
        this.waiting.delete(message.id);
        if (message.error) reject(Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const d = message.params.exceptionDetails;
        this.complaints.push(d.exception?.description ?? d.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.complaints.push('console.error: ' + message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "try { localStorage.setItem('scryproof.walkthrough.v1', 'done'); } catch {}",
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw Error(`${this.username}: ${result.exceptionDetails.exception?.description ?? 'evaluation failed'}`);
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
    await this.evaluate(`localStorage.setItem('scryproof.walkthrough.v1', 'done')`);
    const status = await this.evaluate(`fetch('/api/auth/login', { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '${this.username}', password: '${PASSWORD}' }) }).then((r) => r.status)`);
    if (status !== 200) throw Error(`${this.username}: sign-in ${status}`);
    await this.send('Page.navigate', { url: WEB });
    if (!(await this.until(`Boolean(window.__voice) && document.querySelector('.channel-name') !== null`)))
      throw Error(`${this.username}: app never loaded`);
    this.userId = await this.evaluate(`fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()).then((b) => b.user.id)`);
  }

  async join() {
    const ok = await this.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('button, [role="button"], .channel')).find((el) => el.textContent.includes('\\u266B'));
      if (!row) return false; row.click(); return true; })()`);
    if (!ok) throw Error(`${this.username}: no voice channel`);
  }

  clickButton(label) {
    return this.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((el) => el.textContent.trim() === ${JSON.stringify(label)} || el.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!button) return false; button.click(); return true; })()`);
  }

  clickWatch(text) {
    return this.evaluate(`(() => {
      const card = Array.from(document.querySelectorAll('.call-tile')).find((tile) => tile.textContent.includes(${JSON.stringify(text)}) && Array.from(tile.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Watch'));
      const button = card && Array.from(card.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Watch');
      if (!button) return false; button.click(); return true; })()`);
  }

  async shoot(name, width) {
    if (!SHOTS) return;
    if (width) await this.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(800);
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    const path = join(SHOTS, `${name}.png`);
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log(`screenshot: ${path}`);
    if (width) await this.send('Emulation.clearDeviceMetricsOverride');
  }

  async close() {
    try { this.socket?.close(); } catch {}
    try { this.process?.kill(); } catch {}
    await sleep(300);
    try { rmSync(this.profile, { recursive: true, force: true }); } catch {}
  }
}

const peopleReady = (n) => `(() => { const s = window.__voice.getSnapshot(); return s.phase === 'connected' && s.encrypted && s.people.length === ${n} && s.people.every((p) => p.state === 'secured'); })()`;

async function call(names) {
  const people = names.map((name, i) => new Person(name, 9461 + i));
  all.push(...people);
  await Promise.all(people.map((p) => p.open()));
  console.log('opened');
  await Promise.all(people.map((p) => p.signIn()));
  console.log('signed in');
  for (const p of people) await p.join();
  const ready = await Promise.all(people.map((p) => p.until(peopleReady(people.length - 1), 60_000)));
  check(`${names.join(', ')} connect encrypted and secured`, ready.every(Boolean));
  if (!ready.every(Boolean)) throw Error('call never formed');
  return people;
}

const TOPIC = 'scryproof.stream-chat.v1';

async function phase0() {
  const [wes, alex, mara] = await call(['wes', 'alex', 'mara']);
  const listen = `(() => { window.__got = []; window.__voice.room.on('dataReceived', (payload, participant, kind, topic, encryptionType) => {
    if (topic === '${TOPIC}') window.__got.push({ from: participant?.identity, encryptionType, text: new TextDecoder().decode(payload) }); }); return true; })()`;
  await alex.evaluate(listen);
  await mara.evaluate(listen);
  check('the sender room reports E2EE on', await wes.evaluate(`window.__voice.room.isE2EEEnabled === true`));
  const sendOne = (text) => wes.evaluate(`window.__voice.room.localParticipant.publishData(new TextEncoder().encode(${JSON.stringify(JSON.stringify({ stream: 'TR_proof', id: '0123456789abcdef', text: 'x' }))}.replace('"x"', ${JSON.stringify(JSON.stringify(text))})), { reliable: true, topic: '${TOPIC}' }).then(() => true)`);
  await sendOne('first');
  const first = await alex.until(`window.__got.find((m) => m.text.includes('first'))`, 10_000);
  // livekit-client 2.22.3 seals the packet in transit but reports it as NONE (0): its sender never fills the
  // field. That is why comments carry their own seal (stream-chat.ts). If this ever reads 1, the SDK fixed it.
  check('alex receives the packet, and the SDK reports it as NONE (0), the finding behind our own seal', first?.encryptionType === 0, JSON.stringify(first));
  await mara.until(`window.__got.some((m) => m.text.includes('first'))`, 5000);
  await mara.evaluate(`window.__voice.debugCorruptKeyFor('${wes.userId}')`);
  await sleep(500);
  await sendOne('second');
  const second = await alex.until(`window.__got.find((m) => m.text.includes('second'))`, 10_000);
  await sleep(3000);
  const maraGot = await mara.evaluate(`window.__got.map((m) => m.text.includes('second') ? 'second' : 'first')`);
  check('alex (right key) gets the second packet', second !== null && second !== undefined, JSON.stringify(second));
  check('mara (wrong key for wes) never sees the second packet in DataReceived', !maraGot.includes('second'), JSON.stringify(maraGot));
  return [wes, alex, mara];
}

const screenStream = (owner) => `window.__voice.getSnapshot().videos.find((v) => v.userId === '${owner}' && v.source === 'screen')?.stream ?? null`;
const commentsOn = (sid) => `(window.__voice.getSnapshot().comments['${sid}'] ?? []).map((c) => c.userId.slice(0, 4) + ':' + c.text)`;

async function shareAndWatch(sharer, watchers) {
  check(`${sharer.username} presses Share your screen`, await sharer.clickButton('Share your screen'));
  const sid = await sharer.until(screenStream(sharer.userId), 20_000);
  for (const w of watchers) {
    await w.until(screenStream(sharer.userId), 15_000);
    check(`${w.username} presses Watch`, await w.clickWatch('Sharing their screen'));
    await w.until(`window.__voice.getSnapshot().videos.some((v) => v.userId === '${sharer.userId}' && v.source === 'screen' && v.state === 'playing')`, 20_000);
  }
  return sid;
}

async function phase2() {
  const [wes, alex, mara] = await call(['wes', 'alex', 'mara']);
  const sid = await shareAndWatch(wes, [alex]);
  check('the screen has a publication id', Boolean(sid), String(sid));
  const sent = await alex.evaluate(`window.__voice.sendComment('${sid}', '  hello' + String.fromCharCode(10) + ' from alex ')`);
  const wesSees = await wes.until(`(() => { const c = ${commentsOn(sid)}; return c.length ? c : null; })()`, 10_000);
  check('a comment sent from the console API lands in the sharer snapshot', sent === true && JSON.stringify(wesSees).includes('hello from alex'), JSON.stringify(wesSees));
  check('the sender sees its own comment', JSON.stringify(await alex.evaluate(commentsOn(sid))).includes('hello from alex'));
  const maraSees = await mara.until(`(() => { const c = ${commentsOn(sid)}; return c.length ? c : null; })()`, 10_000);
  check('mara (in the call, not watching) also holds it; the strip decides who sees it', Boolean(maraSees), JSON.stringify(maraSees));
  check('too soon: a second comment inside a second is refused', (await alex.evaluate(`window.__voice.sendComment('${sid}', 'again')`)) === false);
  // A plain packet on the topic (what the media server could make up) never shows.
  await alex.evaluate(`window.__voice.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ stream: '${sid}', id: '00000000000000ff', text: 'forged plain' })), { reliable: true, topic: '${TOPIC}' })`);
  // The wrong key: mara cannot open wes's comments.
  await mara.evaluate(`window.__voice.debugCorruptKeyFor('${wes.userId}')`);
  await sleep(1200);
  check('wes comments on his own share', (await wes.evaluate(`window.__voice.sendComment('${sid}', 'from the sharer')`)) === true);
  await alex.until(`JSON.stringify(${commentsOn(sid)}).includes('from the sharer')`, 10_000);
  await sleep(2500);
  const alexList = await alex.evaluate(commentsOn(sid));
  const maraList = await mara.evaluate(commentsOn(sid));
  const wesList = await wes.evaluate(commentsOn(sid));
  check('alex gets the sharer comment', JSON.stringify(alexList).includes('from the sharer'), JSON.stringify(alexList));
  check('mara, holding the wrong key for wes, never shows it', !JSON.stringify(maraList).includes('from the sharer'), JSON.stringify(maraList));
  check('a plain unsealed packet is shown to nobody', ![alexList, maraList, wesList].some((l) => JSON.stringify(l).includes('forged')), JSON.stringify(wesList));
  check('comments are not written to localStorage', ![wes, alex].length || !(await alex.evaluate(`JSON.stringify(localStorage).includes('hello from alex')`)));
  // Song requests (Wes 10-22: "a song request queue"): a request lands in the
  // comments and in the queue; only the sharer can take it off.
  await sleep(1200);
  check('alex requests a song', (await alex.evaluate(`window.__voice.sendComment('${sid}', 'play freebird', 'request')`)) === true);
  const queued = await wes.until(`(() => { const q = window.__voice.getSnapshot().queues[${JSON.stringify(sid)}]; return q && q.length ? q : null; })()`, 10_000);
  check('the sharer sees it in the queue, tagged as a request', Boolean(queued) && queued[0].text === 'play freebird' && queued[0].request === true, JSON.stringify(queued));
  const key = queued?.[0]?.key ?? '';
  await sleep(1200);
  check('alex, not the sharer, cannot mark it played', (await alex.evaluate(`window.__voice.sendComment('${sid}', ${JSON.stringify(key)}, 'played')`)) === false);
  check('the sharer marks it played', (await wes.evaluate(`window.__voice.sendComment('${sid}', ${JSON.stringify(key)}, 'played')`)) === true);
  const cleared = await alex.until(`(window.__voice.getSnapshot().queues[${JSON.stringify(sid)}] ?? []).length === 0 ? true : null`, 10_000);
  check('the queue empties for the watcher once played', Boolean(cleared));
  check('the request stays in the comments', JSON.stringify(await alex.evaluate(commentsOn(sid))).includes('play freebird'));
  check('wes stops sharing', await wes.clickButton('Stop sharing') || await wes.evaluate(`window.__voice.stopScreenShare?.().then(() => true)`));
  const emptied = await Promise.all([wes, alex, mara].map((p) => p.until(`Object.keys(window.__voice.getSnapshot().comments).length === 0`, 10_000)));
  check('stopping the share empties every snapshot', emptied.every(Boolean));
  return [wes, alex, mara];
}

/** Type into a strip and press Send, the way a person would. `doc` is an expression for the document. */
const typeIn = (person, scope, text, doc = 'document') => person.evaluate(`(() => {
  const strip = ${doc}.querySelector(${JSON.stringify(scope)});
  const input = strip?.querySelector('.stream-chat-input');
  if (!input) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(text)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`).then(async (typed) => {
  if (typed !== 'typed') return typed;
  await sleep(150);
  return person.evaluate(`(() => { const b = ${doc}.querySelector(${JSON.stringify(scope)}).querySelector('.stream-chat-form button[type=submit]'); if (b.disabled) return 'disabled'; b.click(); return 'sent'; })()`);
});
const linesIn = (person, scope, doc = 'document') => person.evaluate(`Array.from(${doc}.querySelectorAll(${JSON.stringify(scope + ' .stream-chat-words')})).map((el) => el.textContent)`);

async function phase3() {
  const [wes, alex] = await call(['wes', 'alex']);
  const sid = await shareAndWatch(wes, [alex]);
  // The column starts closed (Wes 10-19: "kinda in the way"); a Comments button beside the screen opens it.
  const closed = await alex.until(`document.querySelector('.voice-focus.with-chat .stream-chat-reopen') ? true : null`, 10_000);
  check('the comments start closed, as a Comments button beside the screen', Boolean(closed) && !(await alex.evaluate(`Boolean(document.querySelector('.stream-chat.side'))`)));
  await alex.shoot('stream-chat-closed');
  check('alex presses Comments', await alex.evaluate(`(() => { const b = document.querySelector('.stream-chat-reopen'); if (!b) return false; b.click(); return true; })()`));
  const side = await alex.until(`document.querySelector('.voice-focus.with-chat .stream-chat.side') ? true : null`, 10_000);
  check('the watcher sees the strip beside the big screen', Boolean(side));
  check('the strip says Encrypted', await alex.evaluate(`document.querySelector('.stream-chat.side .stream-chat-lock')?.textContent.trim() === 'Encrypted'`));
  check('the empty strip says comments disappear', await alex.evaluate(`document.querySelector('.stream-chat.side')?.textContent.includes('Comments disappear when the stream ends.')`));
  const own = await wes.until(`document.querySelector('.stream-chat-own .stream-chat.list') ? true : null`, 10_000);
  check('the sharer sees a strip for their own screen without making it big', Boolean(own));
  check('alex types and presses Send', (await typeIn(alex, '.stream-chat.side', 'that boss is huge')) === 'sent');
  const wesGot = await wes.until(`(() => { const t = Array.from(document.querySelectorAll('.stream-chat-own .stream-chat-words')).map((el) => el.textContent); return t.length ? t : null; })()`, 10_000);
  check('the sharer sees it', JSON.stringify(wesGot).includes('that boss is huge'), JSON.stringify(wesGot));
  await sleep(300);
  check('wes answers from his strip', (await typeIn(wes, '.stream-chat-own', 'wait for the second phase')) === 'sent');
  const alexGot = await alex.until(`(() => { const t = Array.from(document.querySelectorAll('.stream-chat.side .stream-chat-words')).map((el) => el.textContent); return t.length > 1 ? t : null; })()`, 10_000);
  check('the watcher sees both, newest at the bottom', JSON.stringify(alexGot) === JSON.stringify(alexGot && [alexGot[0], alexGot[1]]) && String(alexGot?.at(-1)).includes('wait for the second phase'), JSON.stringify(alexGot));
  await sleep(1100);
  check('alex sends a third', (await typeIn(alex, '.stream-chat.side', 'gg')) === 'sent');
  check('Send rests right after sending', await alex.evaluate(`document.querySelector('.stream-chat.side .stream-chat-form button[type=submit]').disabled`));
  await wes.until(`document.querySelectorAll('.stream-chat-own .stream-chat-line').length === 3`, 10_000);
  // A song request from the strip: the note button, then the words.
  await sleep(1500);
  check('alex presses the note and asks for a song', await alex.evaluate(`(() => { const b = document.querySelector('.stream-chat.side .stream-chat-ask'); if (!b) return false; b.click(); return true; })()`) && (await typeIn(alex, '.stream-chat.side', 'Freebird, the long one')) === 'sent');
  const queueShown = await wes.until(`document.querySelector('.stream-chat-own .stream-chat-queue') ? true : null`, 10_000);
  check('the sharer sees a Song requests list with a Played button', Boolean(queueShown) && (await wes.evaluate(`document.querySelector('.stream-chat-own .stream-chat-queue')?.textContent.includes('Played')`)));
  check('the watcher sees the list without a Played button', await alex.evaluate(`(() => { const q = document.querySelector('.stream-chat.side .stream-chat-queue'); return Boolean(q) && !q.textContent.includes('Played'); })()`));
  await alex.shoot('stream-chat-screen');
  await wes.shoot('stream-chat-sharer');
  await sleep(1500);
  check('wes presses Played', await wes.evaluate(`(() => { const b = document.querySelector('.stream-chat-own .stream-chat-queue button'); if (!b) return false; b.click(); return true; })()`));
  check('the list goes for both', Boolean(await alex.until(`document.querySelector('.stream-chat.side .stream-chat-queue') ? null : true`, 10_000)));
  await wes.until(`document.querySelectorAll('.stream-chat-own .stream-chat-line').length === 4`, 10_000);
  // Pop out: the same strip in the window of its own.
  check('alex presses Pop out', await alex.clickButton('Pop out'));
  const popDoc = `window.open('', 'scryproof-stream-${wes.userId}-screen').document`;
  const popped = await alex.until(`${popDoc}.querySelectorAll('.stream-chat.side .stream-chat-line').length === 4`, 10_000);
  check('the popped-out screen shows the same comments', Boolean(popped), JSON.stringify(await linesIn(alex, '.stream-chat.side', popDoc).catch((e) => String(e))));
  check('the popped-out strip is styled (copied stylesheet)', await alex.evaluate(`getComputedStyle(${popDoc}.querySelector('.stream-chat.side')).width === '260px'`));
  await sleep(1100);
  check('alex comments from the pop-out window', (await typeIn(alex, '.stream-chat.side', 'from the other monitor', popDoc)) === 'sent');
  const fromPop = await wes.until(`Array.from(document.querySelectorAll('.stream-chat-own .stream-chat-words')).some((el) => el.textContent.includes('from the other monitor'))`, 10_000);
  check('the sharer sees the comment sent from the pop-out', Boolean(fromPop));
  if (SHOTS) {
    // A picture of the pop-out window: it is its own page target.
    const targets = await (await fetch(`http://127.0.0.1:${alex.port}/json/list`)).json();
    const target = targets.find((t) => t.type === 'page' && t.url === 'about:blank');
    if (target) {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
      const shot = await new Promise((ok) => {
        ws.addEventListener('message', (e) => { const m = JSON.parse(String(e.data)); if (m.id === 1) ok(m.result); });
        ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
      });
      writeFileSync(join(SHOTS, 'stream-chat-popout.png'), Buffer.from(shot.data, 'base64'));
      console.log(`screenshot: ${join(SHOTS, 'stream-chat-popout.png')}`);
      ws.close();
    }
  }
  await alex.shoot('stream-chat-mobile', 390);
  check('wes stops sharing', await wes.clickButton('Stop sharing'));
  const gone = await Promise.all([
    alex.until(`!document.querySelector('.stream-chat') && Object.keys(window.__voice.getSnapshot().comments).length === 0`, 10_000),
    wes.until(`!document.querySelector('.stream-chat') && Object.keys(window.__voice.getSnapshot().comments).length === 0`, 10_000),
  ]);
  check('the strip is gone for both, and the snapshot is empty', gone.every(Boolean));
  await sleep(1000);
  const again = await shareAndWatch(wes, [alex]);
  check('a restarted share is a new stream', again && again !== sid, `${sid} then ${again}`);
  const fresh = await alex.until(`document.querySelector('.stream-chat.side') ? 'lines ' + document.querySelectorAll('.stream-chat.side .stream-chat-line').length : null`, 10_000);
  check('and its strip starts empty: nothing old comes back', fresh === 'lines 0', String(fresh) + ' ' + JSON.stringify(await alex.evaluate(`({ focus: Boolean(document.querySelector('.voice-focus')), withChat: Boolean(document.querySelector('.voice-focus.with-chat')), strips: document.querySelectorAll('.stream-chat').length, reopen: document.querySelectorAll('.stream-chat-reopen').length, videos: window.__voice.getSnapshot().videos.map((v) => v.source + ':' + v.state), width: innerWidth })`)));
  return [wes, alex];
}

async function phase4() {
  const [wes, alex] = await call(['wes', 'alex']);
  const openMixer = (p) => p.evaluate(`(() => { if (document.querySelector('.call-mixer')) return true; const b = document.querySelector('[aria-label="Open call mixer"]'); if (!b) return false; b.click(); return true; })()`);
  check('wes opens the mixer', await openMixer(wes));
  await wes.until(`Boolean(document.querySelector('.call-mixer'))`, 5000);
  check('wes presses Share music', await wes.clickButton('Share music'));
  const sharing = await wes.until(`window.__voice.getSnapshot().musicSharing`, 20_000);
  check('the music share is up (fake capture: the content is not what is tested)', Boolean(sharing), JSON.stringify(await wes.evaluate(`({ error: window.__voice.getSnapshot().musicError })`)));
  const sid = await alex.until(`window.__voice.getSnapshot().sharedAudio.find((s) => s.kind === 'music')?.sid ?? null`, 15_000);
  check('alex opens the mixer', await openMixer(alex));
  await alex.until(`Boolean(document.querySelector('.call-mixer'))`, 5000);
  check('no strip before opting in', await alex.evaluate(`!document.querySelector('.mixer-source .stream-chat')`));
  check('alex presses Listen', await alex.evaluate(`(() => { const b = Array.from(document.querySelectorAll('.mixer-listen')).find((el) => /^Listen to .* music$/.test(el.getAttribute('aria-label'))); if (!b) return false; b.click(); return true; })()`));
  const strip = await alex.until(`Boolean(document.querySelector('.mixer-source .stream-chat.list'))`, 10_000);
  check('the listener gets the strip under the music source', Boolean(strip));
  check('the sharer has the strip on the Music together card', Boolean(await wes.until(`Boolean(document.querySelector('.mixer-music .stream-chat.list'))`, 10_000)));
  check('alex comments on the music', (await typeIn(alex, '.mixer-source .stream-chat.list', 'play the next one louder')) === 'sent');
  const got = await wes.until(`(() => { const t = Array.from(document.querySelectorAll('.mixer-music .stream-chat-words')).map((el) => el.textContent); return t.length ? t : null; })()`, 10_000);
  check('the sharer sees it on the card', JSON.stringify(got).includes('play the next one louder'), JSON.stringify(got));
  await sleep(300);
  check('wes answers', (await typeIn(wes, '.mixer-music .stream-chat.list', 'turning it up')) === 'sent');
  const back = await alex.until(`Array.from(document.querySelectorAll('.mixer-source .stream-chat-words')).some((el) => el.textContent.includes('turning it up'))`, 10_000);
  check('the listener sees the answer', Boolean(back));
  await alex.evaluate(`document.querySelector('.mixer-source .stream-chat')?.scrollIntoView({ block: 'center' })`);
  await alex.shoot('stream-chat-music');
  await wes.evaluate(`document.querySelector('.mixer-music .stream-chat')?.scrollIntoView({ block: 'center' })`);
  await wes.shoot('stream-chat-music-sharer');
  check('wes stops the music', await wes.clickButton('Stop sharing music'));
  const gone = await Promise.all([alex, wes].map((p) => p.until(`!document.querySelector('.stream-chat') && Object.keys(window.__voice.getSnapshot().comments).length === 0`, 10_000)));
  check('stopping the music empties both strips', gone.every(Boolean));
  return [wes, alex];
}

const phases = { 0: () => phase0(), 2: () => phase2(), 3: () => phase3(), 4: () => phase4() };
let people = [];
const all = [];
try {
  const which = process.argv[2] ?? '0';
  people = await phases[which]();
  // The wrong-key steps make the SDK complain about frames it cannot open; that is the point of them.
  const complaints = people.flatMap((p) => p.complaints.filter((c) => !/Decryption failed|DataCryptor decryption failed/.test(c)).map((c) => `${p.username}: ${c}`));
  check('no uncaught exceptions or console errors', complaints.length === 0, complaints.join('\n      '));
} catch (error) {
  failures += 1;
  console.log(`FAIL  ${error.stack ?? error}`);
} finally {
  for (const p of all) {
    await p.evaluate(`document.querySelector('[aria-label="Leave the call"]')?.click()`).catch(() => {});
  }
  await sleep(500);
  await Promise.all(all.map((p) => p.close()));
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
}

/**
 * The soundboard clipper, end to end in a real browser: make a minute-long
 * "song", cut 12.5 seconds out of the middle with the browser's own encoder,
 * upload it, fetch it back and decode it. Then check the server refuses a
 * 20-second cut, and tidy up.
 *
 *   node scripts/sound-clip-check.mjs
 *
 * Needs the API and the web dev server running on a seeded database, like
 * `shot.mjs`. Signs in as wes, who owns the seed server.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const password = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const debugPort = Number(process.env.DEBUG_PORT ?? 9353);
const profile = mkdtempSync(join(tmpdir(), 'scryproof-clip-'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = spawn(
  chrome,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);

let failed = false;
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
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
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
  const run = async (expression) => {
    const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? 'page threw');
    return answer.result.value;
  };

  await send('Page.navigate', { url: webUrl });
  await sleep(1500);
  const status = await run(
    `fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'wes', password: ${JSON.stringify(password)} }) }).then((r) => r.status)`,
  );
  if (status !== 200) throw new Error(`sign in answered ${status}`);

  const result = await run(`(async () => {
    const { readSource, cutClip, canCut } = await import('/src/lib/sound-cut.ts');

    // A minute of something song-like: a note every half second, stereo, 44.1 kHz.
    const rate = 44100, seconds = 60, frames = rate * seconds;
    const wav = new DataView(new ArrayBuffer(44 + frames * 4));
    const text = (at, value) => [...value].forEach((c, i) => wav.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); wav.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE'); text(12, 'fmt ');
    wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
    wav.setUint32(24, rate, true); wav.setUint32(28, rate * 4, true); wav.setUint16(32, 4, true);
    wav.setUint16(34, 16, true); text(36, 'data'); wav.setUint32(40, frames * 4, true);
    const notes = [220, 262, 330, 392, 440, 392, 330, 262];
    for (let i = 0; i < frames; i += 1) {
      const t = i / rate, beat = Math.floor(t * 2), inBeat = t * 2 - beat;
      const value = Math.sin(2 * Math.PI * notes[beat % notes.length] * t) * Math.exp(-inBeat * 3) * 0.6;
      wav.setInt16(44 + i * 4, value * 32767, true);
      wav.setInt16(46 + i * 4, value * 0.8 * 32767, true);
    }
    const song = new File([wav.buffer], 'song.wav', { type: 'audio/wav' });

    const cuttable = await canCut();
    const source = await readSource(song);
    const clip = await cutClip(source, { start: 20, end: 32.5 }, 'Check clip');

    return { cuttable, songSeconds: source.duration, clipBytes: clip.size, clipType: clip.type };
  })()`);
  console.log('cut:', result);
  if (!result.cuttable) throw new Error('this Chrome says it cannot encode Opus');
  if (Math.abs(result.songSeconds - 60) > 0.1) throw new Error(`the song decoded as ${result.songSeconds} s`);

  // Any server left by a run that stopped halfway goes first. The server list
  // arrives in the gateway's first message.
  const leftover = await run(`(async () => {
    const { gatewayUrl } = await import('/src/lib/desktop.ts');
    const ready = await new Promise((resolve, reject) => {
      const socket = new WebSocket(gatewayUrl('/gateway'));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.t === 'ready') { socket.close(); resolve(message.d); }
      };
      socket.onerror = () => reject(new Error('gateway'));
    });
    const stale = ready.servers.filter((server) => server.name === 'Clip check');
    for (const server of stale) await fetch('/api/servers/' + server.id, { method: 'DELETE', credentials: 'include' });
    return stale.length;
  })()`);
  if (leftover) console.log(`removed ${leftover} server(s) left by an earlier run`);

  // A server of its own, removed at the end, so the seed board is left as it was.
  const serverId = await run(
    `fetch('/api/servers', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Clip check' }) }).then((r) => r.json()).then((body) => body.server.id)`,
  );
  const removeServer = () =>
    run(`fetch('/api/servers/${serverId}', { method: 'DELETE', credentials: 'include' }).then((r) => r.status)`);

  const round = await run(`(async () => {
    const { readSource, cutClip } = await import('/src/lib/sound-cut.ts');
    const { api } = await import('/src/lib/api.ts');
    const { audioContext } = await import('/src/lib/voice-audio.ts');
    const rate = 48000, frames = rate * 40;
    const buffer = new AudioBuffer({ length: frames, numberOfChannels: 2, sampleRate: rate });
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < frames; i += 1) data[i] = Math.sin(i / 20) * 0.4;
    }
    const clip = await cutClip(buffer, { start: 20, end: 32.5 }, 'Check clip');
    const raw = new Uint8Array(await clip.arrayBuffer());
    const here = (await audioContext().decodeAudioData(raw.slice().buffer)).duration;
    const sound = await api.sounds.add(${JSON.stringify(serverId)}, 'Check clip', clip, 140);
    const back = new Uint8Array(await (await fetch(sound.url, { credentials: 'include' })).arrayBuffer());
    const same = back.length === raw.length && back.every((value, index) => value === raw[index]);
    const decoded = await audioContext().decodeAudioData(back.slice().buffer);

    let refused = null;
    try {
      await api.sounds.add(${JSON.stringify(serverId)}, 'Too long', await cutClip(buffer, { start: 0, end: 20 }, 'Too long'), 100);
    } catch (problem) { refused = problem.code ?? String(problem); }

    return { here, same, volume: sound.volume, bytes: sound.bytes, decodedSeconds: decoded.duration, refused };
  })()`).finally(() => removeServer());
  console.log('round trip:', round);
  if (!round.same) throw new Error('the server handed back different bytes from the ones uploaded');
  if (round.volume !== 140) throw new Error('the volume did not stick');
  if (Math.abs(round.decodedSeconds - 12.5) > 0.05) throw new Error(`the clip decoded as ${round.decodedSeconds} s, not 12.5`);
  if (round.refused !== 'sound_too_long') throw new Error(`a 20 s clip was not refused as too long (${round.refused})`);
  console.log('sound clip check: all good');
  socket.close();
} catch (problem) {
  failed = true;
  console.error('sound clip check FAILED:', problem.message);
} finally {
  browser.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
process.exit(failed ? 1 : 0);

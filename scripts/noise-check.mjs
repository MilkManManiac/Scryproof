/**
 * Prove, in a real Chromium, that Strong noise suppression runs under the
 * site's own security policy and does something, and write the before and
 * after as WAV files a person can listen to.
 *
 *   npm run build --workspace web
 *   node scripts/noise-check.mjs [clips-dir] [out-dir]
 *
 * `clips-dir` holds raw 48 kHz mono float32 files (`*.f32`), for instance
 * cut from a recording of a call with
 *   ffmpeg -ss 18.3 -t 2.1 -i call.mkv -ac 1 -ar 48000 -f f32le knock.f32
 * Without one, it makes its own white noise and only checks that the model
 * ran. Made-up sounds are no test of how well: the model was trained on real
 * rooms, and it treats flat hiss unevenly from one run to the next, while
 * pure tones look like a held vowel to it. The claims are checked on real
 * recordings. The knock in the 2026-09-25 recording is a thump and then two
 * seconds of low tones beating ten times a second; the model takes the ring
 * down by about 50 dB after the first quarter second and leaves speech within
 * half a decibel. Name clips `knock.f32` and `speech.f32` to check those.
 *
 * Two servers, both serving the built client. One sends the policy from the
 * nginx template, as the box does: the model has to load and run. The other
 * sends that policy without 'wasm-unsafe-eval', as the desktop shell before
 * 0.5.4 does: the model has to refuse to start, which is what makes the
 * settings fall back to the browser's suppression.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'web', 'dist');
const [clipsDir, outDir = join(tmpdir(), 'scryproof-noise-check')] = process.argv.slice(2);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => existsSync(path));

const template = readFileSync(join(ROOT, 'infra', 'custom', 'templates', 'site-nginx.conf.j2'), 'utf8');
const POLICY = template.match(/Content-Security-Policy "([^"]+)"/)?.[1];
if (!POLICY || !POLICY.includes("'wasm-unsafe-eval'")) throw new Error('The nginx policy does not allow the noise model.');
const OLD_POLICY = POLICY.replace(" 'wasm-unsafe-eval'", '');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.f32': 'application/octet-stream' };

/* ---------------------------------- clips ---------------------------------- */

const RATE = 48000;

function made() {
  const noise = new Float32Array(RATE * 2);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (Math.random() * 2 - 1) * 0.005;
  return { noise };
}

const clips = {};
if (clipsDir) {
  for (const name of readdirSync(clipsDir).filter((file) => file.endsWith('.f32'))) {
    const bytes = readFileSync(join(clipsDir, name));
    clips[basename(name, '.f32')] = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }
} else {
  Object.assign(clips, made());
}

/* --------------------------------- servers --------------------------------- */

function serve(policy) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const headers = { 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff' };
    if (path.startsWith('/clips/')) {
      const clip = clips[basename(path, '.f32')];
      if (!clip) return response.writeHead(404, headers).end();
      return response.writeHead(200, { ...headers, 'Content-Type': TYPES['.f32'] }).end(Buffer.from(clip.buffer, clip.byteOffset, clip.byteLength));
    }
    const wanted = normalize(join(DIST, path));
    const file = wanted.startsWith(DIST + sep) && extname(wanted) && existsSync(wanted) ? wanted : join(DIST, 'index.html');
    response.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/* --------------------------------- browser --------------------------------- */

async function openPage(url) {
  const profile = mkdtempSync(join(tmpdir(), 'scryproof-noise-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--autoplay-policy=no-user-gesture-required',
    url,
  ]);
  let target;
  for (let tries = 0; tries < 100 && !target; tries += 1) {
    await new Promise((wait) => setTimeout(wait, 100));
    target = await fetch(`http://127.0.0.1:${port}/json`)
      .then((reply) => reply.json())
      .then((list) => list.find((entry) => entry.type === 'page'))
      .catch(() => undefined);
  }
  if (!target) throw new Error('Chromium did not start.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((open) => socket.addEventListener('open', open, { once: true }));
  let id = 0;
  const waiting = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    waiting.get(message.id)?.(message);
  });
  const evaluate = (expression) =>
    new Promise((done, fail) => {
      id += 1;
      waiting.set(id, (message) => {
        const result = message.result;
        if (message.error || result?.exceptionDetails) fail(new Error(JSON.stringify(message.error ?? result.exceptionDetails.exception?.description)));
        else done(result.result.value);
      });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  await new Promise((wait) => setTimeout(wait, 1500));
  return {
    evaluate,
    close() {
      socket.close();
      chrome.kill();
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1000);
    },
  };
}

/**
 * Runs in the page: every clip through the model in real time, as a call
 * would, at 48 kHz. Real time and not an offline render because the model
 * loads a moment after its node is made and is silent until then; an offline
 * render races past that moment and "suppresses" everything, speech too.
 * The model gets half a second of silence to wake before each clip.
 */
const RUN = (model, names) => `(async () => {
  const { openSuppressor } = await import(${JSON.stringify(model)});
  const context = new AudioContext({ sampleRate: 48000 });
  await context.resume();
  const out = {};
  for (const name of ${JSON.stringify(names)}) {
    const input = new Float32Array(await (await fetch('/clips/' + name + '.f32')).arrayBuffer());
    const suppressor = await openSuppressor(context);
    await new Promise((wait) => setTimeout(wait, 500));
    const buffer = context.createBuffer(1, input.length, 48000);
    buffer.copyToChannel(input, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const taken = [];
    const tap = context.createScriptProcessor(1024, 1, 1);
    tap.onaudioprocess = (event) => taken.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    const hush = context.createGain();
    hush.gain.value = 0;
    source.connect(suppressor.input);
    suppressor.output.connect(tap).connect(hush).connect(context.destination);
    const started = new Promise((done) => (source.onended = done));
    source.start();
    await started;
    await new Promise((wait) => setTimeout(wait, 300));
    source.disconnect();
    tap.disconnect();
    suppressor.close();
    const all = new Float32Array(taken.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of taken) { all.set(part, at); at += part.length; }
    // The clip, and the last few milliseconds the model was still letting out.
    // As base64 of the raw floats: an array of numbers this long is tens of
    // megabytes of text and stalls the debugging connection.
    const bytes = new Uint8Array(all.buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out[name] = btoa(text);
  }
  await context.close();
  return out;
})()`;

const PROBE = `(() => { try { new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])); return true; } catch { return false; } })()`;

/* ---------------------------------- checks --------------------------------- */

const rmsDb = (samples) => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-12);
};

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), index * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

let failed = 0;
const check = (ok, line) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`);
  if (!ok) failed += 1;
};

if (!CHROME) throw new Error('No Chromium found.');
const model = readdirSync(join(DIST, 'assets')).find((file) => /^noise-model-.*\.js$/.test(file));
if (!model) throw new Error('Build the web client first: npm run build --workspace web');

const current = await serve(POLICY);
const older = await serve(OLD_POLICY);
const names = Object.keys(clips);

try {
  const page = await openPage(`http://127.0.0.1:${current.address().port}/`);
  check(await page.evaluate(PROBE), "the site's policy lets the page compile WebAssembly");
  const encoded = await page.evaluate(RUN(`/assets/${model}`, names));
  const results = Object.fromEntries(
    Object.entries(encoded).map(([name, text]) => {
      const bytes = Buffer.from(text, 'base64');
      return [name, new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)];
    }),
  );
  page.close();

  mkdirSync(outDir, { recursive: true });
  for (const name of names) {
    const before = rmsDb(clips[name]);
    const after = rmsDb(results[name]);
    writeFileSync(join(outDir, `${name}-before.wav`), wav(clips[name]));
    writeFileSync(join(outDir, `${name}-after.wav`), wav(results[name]));
    console.log(`      ${name.padEnd(10)} before ${before.toFixed(1)} dB   after ${after.toFixed(1)} dB   (${(after - before).toFixed(1)} dB)`);
    check(results[name].length >= clips[name].length, `${name}: came back whole`);
  }
  // The model needs a moment to decide something is not a voice: the thump
  // itself gets through, the ring after it does not. So these measure from
  // half a second in.
  const settled = (samples) => rmsDb(samples.subarray(RATE / 2, RATE * 2 - RATE / 10));
  if (!clipsDir) {
    const changed = results.noise.some((sample, index) => Math.abs(sample - (clips.noise[index] ?? 0)) > 1e-4);
    check(changed, 'the model ran: what came out is not what went in');
  }
  if (clips.knock) check(settled(results.knock) - settled(clips.knock) < -30, "the ring after a knock is at least 30 dB quieter");
  if (clips.speech) check(rmsDb(results.speech) - rmsDb(clips.speech) > -6, 'speech comes through: within 6 dB of what went in');
  console.log(`      before and after written to ${outDir}`);

  const old = await openPage(`http://127.0.0.1:${older.address().port}/`);
  check((await old.evaluate(PROBE)) === false, 'under the old policy the page cannot compile WebAssembly (so the app falls back)');
  const refused = await old
    .evaluate(RUN(`/assets/${model}`, names.slice(0, 1)))
    .then(() => false)
    .catch(() => true);
  check(refused, 'under the old policy the model refuses to start instead of half-running');
  old.close();
} finally {
  current.close();
  older.close();
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

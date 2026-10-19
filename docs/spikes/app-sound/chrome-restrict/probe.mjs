/**
 * Does a plain Chrome (a friend sharing from the browser, not the desktop app)
 * keep its own sound out of a whole-screen share with sound?
 *
 * The page plays a 900 Hz tone to the PC at gain 0.003 (silent in the room),
 * then shares the entire screen with system audio twice: once asking for
 * restrictOwnAudio, once not. Each time it measures 900 Hz in the captured
 * sound against the floor. If restrictOwnAudio works, the first share has no
 * 900 Hz and the second does. The call is the browser's own sound, so this is
 * the browser path of "the call is in everyone's shares".
 *
 *   node docs/spikes/app-sound/chrome-restrict/probe.mjs
 *
 * Chrome is driven over its debugging port; the share is picked by Chrome's
 * --auto-select-desktop-capture-source flag, and the click that user-activates
 * getDisplayMedia is a real mouse event sent through the protocol.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WebSocket } from 'ws';

const BROWSER = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => path && existsSync(path));
if (!BROWSER) throw new Error('No Chromium-based browser found. Set CHROME to one.');

const PAGE = `<!doctype html><title>restrict probe</title>
<button id="go" style="position:fixed;inset:0;font-size:40px">go</button>
<script>
window.result = null;
const context = new AudioContext({ sampleRate: 48000 });
const osc = context.createOscillator(); const gain = context.createGain();
osc.frequency.value = 900; gain.gain.value = 0.003; osc.connect(gain).connect(context.destination); osc.start();
const spectrum = async (track, ms) => {
  const analyser = context.createAnalyser(); analyser.fftSize = 2048;
  context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const bins = new Float32Array(analyser.frequencyBinCount); const sum = new Float64Array(bins.length); let n = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) { analyser.getFloatFrequencyData(bins); for (let i = 0; i < bins.length; i++) sum[i] += Number.isFinite(bins[i]) ? 10 ** (bins[i] / 10) : 0; n++; await new Promise((r) => setTimeout(r, 50)); }
  const binHz = 48000 / 2048;
  const db = Array.from(sum, (p) => (p > 0 ? 10 * Math.log10(p / n) : -200));
  const at = (hz) => { const b = Math.round(hz / binHz); return Math.max(...db.slice(b - 1, b + 2)); };
  const floor = db.map((d, b) => ({ d, hz: b * binHz })).filter(({ hz }) => hz > 200 && hz < 8000 && Math.abs(hz - 900) > 3 * binHz).map(({ d }) => d).sort((a, b) => a - b);
  return { tone: at(900), floor: floor[Math.floor(floor.length / 2)] };
};
document.getElementById('go').onclick = async () => {
  if (window.busy) return; window.busy = true;
  try {
    await context.resume();
    const restrict = window.result === null;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor' },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(restrict ? { restrictOwnAudio: true } : {}) },
      systemAudio: 'include',
    });
    const sound = stream.getAudioTracks()[0];
    const out = { restrict, surface: stream.getVideoTracks()[0]?.getSettings().displaySurface, deviceId: sound?.getSettings().deviceId ?? null, label: sound?.label ?? null };
    if (sound) Object.assign(out, await spectrum(sound, 3000));
    stream.getTracks().forEach((t) => t.stop());
    window.result = out;
  } catch (e) { window.result = { error: String(e) }; }
  window.busy = false;
};
</script>`;

const scratch = mkdtempSync(join(tmpdir(), 'scryproof-restrict-'));
const file = join(scratch, 'probe.html');
writeFileSync(file, PAGE);

const chrome = spawn(BROWSER, [
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream', '--auto-select-desktop-capture-source=creen',
  '--remote-debugging-port=9363', `--user-data-dir=${join(scratch, 'profile')}`, '--window-size=600,400', pathToFileURL(file).href,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
let next = 1;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = next++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i += 1) {
    try { target = (await (await fetch('http://127.0.0.1:9363/json')).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch {}
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('Chrome never opened the probe page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  ws.on('message', (raw) => { const m = JSON.parse(raw); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  await send('Runtime.enable');
  console.log(`browser: ${BROWSER}, ${(await send('Browser.getVersion')).product}`);

  for (let round = 0; round < 2; round += 1) {
    await evaluate('window.result = ' + (round === 0 ? 'null' : 'window.result || {}') + ', window.busy = false');
    if (round === 1) await evaluate("window.result = {}");
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 200, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 200, button: 'left', clickCount: 1 });
    let out = null;
    for (let i = 0; i < 80 && !out; i += 1) {
      await sleep(250);
      const r = await evaluate('JSON.stringify(window.result)');
      const parsed = r ? JSON.parse(r) : null;
      if (parsed && (parsed.error || 'tone' in parsed || parsed.deviceId !== undefined)) out = parsed;
    }
    if (!out) { console.log(`round ${round}: no answer in 20 s; busy ${await evaluate('window.busy')}, result ${await evaluate('JSON.stringify(window.result)')}`); continue; }
    if (out.error) { console.log(`round ${round} (restrictOwnAudio ${round === 0}): ${out.error}`); continue; }
    if (!('tone' in out)) { console.log(`restrictOwnAudio ${out.restrict}: surface ${out.surface}, NO AUDIO TRACK came back (${JSON.stringify(out)})`); continue; }
    const above = out.tone - out.floor;
    console.log(`restrictOwnAudio ${out.restrict}: surface ${out.surface}, audio device "${out.deviceId}" (${out.label}); Chrome's own 900 Hz is ${above.toFixed(1)} dB above the floor (${out.tone.toFixed(1)} vs ${out.floor.toFixed(1)}) -> ${above < 6 ? 'LEFT OUT' : 'IN THE SHARE'}`);
  }
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(500);
  try { rmSync(scratch, { recursive: true, force: true }); } catch {}
}

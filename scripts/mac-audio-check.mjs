/** Real encrypted Mac call: app/window, whole screen, music. See docs/SPEC-mac-audio.md.
 * Local API/web/LiveKit and bundled web/dist must be running/built. macOS permissions are manual.
 * SHARE_SOUND_SHOTS=docs/shots node scripts/mac-audio-check.mjs
 * --red-proof temporarily makes the development app include its own process tree, then restores it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';
import { pcmToneLevel } from './mac-audio-spectrum.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'desktop');
const electron = createRequire(join(desktop, 'package.json'))('electron');

const SERVER = process.env.SHARE_CHECK_SERVER ?? 'http://127.0.0.1:8787';
const WEB = process.env.SHARE_CHECK_WEB ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_PASSWORD ?? 'seed-passphrase-for-local-dev';
const SHOTS = process.env.SHARE_SOUND_SHOTS ?? '';
const CALL_HZ = Number(process.env.SHARE_CHECK_CALL_HZ ?? '2500');
/** Audible call playback is mandatory: a muted control cannot reveal a leak. */
const VOLUME = Number(process.env.SHARE_CHECK_VOLUME ?? '0.3');
if (!Number.isFinite(VOLUME) || VOLUME < 0.2 || VOLUME > 1) throw new Error('Mac call-leak proof requires SHARE_CHECK_VOLUME between 0.2 and 1');
const chromeCache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
const installedChrome = existsSync(chromeCache) ? readdirSync(chromeCache)
  .filter(name => name.startsWith('chromium-'))
  .map(name => join(chromeCache, name, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')) : [];
const BROWSER = [
  process.env.CHROME,
  ...installedChrome,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path) => path && existsSync(path));

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
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
    const path = join(SHOTS, `mac-audio-${name}.png`);
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
      localStorage.setItem('scryproof.voice-prefs.v1', JSON.stringify({ noiseMode: 'off', autoGain: false, echoCancellation: false, sounds: false, outputVolume: ${VOLUME} }));
    } catch {}
  })();
`;

/** Alex's microphone: a steady, independently spaced voice tone, untouched by noise removal, so it can be looked for. */
const ALEX_MIC = `
  (() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && constraints.video) return real(constraints);
      const context = new AudioContext({ sampleRate: 48000 });
      const tone = context.createOscillator();
      const gain = context.createGain();
      window.__checkAlexGain = gain;
      tone.frequency.value = ${CALL_HZ};
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

/** Native include-tap control: what the call app is actually playing. */
const recordWindow = (windowId, ms, rootPID = process.pid) => new Promise((resolve, reject) => {
  const chunks = [];
  const child = spawn(join(desktop, 'mac-audio', 'mac-audio'), [String(rootPID), windowId], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (text) => console.log(`control helper: ${text.toString().trim()}`));
  child.on('error', reject);
  const timer = setTimeout(() => child.stdin.end(), ms);
  const hard = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('control helper did not stop')); }, ms + 5000);
  child.on('exit', () => { clearTimeout(timer); clearTimeout(hard); resolve(Buffer.concat(chunks)); });
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

const scratch = mkdtempSync(join(tmpdir(), 'sp-mac-'));
const tones = [];
let app, chrome, wes, alex;
const mainPath = join(desktop, 'src', 'main.js');
let restoredMain = null;
const red = process.argv.includes('--red-proof');
const choose = async (kind, title) => {
  if (!await wes.until(`document.querySelector('.share-picker') !== null`, 15_000)) throw new Error('No share picker (check Screen Recording permission and relaunch Electron).');
  await wes.evaluate(`Array.from(document.querySelectorAll('.share-picker [role=tab]')).find(t=>t.textContent.includes('${kind === 'window' ? 'Applications' : 'Screens'}'))?.click()`);
  const chosen = await wes.until(`(() => { const tile=Array.from(document.querySelectorAll('.share-tile')).find(t=>${title ? `t.title === ${JSON.stringify(title)}` : 'true'}); if (!tile) return false; tile.click(); return true; })()`);
  if (!chosen) throw new Error(`No ${kind} source ${title ?? ''}`);
  await wes.evaluate(`(() => { const box=document.querySelector('.share-picker-sound input'); if(box && !box.checked) box.click(); })()`);
  check(`picker offers sound for ${kind}`, await wes.evaluate(`document.querySelector('.share-picker-sound input')?.checked === true && !document.querySelector('.share-picker-sound input')?.disabled`));
  await wes.shoot(`picker-${kind}`);
  await wes.evaluate(`window.__checkSources = null; window.scryproofDesktop.refreshShare().then(s=>window.__checkSources=s)`);
  if (!await wes.evaluate(`(() => {const b=Array.from(document.querySelectorAll('.share-picker button')).find(b=>['Share','Share audio'].includes(b.textContent.trim()));if(!b||b.disabled)return false;b.click();return true;})()`)) throw new Error('Cannot press Share');
};
const measure = async (name, key, all) => {
  await sleep(2000);
  const spectrum = await alex.evaluate(SPECTRUM(`window.__voice.mix?.voices?.get(${JSON.stringify(key)})?.analyser`, 4000));
  if (!spectrum) { check(`${name}: received audio has an analyser`, false, JSON.stringify(await alex.evaluate(`(()=>{const s=window.__voice.getSnapshot();return {phase:s.phase,people:s.people,videos:s.videos.map(v=>({source:v.source,state:v.state,sound:v.sound,soundOn:v.soundOn})),audio:s.sharedAudio};})()`))); return; }
  const tone = Math.min(at(spectrum, 1000), ...(all ? [at(spectrum, 1500)] : []));
  const floor = floorOf(spectrum, [1000, 1500, CALL_HZ, 440]);
  console.log(`${name} peaks: `+spectrum.db.map((db,bin)=>({hz:Math.round(bin*spectrum.binHz),db:Math.round(db)})).filter(x=>x.hz>150&&x.hz<5000).sort((a,b)=>b.db-a.db).slice(0,8).map(x=>`${x.hz}Hz ${x.db}dB`).join(', '));
  console.log(`${name}: A 1000 Hz ${at(spectrum,1000).toFixed(1)}, B 1500 Hz ${at(spectrum,1500).toFixed(1)}, call ${CALL_HZ} Hz ${at(spectrum,CALL_HZ).toFixed(1)}, mic 440 Hz ${at(spectrum,440).toFixed(1)}, floor ${floor.toFixed(1)} dB`);
  check(`${name}: shared program A received`, at(spectrum, 1000) - floor > 20);
  check(`${name}: ${all ? 'program B received' : 'unshared program B excluded'}`, all ? at(spectrum, 1500) - floor > 20 : at(spectrum, 1500) < tone - 25);
  check(`${name}: call excluded (${CALL_HZ} Hz at least 25 dB below programs)`, at(spectrum, CALL_HZ) < tone - 25);
  check(`${name}: microphone excluded (440 Hz at least 25 dB below programs)`, at(spectrum, 440) < tone - 25);
  {
    await alex.evaluate(`window.__checkAlexGain.gain.value=0`);
    await sleep(1500);
    const off = await alex.evaluate(SPECTRUM(`window.__voice.mix?.voices?.get(${JSON.stringify(key)})?.analyser`, 2000));
    console.log(`${name} diagnostic: call ON ${CALL_HZ}Hz ${at(spectrum,CALL_HZ).toFixed(1)}; call OFF ${CALL_HZ}Hz ${at(off,CALL_HZ).toFixed(1)}; OFF 1000Hz ${at(off,1000).toFixed(1)}; OFF 1500Hz ${at(off,1500).toFixed(1)}`);
    const comparison = `ON ${at(spectrum,CALL_HZ).toFixed(1)}, OFF ${at(off,CALL_HZ).toFixed(1)}, floor ${floor.toFixed(1)} dB`;
    if (!all) check(`${name}: call ON stays below OFF+3 dB or floor+6 dB`,at(spectrum,CALL_HZ)<=Math.max(at(off,CALL_HZ)+3,floor+6),comparison);
    else console.log(`${name}: ON/OFF diagnostic only (whole-machine mix): ${comparison}`);
    await alex.evaluate(`window.__checkAlexGain.gain.value=0.3`);
    await sleep(1500);
    if (process.env.MAC_AUDIO_DIAGNOSTIC === '1') {
    const windowId = all ? 'all' : await wes.evaluate(`window.__checkSources.find(s=>s.name==='tone-1000')?.id.split(':')[1]`);
    const native = await recordWindow(windowId,2000,app.pid);
    console.log(`${name} native tap (call ON): ${CALL_HZ}Hz ${pcmToneLevel(native,CALL_HZ).toFixed(1)}, 1000Hz ${pcmToneLevel(native,1000).toFixed(1)}, 1500Hz ${pcmToneLevel(native,1500).toFixed(1)} dBFS`);
    }
  }
};
try {
  if (process.platform !== 'darwin') throw new Error('Run on macOS');
  if (!BROWSER) throw new Error('Chrome not found');
  for (const url of [`${SERVER}/api/health`, WEB, 'http://127.0.0.1:7880/']) await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (red) {
    const before = readFileSync(mainPath, 'utf8');
    const after = before.replace('MAC ? [String(process.pid), hwnd]', "MAC ? ['999999', hwnd]");
    if (before === after) throw new Error('Red-proof mutation did not apply');
    restoredMain = before;
    writeFileSync(mainPath, after);
    console.log('RED PROOF: development native tap deliberately includes the call. Expect FAIL.');
  }
  for (const freq of [1000, 1500]) {
    if (freq === 1000 && process.env.MAC_AUDIO_WEBKIT === '1') {
      const bundle = join(scratch, 'WebKit Tone.app');
      const contents = join(bundle, 'Contents');
      mkdirSync(join(contents, 'MacOS'), { recursive: true });
      writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.scryproof.mac-audio-tone</string><key>CFBundleExecutable</key><string>tone</string><key>CFBundleName</key><string>WebKit Tone</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
      execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-framework', 'AppKit', '-framework', 'WebKit', '-o', join(contents, 'MacOS', 'tone'), join(root, 'scripts', 'fixtures', 'mac-audio-tone.swift')]);
      const pidFile = join(scratch, 'webkit.pid');
      execFileSync('open', ['-n', '-a', bundle, '--args', pidFile]);
      for (let n=0; n<100 && !existsSync(pidFile); n++) await sleep(100);
      if (!existsSync(pidFile)) throw new Error('WebKit fixture did not open');
      const pid = Number(readFileSync(pidFile, 'utf8'));
      tones.push({ pid, kill(signal) { try { if (execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes(scratch)) process.kill(pid,signal); } catch {} } });
      console.log(`WebKit tone app PID ${pid} (window share must capture its responsible XPC audio service)`);
      continue;
    }
    const folder = join(scratch, `tone-${freq}`);
    mkdirSync(folder);
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: `tone-${freq}`, main: 'main.cjs' }));
    writeFileSync(join(folder, 'main.cjs'), `const {app,BrowserWindow}=require('electron'); app.whenReady().then(()=>{const w=new BrowserWindow({width:400,height:200,title:'tone-${freq}',webPreferences:{autoplayPolicy:'no-user-gesture-required'}});w.loadURL('data:text/html,<title>tone-${freq}</title><h1>Tone ${freq}</h1><script>const c=new AudioContext(); const o=c.createOscillator(); const g=c.createGain();o.frequency.value=${freq};g.gain.value=0.03;o.connect(g).connect(c.destination);o.start();<\/script>');w.on('page-title-updated',e=>e.preventDefault());});`);
    tones.push(spawn(electron, [folder, `--user-data-dir=${join(scratch, `tone-profile-${freq}`)}`], { stdio: 'ignore' }));
  }
  const electronBundle = join(electron, '../../..');
  execFileSync('open', ['-n', '-a', electronBundle, '--env', `SCRYPROOF_SERVER=${SERVER}`, '--env', 'SCRYPROOF_DEV_MEDIA=ws://127.0.0.1:7880', '--args', desktop, '--remote-debugging-port=9361', `--user-data-dir=${join(scratch, 'wes')}`]);
  chrome = spawn(BROWSER, ['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required','--mute-audio','--allow-loopback-in-peer-connection','--remote-debugging-port=9362',`--user-data-dir=${join(scratch,'alex')}`,'--window-size=1280,900','about:blank'], { stdio:['ignore','ignore','pipe'] });
  chrome.stderr.on('data',b=>{if(/DevTools/.test(b.toString()))console.log('chrome: '+b.toString().trim());});
  const appTarget=await firstTarget(9361,t=>t.type==='page'&&t.url.startsWith('app://'));
  if(!appTarget)throw new Error('Electron did not open its app page');
  const desktopPID = Number(execFileSync('lsof', ['-t', '-iTCP:9361', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim());
  app = { pid: desktopPID, exitCode: null, signalCode: null, kill(signal) {
    try { if (execFileSync('ps', ['-p', String(desktopPID), '-o', 'command='], { encoding: 'utf8' }).includes(scratch)) process.kill(desktopPID, signal); } catch {}
  } };
  wes=await new Page('wes',appTarget.webSocketDebuggerUrl).connect();
  await wes.send('Page.addScriptToEvaluateOnNewDocument',{source:FAKE_MIC});
  await wes.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await wes.until(`document.readyState==='complete'`);
  const login = (who) => `fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:${JSON.stringify(who)},password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`;
  check('wes signs in', await wes.evaluate(login('wes'))===200);
  await wes.send('Page.reload');
  if(!await wes.until(`document.querySelector('.channel-name') !== null`)) { await wes.shoot('load-error'); throw new Error('wes did not load: '+ await wes.evaluate(`document.body.innerText`)+'; errors: '+wes.complaints.join(' | ')); }
  check('Mac shell reports native sound capability', await wes.evaluate(`window.scryproofDesktop.canShareSound===true`));
  const target=await firstTarget(9362,t=>t.type==='page');
  alex=await new Page('alex',target.webSocketDebuggerUrl).connect();
  await alex.send('Page.addScriptToEvaluateOnNewDocument',{source:ALEX_MIC});
  await alex.send('Page.navigate',{url:WEB});
  await alex.until(`document.readyState==='complete'`);
  check('alex signs in',await alex.evaluate(login('alex'))===200);
  await alex.send('Page.reload');
  if(!await alex.until(`Boolean(window.__voice)&&document.querySelector('.channel-name') !== null`))throw new Error('alex did not load');
  const wesId=await wes.evaluate(`fetch('/api/auth/me').then(r=>r.json()).then(b=>b.user.id)`);
  check('both join the channel',await wes.clickVoiceChannel()&&await alex.clickVoiceChannel());
  check('encrypted real call',Boolean(await alex.until(`(()=>{const s=window.__voice.getSnapshot();return s.phase==='connected'&&s.encrypted&&s.people.length===1&&s.people[0].state==='secured';})()`,45000))&&Boolean(await wes.until(`document.querySelector('.connection-panel')?.textContent.includes('Encrypted end to end · 2 people')`,45000)));
  // The app's output volume is real, and its own audio is measured with a
  // separate native include tap. Muted or near-silent playback cannot pass.
  check('real quit/reopen cleared prior capture error', await wes.evaluate(`!document.body.innerText.includes('Invalid capture constraints') && !document.body.innerText.includes('Cmd-Q')`));
  if (process.env.MAC_AUDIO_PERMISSION_ONLY === '1') await wes.evaluate(`(() => { window.__audioProbe={started:false,bytes:0,nonzero:0,error:null}; window.scryproofDesktop.onAppSound(()=>window.__audioProbe.started=true,b=>{window.__audioProbe.bytes+=b.length;for(const n of b)if(n)window.__audioProbe.nonzero++;},()=>{},s=>window.__audioProbe.error=s); })()`);
  check('wes requests window share',await wes.clickButton('Share your screen'));
  await choose('window','tone-1000');
  if (process.env.MAC_AUDIO_PERMISSION_ONLY === '1') {
    await wes.until(`window.__audioProbe.error || window.__audioProbe.bytes > 48000`,600000);
    console.log('SYSTEM AUDIO PERMISSION OBSERVATION:',JSON.stringify(await wes.evaluate(`window.__audioProbe`)));
    await wes.shoot('first-audio');
    throw new Error('Permission-only observation finished; full proof must follow a granted relaunch');
  }
  const panel=await wes.until(`document.querySelector('.connection-panel')?.textContent.includes('Share sound this window only')`,130000);
  if(!panel)throw new Error(`Window sound did not start: ${await wes.evaluate(`document.body.innerText.slice(-3000)`)}`);
  const playing=`window.__voice.getSnapshot().videos.some(v=>v.userId==='${wesId}'&&v.source==='screen'&&v.state==='playing')`;
  const watch=async()=>{check('alex watches the share',Boolean(await alex.until(`(()=>{const b=Array.from(document.querySelectorAll('.call-tile button')).find(b=>b.textContent.trim()==='Watch');if(!b)return false;b.click();return true;})()`,15000))&&Boolean(await alex.until(playing,15000)));if(!await alex.evaluate(`window.__voice.getSnapshot().videos.some(v=>v.userId==='${wesId}'&&v.soundOn)`))await alex.clickButton('Unmute screen sound');};
  await watch();
  await measure('window',`${wesId}:screen`,false);
  await wes.shoot('connection-window');
  check('wes stops the screen share', await wes.clickButton('Stop sharing'));
  await wes.until(`document.querySelector('button[aria-label="Share your screen"]') !== null`,10000);
  await alex.until(`!window.__voice.getSnapshot().sharedAudio.some(s=>s.userId==='${wesId}'&&s.kind==='screen')`,10000);
  await sleep(500);
  check('wes requests whole screen',await wes.clickButton('Share your screen'));
  await choose('screen');
  check('panel identifies whole-machine audio with call left out',Boolean(await wes.until(`document.querySelector('.connection-panel')?.textContent.includes('Share sound this Mac, call left out')`,130000)));
  await watch();
  // Capture the app's own sound as the positive control, using the offered
  // window list (never the share's already-excluded output).
  const appWindow=await wes.evaluate(`window.__checkSources?.find(s=>s.kind==='window'&&/Scryproof/i.test(s.name))?.id.split(':')[1]`);
  if(!appWindow)throw new Error('No Scryproof window ID for audible-call control');
  const pcm=await recordWindow(appWindow,4000);
  writeFileSync(join(root,'.mac-audio-check','control.pcm'),pcm);
  const level=pcm.length?pcmToneLevel(pcm,CALL_HZ):-200;
  const peak = Array.from({length:31}, (_,i)=>CALL_HZ-75+i*5).map(hz=>({hz,db:pcmToneLevel(pcm,hz)})).sort((a,b)=>b.db-a.db)[0];
  check(`positive control: captured call keeps its ${CALL_HZ} Hz pitch`,Math.abs(peak.hz-CALL_HZ)<=10,`strongest ${peak.hz} Hz at ${peak.db.toFixed(1)} dBFS`);
  check('positive control: app plays alex at real volume (> -45 dBFS)',level > -45,`${level.toFixed(1)} dBFS, ${pcm.length} PCM bytes; output volume ${VOLUME}`);
  await measure('screen',`${wesId}:screen`,true);
  await wes.shoot('connection-screen');
  check('wes stops the screen share', await wes.clickButton('Stop sharing'));
  await wes.until(`document.querySelector('button[aria-label="Share your screen"]') !== null`,10000);
  await alex.until(`!window.__voice.getSnapshot().sharedAudio.some(s=>s.userId==='${wesId}'&&s.kind==='screen')`,10000);
  await sleep(500);
  check('opens mixer',await wes.clickButton('Open call mixer'));
  check('Mac mixer names this Mac',await wes.evaluate(`document.querySelector('.call-mixer')?.textContent.includes('everything this Mac plays') && !document.querySelector('.call-mixer')?.textContent.includes('the PC')`));
  check('starts music share',await wes.clickButton('Share music'));
  await choose('screen');
  check('music sharing is active',Boolean(await wes.until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Stop sharing music')`,130000)));
  // Music is opt-in on the receiving mixer.
  await alex.clickButton('Open call mixer');
  const music=await alex.until(`window.__voice.getSnapshot().sharedAudio.find(s=>s.userId==='${wesId}'&&s.kind==='music')`,15000);
  check('alex sees music publication',Boolean(music));
  await alex.evaluate(`(()=>{const s=window.__voice.getSnapshot().sharedAudio.find(s=>s.userId==='${wesId}'&&s.kind==='music');if(s)window.__voice.setMusicListening('${wesId}',s.sid,true);})()`);
  await measure('music',`${wesId}:music`,true);
  await wes.shoot('connection-music');
  await wes.clickButton('Stop sharing music');
  check('no uncaught page errors',wes.complaints.length+alex.complaints.length===0,[...wes.complaints,...alex.complaints].join('\n'));
} catch(error) {
  check('run finished',false,String(error.stack??error));
} finally {
  wes?.close();alex?.close();
  for(const child of [app,chrome,...tones]) {try{child?.kill('SIGTERM');}catch{}}
  await sleep(1500);
  for(const child of [app,chrome,...tones]) if(child?.exitCode===null&&child?.signalCode===null)try{child.kill('SIGKILL');}catch{}
  if(restoredMain!==null)writeFileSync(mainPath,restoredMain);
  // This directory was created by this check, and holds only disposable test profiles.
  rmSync(scratch,{recursive:true,force:true});
}
console.log(`${failures===0?'PASS':'FAIL'} Mac real-call audio check: ${failures} failure(s)${red?' (deliberate call leak)':''}.`);
process.exitCode=failures===0?0:1;

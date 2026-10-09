const TICKS = 64; // the loop in 32nd notes
let bpm = 120;
const tickDur = () => 60 / bpm / 8;
let cols = 32; // boxes shown across: 32 (16ths) or 64 (32nds)
const per = () => TICKS / cols; // ticks a box
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// The day's key and chords: set, so what people add fits. Two beats a chord.
const KEY = { name: 'A minor', scale: [9, 11, 0, 2, 4, 5, 7] };
const CHORDS = [
  { name: 'Am', tones: [9, 0, 4] }, { name: 'F', tones: [5, 9, 0] }, { name: 'C', tones: [0, 4, 7] }, { name: 'G', tones: [7, 11, 2] },
];
const chordAt = (tick) => CHORDS[Math.floor(tick / (TICKS / CHORDS.length))];
const scaleRows = (lo, hi) => { const out = []; for (let m = hi; m >= lo; m--) if (KEY.scale.includes(m % 12)) out.push({ label: name(m), midi: [m] }); return out; };
const voice = (chord, root) => chord.tones.map((t) => root + ((t - root % 12) + 12) % 12).sort((a, b) => a - b);

// More synth sounds, in Kombinat's preset shape.
K.PRESETS.push(
  { name: 'ROUND BASS', synth: { osc1: { wave: 'triangle', oct: -1, level: 0.8 }, osc2: { wave: 'sine', oct: -2, level: 0.4 }, sub: { level: 0.3 },
    filter: { cutoff: 600, res: 1, env: 0.3 }, fenv: { a: 0.005, d: 0.2, s: 0.2, r: 0.2 }, aenv: { a: 0.004, d: 0.3, s: 0.7, r: 0.15 } }, rack: [] },
  { name: 'PLUCK BASS', synth: { osc1: { wave: 'sawtooth', oct: -1, level: 0.8 }, osc2: { wave: 'square', oct: -1, fine: 5, level: 0.3 },
    filter: { cutoff: 250, res: 4, env: 0.8, keytrack: 0.5 }, fenv: { a: 0.001, d: 0.14, s: 0, r: 0.14 }, aenv: { a: 0.001, d: 0.3, s: 0.3, r: 0.2 }, play: { mode: 'mono', glide: 0.02 } }, rack: [] },
  { name: 'REESE', synth: { osc1: { wave: 'sawtooth', oct: -1, unison: 3, spread: 30, level: 0.6 }, osc2: { wave: 'sawtooth', oct: -1, fine: -12, unison: 3, spread: 30, level: 0.6 },
    filter: { cutoff: 700, res: 2, env: 0.2 }, aenv: { a: 0.01, d: 0.2, s: 0.9, r: 0.2 } }, rack: [{ type: 'chorus', p: { rate: 0.2, depth: 0.5, mix: 0.3 } }] },
  { name: '808 BASS', synth: { osc1: { wave: 'sine', oct: -2, level: 1 }, osc2: { level: 0 }, filter: { cutoff: 300, res: 0.5, env: 0.5 },
    fenv: { a: 0.001, d: 0.08, s: 0, r: 0.1 }, aenv: { a: 0.001, d: 0.9, s: 0.5, r: 0.3 }, play: { mode: 'mono', glide: 0.08 } },
    rack: [{ type: 'distortion', p: { mode: 'soft', drive: 0.25, tone: 3000, mix: 0.6, level: 0.8 } }] },
  { name: 'STRINGS', synth: { osc1: { wave: 'sawtooth', unison: 5, spread: 20, level: 0.5 }, osc2: { wave: 'sawtooth', oct: 1, unison: 3, spread: 15, level: 0.25 },
    filter: { cutoff: 2200, res: 0.7, env: 0.2 }, fenv: { a: 0.6, d: 1, s: 0.6, r: 1 }, aenv: { a: 0.5, d: 0.5, s: 0.9, r: 1.2 }, lfo: { rate: 4.5, depth: 0.02, target: 'pitch' } },
    rack: [{ type: 'reverb', p: { size: 0.9, decay: 4, mix: 0.4 } }] },
  { name: 'CHOIR', synth: { osc1: { wave: 'pulse', unison: 4, spread: 12, level: 0.5 }, osc2: { wave: 'triangle', oct: 1, fine: 6, unison: 2, level: 0.35 },
    filter: { type: 'bandpass', cutoff: 1100, res: 2, env: 0.15 }, fenv: { a: 0.8, d: 1, s: 0.7, r: 1 }, aenv: { a: 0.7, d: 0.6, s: 0.9, r: 1.5 }, lfo: { rate: 0.25, depth: 0.2, target: 'cutoff' } },
    rack: [{ type: 'chorus', p: { rate: 0.3, depth: 0.6, mix: 0.5 } }, { type: 'reverb', p: { size: 0.95, decay: 6, mix: 0.45 } }] },
  { name: 'DREAM PAD', synth: { osc1: { wave: 'triangle', unison: 4, spread: 18, level: 0.6 }, osc2: { wave: 'sine', oct: 1, semi: 7, level: 0.3 },
    filter: { cutoff: 1500, res: 0.5, env: 0.3 }, fenv: { a: 2, d: 2, s: 0.5, r: 2 }, aenv: { a: 1.5, d: 1, s: 0.8, r: 2.5 } },
    rack: [{ type: 'delay', p: { div: '1/4', feedback: 0.5, pingpong: 'on', mix: 0.3 } }, { type: 'reverb', p: { size: 1, decay: 7, mix: 0.5 } }] },
  { name: 'E PIANO', synth: { osc1: { wave: 'sine', level: 0.8 }, osc2: { wave: 'sine', oct: 2, semi: 0, level: 0.15 },
    filter: { cutoff: 5000, res: 0.5, env: 0.3 }, fenv: { a: 0.001, d: 0.4, s: 0, r: 0.3 }, aenv: { a: 0.002, d: 1.2, s: 0.2, r: 0.4 }, lfo: { rate: 4, depth: 0.08, target: 'amp' } },
    rack: [{ type: 'chorus', p: { rate: 0.6, depth: 0.3, mix: 0.3 } }] },
  { name: 'BELLS', synth: { osc1: { wave: 'sine', oct: 1, level: 0.6 }, osc2: { wave: 'sine', oct: 2, semi: 7, fine: 0, level: 0.25 },
    filter: { cutoff: 12000, res: 0.3, env: 0 }, aenv: { a: 0.002, d: 1.2, s: 0, r: 0.8 } },
    rack: [{ type: 'reverb', p: { size: 0.85, decay: 4, mix: 0.4 } }] },
  { name: 'MUSIC BOX', synth: { osc1: { wave: 'triangle', oct: 1, level: 0.7 }, osc2: { wave: 'sine', oct: 2, level: 0.2 },
    filter: { cutoff: 9000, res: 0.5, env: 0 }, aenv: { a: 0.001, d: 0.5, s: 0, r: 0.3 } },
    rack: [{ type: 'delay', p: { div: '1/8d', feedback: 0.3, mix: 0.2 } }, { type: 'reverb', p: { size: 0.6, decay: 2, mix: 0.3 } }] },
  { name: 'FLUTE', synth: { osc1: { wave: 'sine', level: 0.7 }, osc2: { wave: 'triangle', oct: 0, fine: 5, level: 0.3 }, noise: { level: 0.03 },
    filter: { cutoff: 4000, res: 0.5, env: 0.1 }, aenv: { a: 0.08, d: 0.2, s: 0.8, r: 0.25 }, lfo: { rate: 5, depth: 0.03, target: 'pitch' } },
    rack: [{ type: 'reverb', p: { size: 0.7, decay: 2.5, mix: 0.3 } }] },
  { name: 'MARIMBA', synth: { osc1: { wave: 'sine', level: 0.8 }, osc2: { wave: 'sine', oct: 2, semi: 0, level: 0.2 },
    filter: { cutoff: 6000, res: 0.5, env: 0.4 }, fenv: { a: 0.001, d: 0.08, s: 0, r: 0.08 }, aenv: { a: 0.001, d: 0.35, s: 0, r: 0.2 } },
    rack: [{ type: 'reverb', p: { size: 0.5, decay: 1.5, mix: 0.25 } }] },
  { name: 'KALIMBA', synth: { osc1: { wave: 'triangle', oct: 1, level: 0.7 }, osc2: { wave: 'sine', oct: 1, semi: 12, level: 0.15 }, noise: { level: 0.02 },
    filter: { cutoff: 7000, res: 0.5, env: 0.5 }, fenv: { a: 0.001, d: 0.05, s: 0, r: 0.05 }, aenv: { a: 0.001, d: 0.8, s: 0, r: 0.3 } },
    rack: [{ type: 'delay', p: { div: '1/8', feedback: 0.25, pingpong: 'on', mix: 0.2 } }, { type: 'reverb', p: { size: 0.6, decay: 2, mix: 0.3 } }] },
  { name: 'HARP', synth: { osc1: { wave: 'sawtooth', level: 0.5 }, osc2: { wave: 'triangle', oct: 1, level: 0.4 },
    filter: { cutoff: 1200, res: 1, env: 0.7, keytrack: 0.8 }, fenv: { a: 0.001, d: 0.3, s: 0, r: 0.3 }, aenv: { a: 0.001, d: 1.4, s: 0, r: 0.5 } },
    rack: [{ type: 'reverb', p: { size: 0.8, decay: 3, mix: 0.35 } }] },
  { name: 'CHIP', synth: { osc1: { wave: 'square', level: 0.6 }, osc2: { level: 0 }, filter: { cutoff: 9000, res: 0.3, env: 0 },
    aenv: { a: 0.001, d: 0.1, s: 0.6, r: 0.05 }, lfo: { rate: 6, depth: 0.04, target: 'pitch' } }, rack: [] },
  { name: 'SQUARE LEAD', synth: { osc1: { wave: 'square', level: 0.6 }, osc2: { wave: 'square', oct: 0, fine: 8, level: 0.4 },
    filter: { cutoff: 2000, res: 2, env: 0.4 }, fenv: { a: 0.01, d: 0.3, s: 0.4, r: 0.3 }, aenv: { a: 0.01, d: 0.2, s: 0.8, r: 0.2 }, play: { mode: 'mono', glide: 0.05 } },
    rack: [{ type: 'delay', p: { div: '1/8d', feedback: 0.3, mix: 0.2 } }] },
  { name: 'STEEL DRUM', synth: { osc1: { wave: 'sine', oct: 1, level: 0.7 }, osc2: { wave: 'triangle', oct: 2, semi: 4, level: 0.3 },
    filter: { cutoff: 8000, res: 1.5, env: 0.5 }, fenv: { a: 0.001, d: 0.1, s: 0, r: 0.1 }, aenv: { a: 0.001, d: 0.6, s: 0, r: 0.3 }, lfo: { rate: 7, depth: 0.02, target: 'pitch' } },
    rack: [{ type: 'reverb', p: { size: 0.6, decay: 2, mix: 0.3 } }] },
  { name: 'WHISTLE', synth: { osc1: { wave: 'sine', oct: 1, level: 0.7 }, osc2: { level: 0 }, filter: { cutoff: 8000, res: 0.5, env: 0 },
    aenv: { a: 0.05, d: 0.1, s: 0.9, r: 0.2 }, play: { mode: 'mono', glide: 0.06 }, lfo: { rate: 5.5, depth: 0.05, target: 'pitch' } },
    rack: [{ type: 'reverb', p: { size: 0.7, decay: 2.5, mix: 0.3 } }] },
);
const preset = (n) => K.PRESETS.find((p) => p.name === n);

// Drum sounds: every one-shot of a kind, across the three kits. A kit picks one of each.
const KITS = Object.keys(K.SAMPLES);
const samplesOf = (cat) => KITS.flatMap((k) => K.SAMPLES[k][cat] ?? []);
const kitFirst = (kit, cat) => (K.SAMPLES[kit][cat] ?? samplesOf(cat))[0];

// The easy effects: one slider each, off at zero. Drive is kept small on purpose.
const FX = {
  reverb: (v) => ({ type: 'reverb', p: { size: 0.7, decay: 2.5, mix: v * 0.6 } }),
  delay: (v) => ({ type: 'delay', p: { div: '1/8d', feedback: 0.3 + v * 0.3, mix: v * 0.5 } }),
  chorus: (v) => ({ type: 'chorus', p: { rate: 0.5, depth: 0.4, mix: v * 0.7 } }),
  phaser: (v) => ({ type: 'phaser', p: { rate: 0.35, mix: v * 0.8 } }),
  drive: (v) => ({ type: 'distortion', p: { mode: 'soft', drive: v * 0.25, tone: 5000, mix: 0.5, level: 0.8 } }),
  muffle: (v) => ({ type: 'filter', p: { type: 'lowpass', cutoff: 12000 * 0.03 ** v, res: 1 } }),
};
const DRUM_SQUEEZE = [{ type: 'compressor', p: { threshold: -14, ratio: 3, attack: 0.003, release: 0.1, makeup: 4 } }];

// A layer is one person's. A part is one sound inside it with its own fader,
// effects and limiter: a synth layer has one, a drum layer has one a row.
const synthPart = (label, sounds) => ({ label, kind: 'synth', sounds, sound: sounds[0] });
const drumPart = (label, cat) => ({ label, kind: 'drum', cat, sounds: samplesOf(cat), sound: samplesOf(cat)[0].name });
const drumLayer = (id, who, hint, color, parts) => ({ id, who, hint, color, kits: KITS, kit: KITS[0], parts, rows: parts.map((p, i) => ({ label: p.label, part: i })) });
const LAYERS = [
  { id: 'bass', who: 'Bass', hint: 'the groove', color: '#d9a441', rows: scaleRows(33, 52),
    parts: [synthPart('bass', ['SUB BASS', 'ROUND BASS', 'PLUCK BASS', 'ACID BASS', 'DISCO BASS', '808 BASS', 'REESE', 'WOBBLE', 'DIRTY OCTAVES'])] },
  drumLayer('kicks', 'Kick & snare', 'the backbone', '#d95f5f', [drumPart('kick', 'kick'), drumPart('808', '808'), drumPart('snare', 'snare'), drumPart('tom', 'perc')]),
  drumLayer('hats', 'Hats & claps', 'the top end', '#e08a5a', [drumPart('closed', 'chat'), drumPart('open', 'ohat'), drumPart('clap', 'clap'), drumPart('perc', 'perc')]),
  { id: 'pads', who: 'Pads', hint: "chord rows play the day's chord; the notes below are yours", color: '#a98fd9',
    rows: [{ label: 'chord high', root: 69 }, { label: 'chord mid', root: 60 }, { label: 'chord low', root: 52, gap: true }, ...scaleRows(52, 76)],
    parts: [synthPart('pads', ['WARM PAD', 'STRINGS', 'DREAM PAD', 'CHOIR', 'E PIANO', 'ORGAN', 'SUPERSAW', 'PHASED KEYS', 'HALO LEAD', 'BRASS'])] },
  { id: 'melody', who: 'Melody', hint: 'the last word', color: '#8fd18f', rows: scaleRows(57, 81),
    parts: [synthPart('melody', ['PLUCK', 'BELLS', 'MUSIC BOX', 'MARIMBA', 'KALIMBA', 'HARP', 'STEEL DRUM', 'GLASS KEYS', 'FLUTE', 'WHISTLE', 'CHIP', 'SQUARE LEAD', 'POLIVOKS LEAD', 'HOLLOW PULSE'])] },
];
for (const l of LAYERS) {
  l.notes = []; l.hearAt = 1; l.editing = 0;
  for (const p of l.parts) { p.level = p.kind === 'drum' ? 1 : 0.8; p.fx = Object.fromEntries(Object.keys(FX).map((k) => [k, 0])); }
}
const byId = (id) => LAYERS.find((l) => l.id === id);
const partOf = (l, row) => l.parts[row.part ?? 0];

// Solo: every layer is yours. Pass: pick a free layer, do it, pass it on; the next person picks from what is left.
let mode = null, current = null; const done = new Set();
const mine = (l) => mode === 'solo' || current === l.id;
const free = () => LAYERS.filter((l) => !done.has(l.id));

// ---- sound: a chain a part, then a listen volume a layer, then one limiter over all ----
let ctx, master, meter;
function limiter(threshold) {
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = threshold; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  return lim;
}
const decoded = new Map(); // sample name -> AudioBuffer
async function buffer(sample) {
  if (!decoded.has(sample.name)) {
    const bytes = sample.file ?? Uint8Array.from(atob(sample.wav), (c) => c.charCodeAt(0)).buffer;
    decoded.set(sample.name, await ctx.decodeAudioData(bytes.slice(0)));
  }
  return decoded.get(sample.name);
}
function boot() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = +document.getElementById('masterVol').value;
  meter = limiter(-3);
  master.connect(meter).connect(ctx.destination);
  for (const l of LAYERS) {
    // Two volumes: the maker's (a part's fader) and the listener's (listen, only on this screen).
    l.listen = ctx.createGain(); l.listen.gain.value = l.hearAt; l.listen.connect(master);
    for (const p of l.parts) {
      p.input = ctx.createGain();
      if (p.kind === 'synth') { p.inst = new K.Synth(ctx); p.inst.output.connect(p.input); }
      p.fader = ctx.createGain(); p.fader.gain.value = p.level;
      p.fader.connect(limiter(-6)).connect(l.listen);
      p.rack = new K.Rack(ctx, p.input, p.fader); p.rack.setTempo(bpm);
      setSound(p, p.sound);
    }
  }
  setInterval(() => document.getElementById('peak').classList.toggle('hot', meter.reduction < -1), 80);
}
function setSound(p, s) {
  p.sound = s;
  if (!ctx) return;
  if (p.kind === 'synth') p.inst.load(preset(s).synth);
  else buffer(p.sounds.find((x) => x.name === s));
  applyFx(p);
}
function applyFx(p) {
  if (!ctx) return;
  const base = p.kind === 'drum' ? DRUM_SQUEEZE : preset(p.sound).rack;
  const own = Object.entries(p.fx).filter(([, v]) => v > 0).map(([k, v]) => FX[k](v));
  p.rack.load([...base, ...own]);
}
function setKit(l, kit) {
  l.kit = kit;
  for (const p of l.parts) setSound(p, kitFirst(kit, p.cat).name);
}
async function sound(l, n, at) {
  const row = l.rows[n.row], p = partOf(l, row);
  if (p.kind === 'drum') {
    const src = ctx.createBufferSource(); src.buffer = await buffer(p.sounds.find((x) => x.name === p.sound));
    src.connect(p.input); src.start(Math.max(at, ctx.currentTime));
    return;
  }
  const midis = row.root ? voice(chordAt(n.start), row.root) : row.midi;
  for (const m of midis) { p.inst.noteOn(m, 1, at); p.inst.noteOff(m, at + n.len * tickDur() * 0.9); }
}
let playing = false, tickAt = 0, nextAt = 0, timer;
function tick() {
  while (nextAt < ctx.currentTime + 0.1) {
    const t = tickAt;
    for (const l of LAYERS) { if (l.muted) continue; for (const n of l.notes) if (n.start === t) sound(l, n, nextAt); }
    setTimeout(() => mark(t), Math.max(0, (nextAt - ctx.currentTime) * 1000));
    tickAt = (tickAt + 1) % TICKS; nextAt += tickDur();
  }
}
function play() {
  boot();
  if (playing) { playing = false; clearInterval(timer); mark(-1); LAYERS.forEach((l) => l.parts.forEach((p) => p.inst?.allOff())); }
  else { playing = true; tickAt = 0; nextAt = ctx.currentTime + 0.05; timer = setInterval(tick, 25); tick(); }
  document.getElementById('play').textContent = playing ? 'Stop' : 'Play';
}
function setBpm(v) {
  bpm = Math.min(200, Math.max(60, Math.round(v) || 120));
  document.getElementById('bpm').value = bpm;
  if (ctx) LAYERS.forEach((l) => l.parts.forEach((p) => p.rack.setTempo(bpm)));
}

// ---- screen ----
const layersEl = document.getElementById('layers');
document.getElementById('chordNames').innerHTML = CHORDS.map((c) => `<span>${c.name}</span>`).join('');
const fits = (l, row, tick) => !!row.midi && chordAt(tick).tones.includes(row.midi[0] % 12);
const noteWidth = (ticks) => { const n = ticks / per(); return `calc(${n * 100}% + ${(n - 1) * 2}px)`; };
function draw() {
  layersEl.replaceChildren(...LAYERS.map((l) => {
    const own = mine(l), el = document.createElement('div'), p = l.parts[l.editing];
    el.className = 'layer ' + (done.has(l.id) ? 'locked' : own || (mode === 'pass' && current === null) ? '' : 'todo');
    el.style.setProperty('--c', l.color);
    const state = done.has(l.id) ? (l.by ? `${l.by} did this` : 'passed on') : own ? l.hint : current === null ? 'free' : 'waiting';
    const dis = own ? '' : 'disabled';
    const knob = (k, v, max = 1) => `<label class="knob ${v > 0 ? 'on' : ''}">${k}<input type="range" min="0" max="${max}" step="0.05" value="${v}" data-k="${k}" ${dis}></label>`;
    el.innerHTML = `<div class="who">${l.who}<small>${state}</small>
      ${l.kits ? `<select data-kit ${dis}>${l.kits.map((k) => `<option value="${k}" ${k === l.kit ? 'selected' : ''}>${k} kit</option>`).join('')}</select>` : ''}
      ${l.parts.length > 1 ? `<div class="tabs">${l.parts.map((q, i) => `<button data-tab="${i}" class="${i === l.editing ? 'on' : ''}">${q.label}</button>`).join('')}</div>` : ''}
      <select data-sound ${dis}>${p.sounds.map((s) => `<option ${soundName(s) === p.sound ? 'selected' : ''}>${soundName(s)}</option>`).join('')}</select>
      <div class="knobs">${knob('volume', p.level, 1.5)}${Object.keys(FX).map((k) => knob(k, p.fx[k])).join('')}</div>
      ${own ? '' : `<label class="knob on" title="Only you hear this change">hear at<input type="range" min="0" max="1.5" step="0.05" value="${l.hearAt}" data-k="hearAt"></label>`}
      ${own ? '<button data-clear>Clear mine</button>' : ''}
      ${mode === 'pass' && current === null && !done.has(l.id) ? '<button class="take" data-take>I\'ll do this one</button>' : ''}
      ${!own && (done.has(l.id) || mode === 'solo') ? `<button data-mute>${l.muted ? 'Unmute' : 'Mute'}</button>` : ''}
    </div><div class="rows" style="--cols:${cols}"></div>`;
    el.querySelector('[data-kit]')?.addEventListener('change', (e) => { boot(); setKit(l, e.target.value); draw(); });
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { l.editing = +b.dataset.tab; draw(); }; });
    el.querySelector('[data-sound]').onchange = (e) => { boot(); setSound(p, e.target.value); };
    el.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = (e) => {
        const v = +e.target.value, k = r.dataset.k; r.parentElement.classList.toggle('on', v > 0);
        if (k === 'volume') { p.level = v; if (p.fader) p.fader.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
        if (k === 'hearAt') { l.hearAt = v; if (l.listen) l.listen.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
      };
      r.onchange = (e) => { if (r.dataset.k in FX) { boot(); p.fx[r.dataset.k] = +e.target.value; applyFx(p); } };
    });
    el.querySelector('[data-clear]')?.addEventListener('click', () => { l.notes = []; draw(); });
    el.querySelector('[data-take]')?.addEventListener('click', () => { current = l.id; draw(); });
    el.querySelector('[data-mute]')?.addEventListener('click', () => { l.muted = !l.muted; draw(); });
    const rows = el.querySelector('.rows');
    l.rows.forEach((row, ri) => {
      const r = document.createElement('div'); r.className = 'row' + (row.gap ? ' gap' : ''); r.dataset.r = ri;
      r.innerHTML = `<span class="label ${l.parts.length > 1 && row.part === l.editing ? 'part' : ''}">${row.label}</span>`;
      for (let c = 0; c < cols; c++) {
        const t = c * per(), cell = document.createElement('div');
        cell.className = 'cell' + (t % 8 === 0 ? ' beat' : '') + (fits(l, row, t) ? ' fits' : ''); cell.dataset.t = t; cell.title = row.label;
        const n = l.notes.find((n) => n.row === ri && n.start === t);
        if (n) { const d = document.createElement('div'); d.className = 'note'; d.style.width = noteWidth(n.len); cell.append(d); }
        r.append(cell);
      }
      if (own && row.part !== undefined) dropZone(l, row, r);
      rows.append(r);
    });
    if (own) wire(l, rows);
    return el;
  }));
  const left = free().length;
  document.getElementById('turn').innerHTML =
    mode === 'solo' ? 'All five are yours'
    : current ? `Your turn: <b>${byId(current).who}</b>`
    : left ? `Pick a layer, ${left} left` : `<span class="done">Done. That's the day's loop.</span>`;
  document.getElementById('pass').hidden = mode !== 'pass' || current === null;
  document.getElementById('bpm').disabled = !(mode === 'solo' || current);
}
// Drop a .wav from your own folders onto a drum row: it becomes that row's sound, here only.
function dropZone(l, row, r) {
  r.ondragover = (e) => { e.preventDefault(); r.classList.add('drop'); };
  r.ondragleave = () => r.classList.remove('drop');
  r.ondrop = async (e) => {
    e.preventDefault(); r.classList.remove('drop');
    const file = e.dataTransfer.files[0]; if (!file) return;
    boot();
    const p = partOf(l, row), sample = { name: 'my ' + file.name.replace(/\.[^.]+$/, ''), file: await file.arrayBuffer() };
    p.sounds = [sample, ...p.sounds]; l.editing = row.part; setSound(p, sample.name); draw();
  };
}
// Put a note down on press, stretch it while dragging right, take it away on a click. A press on a drum row also picks that sound for the sliders.
let drag = null; // outlives a redraw
function wire(l, rows) {
  const at = (e) => { const c = e.target.closest('.cell'); return c && { row: +c.parentElement.dataset.r, t: +c.dataset.t }; };
  rows.onpointerdown = (e) => {
    const p = at(e); if (!p) return;
    const row = l.rows[p.row];
    if (row.part !== undefined && row.part !== l.editing) l.editing = row.part;
    const hit = l.notes.find((n) => n.row === p.row && p.t >= n.start && p.t < n.start + n.len);
    if (hit) { l.notes.splice(l.notes.indexOf(hit), 1); draw(); return; }
    boot();
    drag = { row: p.row, start: p.t, len: per() }; l.notes.push(drag); sound(l, drag, ctx.currentTime); draw();
  };
  rows.onpointermove = (e) => {
    if (!drag) return;
    const p = at(e); if (!p || p.row !== drag.row) return;
    const next = l.notes.filter((n) => n !== drag && n.row === drag.row && n.start > drag.start).map((n) => n.start);
    const len = Math.max(per(), Math.min(p.t - drag.start + per(), (next.length ? Math.min(...next) : TICKS) - drag.start));
    if (len === drag.len) return;
    drag.len = len;
    rows.querySelector(`.row[data-r="${drag.row}"] .cell[data-t="${drag.start}"] .note`).style.width = noteWidth(len);
  };
  rows.onpointerup = () => { drag = null; };
}
function mark(t) {
  document.querySelectorAll('.cell.now').forEach((c) => c.classList.remove('now'));
  if (t >= 0 && t % per() === 0) document.querySelectorAll(`.cell[data-t="${t}"]`).forEach((c) => c.classList.add('now'));
}
function begin(m) {
  mode = m; current = null; done.clear(); setBpm(120);
  LAYERS.forEach((l) => { l.notes = []; l.by = null; l.muted = false; l.hearAt = 1; l.listen?.gain.setTargetAtTime(1, ctx.currentTime, 0.02); });
  document.getElementById('start').hidden = true; document.getElementById('game').hidden = false;
  document.getElementById('sub').textContent = (m === 'solo' ? 'All five layers are yours. ' : 'Pick a layer, make it, pass it on, close the window; friends pick from what is left. Whoever has the turn can change the BPM. ')
    + 'Click a box to put a note down, drag right to make it longer, click a note to take it away. On a drum layer, the sliders work on the sound whose tab is lit; drop a .wav of your own onto a drum row to use it. Space plays and stops.';
  document.getElementById('link').hidden = m === 'solo';
  draw();
}

// ---- loops for friends: saved on the box by store/store.mjs, under api/ next to this page ----
// Wes: "an individual session that's like saved... I finish my part... someone else can jump in pick up that session
// do the instrument they want... over the course of the day people can jump back in and see how it's progressing."
let loop = null, watch = null; // the open loop as the box last sent it, and the timer that asks again
const say = (t) => { const m = document.getElementById('msg'); m.textContent = t; m.hidden = !t; };
const nameEl = document.getElementById('name');
nameEl.value = localStorage.getItem('pa.name') || '';
nameEl.onchange = () => localStorage.setItem('pa.name', nameEl.value.trim());
const me = () => nameEl.value.trim() || 'someone';
const api = async (path, method = 'GET', body) => {
  const r = await fetch('api/' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(data.error || r.status);
  return { status: r.status, data };
};
const soundName = (s) => typeof s === 'string' ? s : s.name;
const pack = (l) => ({ by: me(), bpm, kit: l.kit, notes: l.notes.map(({ row, start, len }) => ({ row, start, len })),
  parts: l.parts.map((p) => ({ sound: soundName(p.sound), level: p.level, fx: p.fx })) });
// Put a loop from the box onto the screen. A dropped .wav never travels, so a sound nobody else has falls back to the kit's first.
function apply(data) {
  loop = data; setBpm(loop.bpm);
  for (const l of LAYERS) {
    const s = loop.layers[l.id]; if (!s) continue;
    done.add(l.id); l.by = s.by; l.notes = s.notes;
    if (l.kits && l.kits.includes(s.kit)) l.kit = s.kit;
    l.parts.forEach((p, i) => {
      const q = s.parts[i]; if (!q) return;
      p.level = q.level; p.fader?.gain.setTargetAtTime(q.level, ctx.currentTime, 0.02);
      for (const k in p.fx) p.fx[k] = q.fx[k] ?? 0;
      const known = p.sounds.some((x) => soundName(x) === q.sound);
      p.sound = known ? q.sound : p.kind === 'drum' ? kitFirst(l.kit, p.cat).name : p.sound;
      setSound(p, p.sound);
    });
  }
  if (current && done.has(current)) current = null;
  draw();
}
async function openLoop(id) {
  const { status, data } = await api('loops/' + id);
  if (status !== 200) { say('That loop is gone.'); return showLoops(); }
  say(''); begin('pass'); apply(data);
  history.replaceState(null, '', '?s=' + id);
  document.getElementById('link').value = location.href;
  document.getElementById('sub').textContent = `"${loop.name}", started by ${loop.by}. ` + document.getElementById('sub').textContent;
  clearInterval(watch);
  watch = setInterval(async () => { // nothing of yours in hand: see how it is going
    if (current || document.getElementById('game').hidden) return;
    const r = await api('loops/' + loop.id).catch(() => null);
    if (r?.status === 200 && r.data.updated !== loop.updated) apply(r.data);
  }, 15000);
}
async function passOn() {
  if (!loop) { done.add(current); current = null; draw(); return; } // solo-style pass with no box: the old one-screen game
  const l = byId(current), b = document.getElementById('pass'); b.disabled = true;
  try {
    const { status, data } = await api(`loops/${loop.id}/${l.id}`, 'PUT', pack(l));
    if (status === 409) { say(`${data.loop.layers[l.id].by} already passed ${l.who} on. Pick another.`); l.notes = []; }
    current = null; apply(status === 409 ? data.loop : data);
  } catch (e) { say('Could not save: ' + e.message); b.disabled = false; }
}
async function showLoops() {
  const el = document.getElementById('loops');
  const r = await api('loops').catch(() => null);
  if (!r) { el.innerHTML = ''; return; } // opened from a plain file: solo still works
  const when = (t) => { const h = (Date.now() - t) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)} h ago` : `${Math.floor(h / 24)} d ago`; };
  el.innerHTML = r.data.length ? '<h2>Loops</h2>' + r.data.map((x) => {
    const n = Object.keys(x.done).length, who = LAYERS.filter((l) => x.done[l.id]).map((l) => `${l.who}: ${x.done[l.id]}`).join(', ');
    return `<div class="loop ${n === 5 ? 'full' : ''}"><div>${x.name} <small>${x.bpm} bpm, started by ${x.by} ${when(x.updated)}. ${n ? who : 'nothing yet'}</small></div><button data-open="${x.id}">${n === 5 ? 'Listen' : n ? 'Jump in' : 'Start it'}</button></div>`;
  }).join('') : '<h2>No loops yet</h2>';
  el.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openLoop(b.dataset.open); });
}
document.getElementById('new').onclick = async () => {
  const name = document.getElementById('loopName').value.trim() || `${me()}'s ${new Date().toLocaleDateString(undefined, { weekday: 'long' })} loop`;
  const { data } = await api('loops', 'POST', { name, by: me(), bpm: 120 });
  openLoop(data.id);
};
document.querySelectorAll('#start [data-mode]').forEach((b) => { b.onclick = () => { loop = null; begin(b.dataset.mode); }; });
document.getElementById('play').onclick = play;
document.getElementById('masterVol').oninput = (e) => { boot(); master.gain.setTargetAtTime(+e.target.value, ctx.currentTime, 0.02); };
document.getElementById('bpm').onchange = (e) => setBpm(+e.target.value);
document.getElementById('pass').onclick = passOn;
document.getElementById('reset').onclick = () => { if (playing) play(); loop = null; clearInterval(watch); history.replaceState(null, '', location.pathname); document.getElementById('game').hidden = true; document.getElementById('start').hidden = false; showLoops(); };
const wanted = new URLSearchParams(location.search).get('s');
if (wanted && /^[a-z0-9]{10}$/.test(wanted)) openLoop(wanted); else showLoops();
// Finer boxes: notes already down stay where they are; a note on an off-box tick still plays, it just cannot be grabbed until the grid is fine again.
document.getElementById('fine').onchange = (e) => { cols = e.target.checked ? 64 : 32; draw(); };
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && mode && !['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); play(); } });

// inside Scryproof's Activities frame: tell the app we are up, or it shows "loading" forever
if (window.parent !== window) window.parent.postMessage({ type: 'scryproof-activity', game: 'pass-along', status: 'ready' }, '*');

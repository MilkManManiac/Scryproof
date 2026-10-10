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
// Round seven (Wes, 2026-10-09): "let people add as much as they want to the song". Layers are no
// longer a fixed five-to-seven: KINDS are templates, and anyone adds as many layers of any kind as
// they like. Each layer saves on its own and locks once saved.
const synthPart = (label, sounds) => ({ label, kind: 'synth', sounds, sound: sounds[0] });
const drumPart = (label, cat) => ({ label, kind: 'drum', cat, sounds: samplesOf(cat), sound: samplesOf(cat)[0].name });
const MELODY = ['PLUCK', 'BELLS', 'MUSIC BOX', 'MARIMBA', 'KALIMBA', 'HARP', 'STEEL DRUM', 'GLASS KEYS', 'FLUTE', 'WHISTLE', 'CHIP', 'SQUARE LEAD', 'POLIVOKS LEAD', 'HOLLOW PULSE'];
// Scale rows run three to four octaves; the screen shows VIEW of them at a time and the higher/lower buttons move the window
// (Wes: "sometimes i wanna go to a lower octave. maybe just let you zoom in / out"). `top` is the highest note shown at first.
const VIEW = 15;
const synthKind = (kind, who, hint, color, top, lo, hi, sounds) => ({ kind, who, hint, color, top, rows: scaleRows(lo, hi), parts: () => [synthPart(kind, sounds)] });
const drumKind = (kind, who, hint, color, cats) => ({ kind, who, hint, color, kits: KITS, rows: cats.map(([label], i) => ({ label, part: i })), parts: () => cats.map(([label, cat]) => drumPart(label, cat)) });
const KINDS = [
  synthKind('bass', 'Bass', 'the groove', '#d9a441', 52, 24, 64, ['SUB BASS', 'ROUND BASS', 'PLUCK BASS', 'ACID BASS', 'DISCO BASS', '808 BASS', 'REESE', 'WOBBLE', 'DIRTY OCTAVES']),
  drumKind('kicks', 'Kick & snare', 'the backbone', '#d95f5f', [['kick', 'kick'], ['808', '808'], ['snare', 'snare'], ['tom', 'perc']]),
  drumKind('hats', 'Hats & claps', 'the top end', '#e08a5a', [['closed', 'chat'], ['open', 'ohat'], ['clap', 'clap'], ['perc', 'perc']]),
  { kind: 'pads', who: 'Pads', hint: "chord rows play the day's chord; the notes below are yours", color: '#a98fd9', top: 76,
    rows: [{ label: 'chord high', root: 69 }, { label: 'chord mid', root: 60 }, { label: 'chord low', root: 52, gap: true }, ...scaleRows(40, 88)],
    parts: () => [synthPart('pads', ['WARM PAD', 'STRINGS', 'DREAM PAD', 'CHOIR', 'E PIANO', 'ORGAN', 'SUPERSAW', 'PHASED KEYS', 'HALO LEAD', 'BRASS'])] },
  synthKind('melody', 'Melody', 'a tune, or an answer to one', '#8fd18f', 81, 45, 93, MELODY),
  { kind: 'vocals', who: 'Vocals', hint: 'sing or talk over it: record one loop, or drop a sound file on the row', color: '#e3b7d6',
    rows: [{ label: 'clip', clip: true, part: 0 }], parts: () => [{ label: 'vocals', kind: 'clip', sounds: [], sound: '', clip: null, start: 0 }] },
];
const kindOf = (k) => KINDS.find((x) => x.kind === k);
// Which rows are on screen: fixed rows always, scale rows through the window.
const scaleIdx = (l) => l.rows.map((r, i) => (r.midi ? i : -1)).filter((i) => i >= 0);
function shownRows(l) {
  const win = new Set(scaleIdx(l).slice(l.view, l.view + VIEW));
  return l.rows.map((r, i) => ({ row: r, ri: i })).filter((x) => !x.row.midi || win.has(x.ri));
}
function outside(l) { // notes above and below the window, so a hidden note is never a mystery
  const sc = scaleIdx(l), win = sc.slice(l.view, l.view + VIEW);
  const above = l.notes.filter((n) => l.rows[n.row].midi && sc.indexOf(n.row) < l.view).length;
  const below = l.notes.filter((n) => l.rows[n.row].midi && sc.indexOf(n.row) >= l.view + VIEW).length;
  return { above, below, lo: l.rows[win[win.length - 1]]?.label, hi: l.rows[win[0]]?.label };
}

// The layers on screen, in the order they were added. Saved ones are locked; the rest are yours.
let live = [];
const newId = (kind) => kind + '-' + Math.random().toString(36).slice(2, 8).padEnd(6, '0');
const OLD = { melody2: 'melody' }; // ids from before layers had kinds
function makeLayer(kind, id = newId(kind)) {
  const t = kindOf(kind);
  const l = { ...t, id, parts: t.parts(), notes: [], hearAt: 1, editing: 0, by: null, saved: false, muted: false, open: true, kit: t.kits?.[0] };
  const sc = scaleIdx(l); l.view = sc.length ? Math.max(0, Math.min(sc.length - VIEW, sc.filter((i) => l.rows[i].midi[0] > l.top).length)) : 0;
  for (const p of l.parts) { p.level = p.kind === 'drum' ? 1 : 0.8; p.fx = Object.fromEntries(Object.keys(FX).map((k) => [k, 0])); }
  if (ctx) plumb(l);
  live.push(l); return l;
}
const label = (l) => { const same = live.filter((x) => x.kind === l.kind); return same.length > 1 ? `${l.who} ${same.indexOf(l) + 1}` : l.who; };
const byId = (id) => live.find((l) => l.id === id);
const partOf = (l, row) => l.parts[row.part ?? 0];
const mine = (l) => mode === 'solo' || !l.saved;
const unsaved = () => live.filter((l) => !l.saved);
let mode = null;

// ---- sound: a chain a part, then a listen volume a layer, then one limiter over all ----
let ctx, master, meter;
const gainOf = (v) => v * v * 0.4; // slider half way -> 0.1, full -> 0.4 (Wes: "to put it at a reasonable volume you have to put it at like 10%")
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
  try { build(); } catch (e) { ctx = null; say('Sound could not start: ' + (e.stack || e)); throw e; }
}
function build() {
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = gainOf(+document.getElementById('masterVol').value);
  meter = limiter(-3);
  master.connect(meter).connect(ctx.destination);
  for (const l of live) plumb(l);
  setInterval(() => document.getElementById('peak').classList.toggle('hot', meter.reduction < -1), 80);
}
function plumb(l) { // the audio chain of one layer. Two volumes: the maker's (a part's fader) and the listener's (listen, only on this screen).
  l.listen = ctx.createGain(); l.listen.gain.value = l.hearAt; l.listen.connect(master);
  for (const p of l.parts) {
    p.input = ctx.createGain();
    if (p.kind === 'synth') { p.inst = new K.Synth(ctx); p.inst.output.connect(p.input); }
    p.fader = ctx.createGain(); p.fader.gain.value = p.level;
    p.fader.connect(limiter(-6)).connect(l.listen);
    p.rack = new K.Rack(ctx, p.input, p.fader); p.rack.setTempo(bpm);
    setSound(p, p.sound);
    if (p.kind === 'clip' && p.clip) loadClip(p).then(draw);
  }
}
function unplumb(l) { l.listen?.disconnect(); for (const p of l.parts) { p.inst?.allOff(); p.fader?.disconnect(); } }
function setSound(p, s) {
  p.sound = s;
  if (!ctx) return;
  if (p.kind === 'synth') p.inst.load(preset(s).synth);
  else if (p.kind === 'drum') buffer(p.sounds.find((x) => x.name === s));
  applyFx(p);
}
function applyFx(p) {
  if (!ctx) return;
  const base = p.kind === 'drum' ? DRUM_SQUEEZE : p.kind === 'clip' ? [] : preset(p.sound).rack;
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
    for (const l of live) {
      if (l.muted) continue;
      for (const n of l.notes) if (n.start === t) sound(l, n, nextAt);
      const p = l.parts[0];
      if (p.kind === 'clip' && p.buf && t === p.start) { const src = ctx.createBufferSource(); src.buffer = p.buf; src.connect(p.input); src.start(nextAt); src.stop(nextAt + TICKS * tickDur()); }
      if (p.arm && t === 0) armed(p, nextAt);
    }
    setTimeout(() => mark(t), Math.max(0, (nextAt - ctx.currentTime) * 1000));
    tickAt = (tickAt + 1) % TICKS; nextAt += tickDur();
  }
}
function play() {
  boot();
  if (playing) { playing = false; clearInterval(timer); mark(-1); live.forEach((l) => l.parts.forEach((p) => p.inst?.allOff())); }
  else { playing = true; tickAt = 0; nextAt = ctx.currentTime + 0.05; timer = setInterval(tick, 25); tick(); }
  document.getElementById('play').textContent = playing ? 'Stop' : 'Play';
}
function setBpm(v) {
  bpm = Math.min(200, Math.max(60, Math.round(v) || 120));
  document.getElementById('bpm').value = bpm;
  if (ctx) live.forEach((l) => l.parts.forEach((p) => p.rack?.setTempo(bpm)));
}

// ---- vocals (Wes: "Let people add vocals"): record one loop with the mic, or a sound file. Travels in the loop as base64. ----
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
async function loadClip(p) { try { p.buf = await ctx.decodeAudioData(unb64(p.clip.data)); } catch (e) { say('That sound could not be read: ' + e.message); p.buf = null; } }
async function setClip(p, blob) {
  if (blob.size > 1.2e6) { say('That file is too big (1.2 MB at most). Record it here, or trim it.'); return; }
  boot(); p.clip = { mime: blob.type || 'audio/webm', data: b64(await blob.arrayBuffer()) }; p.buf = null;
  await loadClip(p); say(''); draw();
}
async function record(p) {
  boot(); say('');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { say('No microphone here (' + e.name + '). In the desktop app the mic needs version 0.5.7 or newer. Or drop a sound file on the row.'); return; }
  const rec = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 } : {});
  const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); p.arm = null; setClip(p, new Blob(chunks, { type: rec.mimeType })); };
  p.arm = rec; if (!playing) play(); say('Recording starts at the top of the loop, for one loop. Get ready.'); draw();
}
function armed(p, at) { // the loop is about to hit tick 0: start the recorder there, stop it one loop later
  const rec = p.arm; p.arm = null;
  setTimeout(() => { rec.start(); say('Recording...'); setTimeout(() => rec.state === 'recording' && rec.stop(), TICKS * tickDur() * 1000); }, Math.max(0, (at - ctx.currentTime) * 1000));
}

// ---- screen ----
const layersEl = document.getElementById('layers');
document.getElementById('chordNames').innerHTML = CHORDS.map((c) => `<span>${c.name}</span>`).join('');
document.getElementById('add').innerHTML = KINDS.map((k) => `<button data-add="${k.kind}" style="--c:${k.color}">+ ${k.who}</button>`).join('');
document.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { const l = makeLayer(b.dataset.add); draw(); l.el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); working(); }; });
const fits = (l, row, tick) => !!row.midi && chordAt(tick).tones.includes(row.midi[0] % 12);
const rangeText = (l) => { const o = outside(l); return `${o.lo} to ${o.hi}` + (o.above ? `, ${o.above} above` : '') + (o.below ? `, ${o.below} below` : ''); };
const noteWidth = (ticks) => { const n = ticks / per(); return `calc(${n * 100}% + ${(n - 1) * 2}px)`; };
function draw() {
  layersEl.replaceChildren(...live.map((l) => {
    const own = mine(l), el = document.createElement('div'), p = l.parts[l.editing];
    l.el = el;
    el.className = 'layer' + (l.saved ? ' locked' : '') + (l.open ? '' : ' shut');
    el.style.setProperty('--c', l.color);
    const state = l.saved ? `${l.by} did this` : own ? l.hint : '';
    const dis = own ? '' : 'disabled';
    const knob = (k, v, max = 1) => `<label class="knob ${v > 0 ? 'on' : ''}">${k}<input type="range" min="0" max="${max}" step="0.05" value="${v}" data-k="${k}" ${dis}></label>`;
    el.innerHTML = `<div class="who">${label(l)}<small>${state}</small>
      <div class="ctl">
      ${l.top !== undefined ? `<div class="tabs"><button data-oct="-1" ${dis}>&#9650; higher</button><button data-oct="1" ${dis}>&#9660; lower</button><span class="range">${rangeText(l)}</span></div>` : ''}
      ${p.kind === 'clip' ? `<div class="tabs"><button data-rec ${dis}>${p.arm ? 'Waiting for the top...' : 'Record one loop'}</button><label class="file"><input type="file" accept="audio/*" data-file ${dis} hidden>or pick a file</label></div>
        <label class="knob on">start<input type="range" min="0" max="${TICKS - 1}" step="1" value="${p.start}" data-k="start" ${dis}></label>` : ''}
      ${l.kits ? `<select data-kit ${dis}>${l.kits.map((k) => `<option value="${k}" ${k === l.kit ? 'selected' : ''}>${k} kit</option>`).join('')}</select>` : ''}
      ${l.parts.length > 1 ? `<div class="tabs">${l.parts.map((q, i) => `<button data-tab="${i}" class="${i === l.editing ? 'on' : ''}">${q.label}</button>`).join('')}</div>` : ''}
      ${p.sounds.length ? `<select data-sound ${dis}>${p.sounds.map((s) => `<option ${soundName(s) === p.sound ? 'selected' : ''}>${soundName(s)}</option>`).join('')}</select>` : ''}
      <div class="knobs">${knob('volume', p.level, 1.5)}${Object.keys(FX).map((k) => knob(k, p.fx[k])).join('')}</div>
      </div>
      ${own ? '' : `<label class="knob on" title="Only you hear this change">hear at<input type="range" min="0" max="1.5" step="0.05" value="${l.hearAt}" data-k="hearAt"></label>`}
      ${own && loop ? '<button class="take" data-save>Save it</button>' : ''}
      ${own ? '<button data-clear>Clear</button><button data-drop>Drop it</button>' : ''}
      ${!own ? `<button data-mute>${l.muted ? 'Unmute' : 'Mute'}</button><button data-open>${l.open ? 'Hide knobs' : 'Knobs'}</button>` : ''}
    </div><div class="rows" style="--cols:${cols}"></div>`;
    el.querySelector('[data-kit]')?.addEventListener('change', (e) => { boot(); setKit(l, e.target.value); draw(); });
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { l.editing = +b.dataset.tab; draw(); }; });
    el.querySelector('[data-sound]')?.addEventListener('change', (e) => { boot(); setSound(p, e.target.value); });
    el.querySelectorAll('[data-oct]').forEach((b) => { b.onclick = () => { const n = scaleIdx(l).length - VIEW; l.view = Math.max(0, Math.min(n, l.view + 7 * +b.dataset.oct)); draw(); }; });
    el.querySelector('[data-rec]')?.addEventListener('click', () => record(p));
    el.querySelector('[data-file]')?.addEventListener('change', (e) => { if (e.target.files[0]) setClip(p, e.target.files[0]); });
    el.querySelectorAll('input[type=range]').forEach((r) => {
      r.oninput = (e) => {
        const v = +e.target.value, k = r.dataset.k; r.parentElement.classList.toggle('on', v > 0);
        if (k === 'volume') { p.level = v; if (p.fader) p.fader.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
        if (k === 'hearAt') { l.hearAt = v; if (l.listen) l.listen.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
        if (k === 'start') { p.start = v; draw(); }
      };
      r.onchange = (e) => { if (r.dataset.k in FX) { boot(); p.fx[r.dataset.k] = +e.target.value; applyFx(p); } };
    });
    el.querySelector('[data-clear]')?.addEventListener('click', () => { l.notes = []; draw(); });
    el.querySelector('[data-drop]')?.addEventListener('click', () => { unplumb(l); live = live.filter((x) => x !== l); draw(); working(); });
    el.querySelector('[data-save]')?.addEventListener('click', () => save([l]));
    el.querySelector('[data-mute]')?.addEventListener('click', () => { l.muted = !l.muted; draw(); });
    el.querySelector('[data-open]')?.addEventListener('click', () => { l.open = !l.open; draw(); });
    const rows = el.querySelector('.rows');
    for (const { row, ri } of shownRows(l)) {
      const r = document.createElement('div'); r.className = 'row' + (row.gap ? ' gap' : ''); r.dataset.r = ri;
      r.innerHTML = `<span class="label ${l.parts.length > 1 && row.part === l.editing ? 'part' : ''}">${row.label}</span>`;
      for (let c = 0; c < cols; c++) {
        const t = c * per(), cell = document.createElement('div');
        cell.className = 'cell' + (t % 8 === 0 ? ' beat' : '') + (fits(l, row, t) ? ' fits' : ''); cell.dataset.t = t; cell.title = row.label;
        const n = row.clip ? (p.buf && t === p.start ? { len: Math.min(TICKS - t, Math.ceil(p.buf.duration / tickDur())) } : null) : l.notes.find((n) => n.row === ri && n.start === t);
        if (n) { const d = document.createElement('div'); d.className = 'note'; d.style.width = noteWidth(n.len); cell.append(d); }
        r.append(cell);
      }
      if (own && row.part !== undefined) dropZone(l, row, r);
      rows.append(r);
    }
    if (own) wire(l, rows);
    return el;
  }));
  const n = unsaved().length, others = Object.entries(loop?.working ?? {}).filter(([who]) => who !== me());
  document.getElementById('turn').innerHTML =
    (mode === 'solo' ? (live.length ? `${live.length} layer${live.length === 1 ? '' : 's'}, all yours` : 'Add a layer')
    : n ? `${n} of yours not saved yet` : live.length ? `${live.length} layer${live.length === 1 ? '' : 's'}. Add one, or listen.` : 'Nothing yet. Add a layer.')
    + (others.length ? ` <small>${others.map(([who, w]) => `${who} is on ${w.kinds}`).join(', ')} right now</small>` : '');
  document.getElementById('pass').hidden = !(loop && n > 1);
  document.getElementById('bpm').disabled = !(mode === 'solo' || n > 0);
  document.getElementById('del').hidden = !(loop && keyOf(loop.id));
}
// Drop a .wav from your own folders onto a drum row: it becomes that row's sound, here only.
function dropZone(l, row, r) {
  r.ondragover = (e) => { e.preventDefault(); r.classList.add('drop'); };
  r.ondragleave = () => r.classList.remove('drop');
  r.ondrop = async (e) => {
    e.preventDefault(); r.classList.remove('drop');
    const file = e.dataTransfer.files[0]; if (!file) return;
    boot();
    const p = partOf(l, row);
    if (p.kind === 'clip') return setClip(p, file);
    const sample = { name: 'my ' + file.name.replace(/\.[^.]+$/, ''), file: await file.arrayBuffer() };
    p.sounds = [sample, ...p.sounds]; l.editing = row.part; setSound(p, sample.name); draw();
  };
}
// Put a note down on press, stretch it while dragging right, take it away on a click. A press on a drum row also picks that sound for the sliders.
let drag = null; // outlives a redraw
function wire(l, rows) {
  const at = (e) => { const c = e.target.closest('.cell'); return c && { row: +c.parentElement.dataset.r, t: +c.dataset.t }; };
  rows.onpointerdown = (e) => {
    const p = at(e); if (!p) return;
    const row = l.rows[p.row]; if (row.clip) return;
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
    rows.querySelector(`.row[data-r="${drag.row}"] .cell[data-t="${drag.start}"] .note`)?.style.setProperty('width', noteWidth(len));
  };
  rows.onpointerup = () => { drag = null; };
}
function mark(t) {
  document.querySelectorAll('.cell.now').forEach((c) => c.classList.remove('now'));
  if (t >= 0 && t % per() === 0) document.querySelectorAll(`.cell[data-t="${t}"]`).forEach((c) => c.classList.add('now'));
}
function begin(m) {
  mode = m; setBpm(120);
  live.forEach(unplumb); live = [];
  if (m === 'solo') for (const k of ['bass', 'kicks', 'hats', 'pads', 'melody']) makeLayer(k);
  document.getElementById('start').hidden = true; document.getElementById('game').hidden = false;
  document.getElementById('sub').textContent = (m === 'solo' ? 'Every layer is yours; add as many as you like. ' : 'Add a layer, make it, save it; add another if you like. Saved layers lock. Whoever saves last sets the BPM. ')
    + 'Click a box to put a note down, drag right to make it longer, click a note to take it away. On a drum layer, the sliders work on the sound whose tab is lit; drop a .wav of your own onto a drum row to use it. Space plays and stops.';
  document.getElementById('link').hidden = m === 'solo';
  draw();
}

// ---- loops for friends: saved on the box by store/store.mjs, under api/ next to this page ----
// Wes: "an individual session that's like saved... I finish my part... someone else can jump in pick up that session
// do the instrument they want... over the course of the day people can jump back in and see how it's progressing."
let loop = null, watch = null; // the open loop as the box last sent it, and the timer that asks again
window.onerror = (m, src, line) => say(`${m} (${(src || '').split('/').pop()}:${line})`);
window.onunhandledrejection = (e) => say('' + (e.reason?.stack || e.reason));
const say = (t) => { const m = document.getElementById('msg'); m.textContent = t; m.hidden = !t; };
const nameEl = document.getElementById('name');
const stored = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; }; // a frame may have no storage
nameEl.value = stored('pa.name') || '';
nameEl.onchange = () => stored('pa.name', nameEl.value.trim());
const me = () => nameEl.value.trim() || 'someone';
const keyOf = (id) => stored('pa.key.' + id); // the creator's key for a loop: whoever started it on this screen can delete it
const api = async (path, method = 'GET', body, key) => {
  const headers = { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'x-key': key } : {}) };
  const r = await fetch('api/' + path, { method, headers, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(data.error || r.status);
  return { status: r.status, data };
};
const soundName = (s) => typeof s === 'string' ? s : s.name;
const pack = (l) => ({ kind: l.kind, by: me(), bpm, kit: l.kit, notes: l.notes.map(({ row, start, len }) => ({ row, start, len })),
  parts: l.parts.map((p) => ({ sound: soundName(p.sound), level: p.level, fx: p.fx, ...(p.kind === 'clip' ? { clip: p.clip, start: p.start } : {}) })) });
// Put a loop from the box onto the screen: saved layers come in, yours stay as they are. A dropped .wav never travels, so a
// sound nobody else has falls back to the kit's first.
function apply(data) {
  loop = data; setBpm(loop.bpm);
  for (const [id, s] of Object.entries(loop.layers).sort((a, b) => a[1].at - b[1].at)) {
    if (byId(id)?.saved) continue;
    const kind = kindOf(s.kind) ? s.kind : kindOf(OLD[id] ?? id) ? OLD[id] ?? id : null; if (!kind) continue;
    const l = byId(id) ?? makeLayer(kind, id);
    l.saved = true; l.open = false; l.by = s.by; l.notes = s.notes;
    if (l.kits && l.kits.includes(s.kit)) l.kit = s.kit;
    l.parts.forEach((p, i) => {
      const q = s.parts[i]; if (!q) return;
      p.level = q.level; p.fader?.gain.setTargetAtTime(q.level, ctx.currentTime, 0.02);
      for (const k in p.fx) p.fx[k] = q.fx[k] ?? 0;
      if (p.kind === 'clip') { p.clip = q.clip || null; p.start = q.start || 0; p.buf = null; if (ctx && p.clip) loadClip(p).then(draw); return; }
      const known = p.sounds.some((x) => soundName(x) === q.sound);
      p.sound = known ? q.sound : p.kind === 'drum' ? kitFirst(l.kit, p.cat).name : p.sound;
      setSound(p, p.sound);
    });
  }
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
  watch = setInterval(async () => { // see how it is going: new saved layers come in under yours; who is working shows at the top
    if (document.getElementById('game').hidden) return;
    const r = await api('loops/' + loop.id).catch(() => null);
    if (r?.status === 200 && (r.data.updated !== loop.updated || JSON.stringify(r.data.working) !== JSON.stringify(loop.working))) apply(r.data);
    if (r?.status === 404) say('This loop was deleted.');
    working();
  }, 15000);
}
// Tell the box what you are on, so friends on the same loop see it ("how does it work when multiple people are working").
let toldAt = 0;
function working() {
  if (!loop) return;
  const kinds = [...new Set(unsaved().map((l) => l.who.toLowerCase()))].join(' and ');
  if (!kinds && !toldAt) return;
  api(`loops/${loop.id}/working`, 'POST', { by: me(), kinds }).catch(() => {});
  toldAt = kinds ? Date.now() : 0;
}
async function save(layers) {
  if (!loop) return;
  let data = null;
  for (const l of layers) {
    let r;
    try { r = await api(`loops/${loop.id}/${l.id}`, 'PUT', pack(l)); }
    catch (e) { say(`Could not save ${label(l)}: ${e.message}`); return; }
    if (r.status === 409) { l.id = newId(l.kind); return save([l]); } // the same id twice: once in a blue moon; try a new one
    data = r.data;
  }
  if (data) apply(data); working();
}
async function showLoops() {
  const el = document.getElementById('loops');
  const r = await api('loops').catch(() => null);
  if (!r) { el.innerHTML = ''; return; } // opened from a plain file: solo still works
  const when = (t) => { const h = (Date.now() - t) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)} h ago` : `${Math.floor(h / 24)} d ago`; };
  el.innerHTML = r.data.length ? '<h2>Loops</h2>' + r.data.map((x) => {
    const byWho = {}; for (const v of Object.values(x.done)) (byWho[v.by] ??= []).push(kindOf(v.kind)?.who.toLowerCase() ?? v.kind);
    const who = Object.entries(byWho).map(([w, ks]) => `${w}: ${ks.join(', ')}`).join('; ');
    const n = Object.keys(x.done).length, now = Object.entries(x.working ?? {}).map(([w, v]) => `${w} is on ${v.kinds} right now`).join(', ');
    return `<div class="loop"><div>${x.name} <small>${x.bpm} bpm, started by ${x.by} ${when(x.updated)}. ${n ? `${n} layer${n === 1 ? '' : 's'}: ${who}` : 'nothing yet'}${now ? '. ' + now : ''}</small></div>
      <span>${keyOf(x.id) ? `<button data-del="${x.id}">Delete</button> ` : ''}<button data-open="${x.id}">${n ? 'Jump in' : 'Start it'}</button></span></div>`;
  }).join('') : '<h2>No loops yet</h2>';
  el.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openLoop(b.dataset.open); });
  el.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => del(b.dataset.del, b); });
}
// Delete needs two clicks (no confirm boxes in a frame) and the creator's key.
async function del(id, b) {
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Really delete?'; setTimeout(() => { b.dataset.sure = ''; b.textContent = b.id === 'del' ? 'Delete this loop' : 'Delete'; }, 4000); return; }
  try { await api('loops/' + id, 'DELETE', null, keyOf(id)); } catch (e) { say('Could not delete: ' + e.message); return; }
  if (loop?.id === id) document.getElementById('reset').click(); else showLoops();
}
document.getElementById('new').onclick = async () => {
  const name = document.getElementById('loopName').value.trim() || `${me()}'s ${new Date().toLocaleDateString(undefined, { weekday: 'long' })} loop`;
  const { data } = await api('loops', 'POST', { name, by: me(), bpm: 120 });
  stored('pa.key.' + data.id, data.key);
  openLoop(data.id);
};
document.querySelectorAll('#start [data-mode]').forEach((b) => { b.onclick = () => { loop = null; begin(b.dataset.mode); }; });
document.getElementById('play').onclick = play;
document.getElementById('masterVol').oninput = (e) => { boot(); master.gain.setTargetAtTime(gainOf(+e.target.value), ctx.currentTime, 0.02); };
document.getElementById('bpm').onchange = (e) => setBpm(+e.target.value);
document.getElementById('pass').onclick = () => save(unsaved());
document.getElementById('del').onclick = (e) => del(loop.id, e.target);
document.getElementById('reset').onclick = () => { if (playing) play(); loop = null; clearInterval(watch); toldAt = 0; history.replaceState(null, '', location.pathname); document.getElementById('game').hidden = true; document.getElementById('start').hidden = false; showLoops(); };
setInterval(working, 20000);
const wanted = new URLSearchParams(location.search).get('s');
if (wanted && /^[a-z0-9]{10}$/.test(wanted)) openLoop(wanted); else showLoops();
// Finer boxes: notes already down stay where they are; a note on an off-box tick still plays, it just cannot be grabbed until the grid is fine again.
document.getElementById('fine').onchange = (e) => { cols = e.target.checked ? 64 : 32; draw(); };
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && mode && !['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); play(); } });

// inside Scryproof's Activities frame: tell the app we are up, or it shows "loading" forever
if (window.parent !== window) window.parent.postMessage({ type: 'scryproof-activity', game: 'pass-along', status: 'ready' }, '*');

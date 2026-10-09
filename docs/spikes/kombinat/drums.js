// DRUMS: an eight-pad analogue-style drum machine. Every pad is synthesized until you drop a sample on it;
// then the pad plays that file and TUNE / DECAY / TONE / LEVEL / PAN still apply.
// Recipes follow the TR-808 / TR-909 block diagrams (sine kick with pitch drop, tuned-sine + noise snare,
// multi-burst noise clap, six-square-wave metallic hats, pitch-dropping toms, short square rimshot).
window.K = window.K || {};

K.DRUM_PADS = [
  { id: 'kick', name: 'KICK', key: 'A' }, { id: 'snare', name: 'SNARE', key: 'S' }, { id: 'clap', name: 'CLAP', key: 'D' },
  { id: 'chat', name: 'CL HAT', key: 'F' }, { id: 'ohat', name: 'OP HAT', key: 'G' }, { id: 'ltom', name: 'LO TOM', key: 'H' },
  { id: 'htom', name: 'HI TOM', key: 'J' }, { id: 'rim', name: 'RIM', key: 'K' }
];
K.DRUM_BASE = 36;   // MIDI note of pad 0
K.PAD_DEFAULT = { tune: 0, decay: 0.5, tone: 0.5, level: 0.8, pan: 0 };

K.Drums = class Drums {
  constructor(ctx) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.pads = K.DRUM_PADS.map(() => Object.assign({}, K.PAD_DEFAULT));
    this.kit = '808';
    this.chans = this.pads.map(() => {
      const g = ctx.createGain(), pan = ctx.createStereoPanner();
      g.connect(pan); pan.connect(this.output);
      return { g, pan };
    });
    this.pads.forEach((p, i) => this.applyPad(i));
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // shared saturation curve for the kick
    const n = 1024; this.satCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; this.satCurve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    this.openHat = null;
    this.onHit = null;
    this.samples = K.DRUM_PADS.map(() => null);   // per pad: { buffer, name, data } or null
    this.onSample = null;
  }
  // ---- params
  set(i, key, v) { this.pads[i][key] = v; this.applyPad(i); }
  applyPad(i) {
    const p = this.pads[i], c = this.chans[i], now = this.ctx.currentTime;
    c.g.gain.setTargetAtTime(p.level, now, 0.01);
    c.pan.pan.setTargetAtTime(p.pan, now, 0.01);
  }
  state() { return { kit: this.kit, pads: this.pads.map(p => Object.assign({}, p)), samples: this.samples.map(x => x ? { name: x.name, data: x.data } : null) }; }
  async load(s) {
    if (!s) return;
    if (s.samples) for (let i = 0; i < this.samples.length; i++) { const x = s.samples[i]; if (x && x.data) { try { await this.loadSampleData(i, x.name, x.data); } catch (e) { this.samples[i] = null; } } else this.samples[i] = null; }
    this.kit = s.kit || this.kit;
    (s.pads || []).forEach((p, i) => { if (this.pads[i]) Object.assign(this.pads[i], K.PAD_DEFAULT, p); });
    this.pads.forEach((p, i) => this.applyPad(i));
  }
  loadKit(kit) {
    const k = K.KITS[kit]; if (!k) return;
    this.kit = kit;
    K.DRUM_PADS.forEach((pad, i) => { this.pads[i] = Object.assign({}, K.PAD_DEFAULT, k.pads[pad.id] || {}); this.applyPad(i); });
  }
  // ---- samples
  async loadSample(i, file) {
    const ab = await file.arrayBuffer();
    await this.loadSampleData(i, file.name, K.Sampler.toBase64(ab), ab);
  }
  async loadSampleData(i, name, b64, ab) {
    const buf = await this.ctx.decodeAudioData((ab || K.Sampler.fromBase64(b64)).slice(0));
    this.samples[i] = { buffer: buf, name: (name || 'sample').replace(/\.[^.]+$/, ''), data: b64 };
    if (this.onSample) this.onSample(i);
  }
  clearSample(i) { this.samples[i] = null; if (this.onSample) this.onSample(i); }
  padIndex(note) { return ((note - K.DRUM_BASE) % 8 + 8) % 8; }

  // ---- notes
  noteOn(note, vel = 1, time) {
    const t = time !== undefined ? time : this.ctx.currentTime;
    const i = this.padIndex(note), p = this.pads[i], out = this.chans[i].g;
    const id = K.DRUM_PADS[i].id;
    vel = K.clamp(vel, 0, 1);
    if (this.samples[i]) this.play_sample(p, vel, t, out, i, id);
    else this['play_' + id](p, vel, t, out);
    if (this.onHit) this.onHit(i, t);
  }
  noteOff() { }
  allOff() { }
  panic() { if (this.openHat) { try { this.openHat.gain.setTargetAtTime(0, this.ctx.currentTime, 0.005); } catch (e) { } } }
  destroy() { try { this.output.disconnect(); } catch (e) { } }

  // ---- helpers
  tuneHz(base, tune) { return base * Math.pow(2, tune / 12); }
  env(g, peak, t, decay, floor = 0.0005) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(peak, 0.0006), t);
    g.gain.exponentialRampToValueAtTime(floor, t + decay);
  }
  noise(t, dur) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(t); s.stop(t + dur + 0.05); return s; }

  // ---- voices
  play_sample(p, vel, t, out, i, id) {
    const ctx = this.ctx, smp = this.samples[i];
    const src = ctx.createBufferSource(); src.buffer = smp.buffer;
    src.playbackRate.value = Math.pow(2, p.tune / 12);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(120, 20000 * Math.pow(p.tone, 0.8)); lp.Q.value = 0.5;
    const g = ctx.createGain();
    const natural = smp.buffer.duration / src.playbackRate.value;
    const dec = p.decay >= 0.98 ? natural : Math.min(natural, 0.03 + p.decay * 2.2);
    g.gain.setValueAtTime(vel, t);
    g.gain.setValueAtTime(vel, t + dec * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
    src.connect(lp); lp.connect(g); g.connect(out);
    src.start(t); src.stop(t + dec + 0.05);
    if (id === 'chat' && this.openHat) { try { this.openHat.gain.cancelScheduledValues(t); this.openHat.gain.setTargetAtTime(0.0001, t, 0.008); } catch (e) { } this.openHat = null; }
    if (id === 'ohat') this.openHat = g;
  }
  play_kick(p, vel, t, out) {
    const ctx = this.ctx, f0 = this.tuneHz(48, p.tune);
    const dec = 0.12 + p.decay * 1.4;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(f0 * (2.5 + p.tone * 6), t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + 0.025 + p.tone * 0.05);
    const g = ctx.createGain(); this.env(g, vel, t, dec);
    const sat = ctx.createWaveShaper(); sat.curve = this.satCurve; sat.oversample = '2x';
    const pre = ctx.createGain(); pre.gain.value = 0.7 + p.tone * 1.8;
    osc.connect(pre); pre.connect(sat); sat.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + dec + 0.05);
    // click transient
    if (p.tone > 0.05) {
      const n = this.noise(t, 0.02), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const ng = ctx.createGain(); this.env(ng, vel * p.tone * 0.6, t, 0.012);
      n.connect(hp); hp.connect(ng); ng.connect(out);
    }
  }
  play_snare(p, vel, t, out) {
    const ctx = this.ctx;
    const f1 = this.tuneHz(185, p.tune), f2 = this.tuneHz(330, p.tune);
    const bodyDec = 0.08 + p.decay * 0.22, noiseDec = 0.08 + p.decay * 0.5;
    for (const [f, lv] of [[f1, 0.7], [f2, 0.35]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const g = ctx.createGain(); this.env(g, vel * lv * (1 - p.tone * 0.4), t, bodyDec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + bodyDec + 0.05);
    }
    const n = this.noise(t, noiseDec);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900 + p.tone * 4500; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000 + p.tone * 8000;
    const g = ctx.createGain(); this.env(g, vel * (0.5 + p.tone * 0.5), t, noiseDec);
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
  }
  play_clap(p, vel, t, out) {
    const ctx = this.ctx;
    const n = this.noise(t, 0.9);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = this.tuneHz(1000 + p.tone * 1400, p.tune); bp.Q.value = 1.2 + p.tone;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const gap = 0.011;
    for (let k = 0; k < 3; k++) {
      g.gain.setValueAtTime(vel * 0.9, t + k * gap);
      g.gain.exponentialRampToValueAtTime(0.05, t + k * gap + gap * 0.9);
    }
    const tailStart = t + 3 * gap, tail = 0.08 + p.decay * 0.6;
    g.gain.setValueAtTime(Math.max(vel, 0.001), tailStart);
    g.gain.exponentialRampToValueAtTime(0.0005, tailStart + tail);
    n.connect(bp); bp.connect(g); g.connect(out);
  }
  hat(p, vel, t, out, open) {
    const ctx = this.ctx;
    const f0 = this.tuneHz(40, p.tune);
    const dec = open ? 0.18 + p.decay * 0.9 : 0.02 + p.decay * 0.14;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6000 + p.tone * 6000; bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000 + p.tone * 3000;
    const g = ctx.createGain(); this.env(g, vel * 0.6, t, dec);
    bp.connect(hp); hp.connect(g); g.connect(out);
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f0 * r;
      o.connect(bp); o.start(t); o.stop(t + dec + 0.05);
    }
    return g;
  }
  play_chat(p, vel, t, out) {
    if (this.openHat) { try { this.openHat.gain.cancelScheduledValues(t); this.openHat.gain.setTargetAtTime(0.0001, t, 0.008); } catch (e) { } this.openHat = null; }
    this.hat(p, vel, t, out, false);
  }
  play_ohat(p, vel, t, out) { this.openHat = this.hat(p, vel, t, out, true); }
  tom(p, vel, t, out, base) {
    const ctx = this.ctx, f0 = this.tuneHz(base, p.tune), dec = 0.12 + p.decay * 0.6;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0 * (1.6 + p.tone), t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.05 + p.tone * 0.08);
    const g = ctx.createGain(); this.env(g, vel, t, dec);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.05);
    const n = this.noise(t, 0.05), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
    const ng = ctx.createGain(); this.env(ng, vel * 0.15 * (0.5 + p.tone), t, 0.03);
    n.connect(lp); lp.connect(ng); ng.connect(out);
  }
  play_ltom(p, vel, t, out) { this.tom(p, vel, t, out, 95); }
  play_htom(p, vel, t, out) { this.tom(p, vel, t, out, 165); }
  play_rim(p, vel, t, out) {
    const ctx = this.ctx, dec = 0.018 + p.decay * 0.06;
    for (const [f, type, lv] of [[this.tuneHz(1750, p.tune), 'square', 0.35], [this.tuneHz(470, p.tune), 'triangle', 0.6]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain(); this.env(g, vel * lv, t, dec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.05);
    }
    const n = this.noise(t, 0.02), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000 + p.tone * 5000;
    const ng = ctx.createGain(); this.env(ng, vel * 0.4, t, 0.012);
    n.connect(hp); hp.connect(ng); ng.connect(out);
  }
};

// Kits: per-pad overrides of K.PAD_DEFAULT.
K.KITS = {
  '808': { name: '808', pads: {
    kick: { tune: -2, decay: 0.75, tone: 0.25, level: 0.95 }, snare: { tune: 0, decay: 0.45, tone: 0.45, level: 0.7 }, clap: { decay: 0.4, tone: 0.4, level: 0.7 },
    chat: { decay: 0.25, tone: 0.5, level: 0.5 }, ohat: { decay: 0.45, tone: 0.5, level: 0.45 }, ltom: { decay: 0.5, tone: 0.3, level: 0.7, pan: -0.3 }, htom: { decay: 0.45, tone: 0.3, level: 0.7, pan: 0.3 }, rim: { decay: 0.3, tone: 0.5, level: 0.6 } } },
  '909': { name: '909', pads: {
    kick: { tune: 2, decay: 0.35, tone: 0.7, level: 0.95 }, snare: { tune: 2, decay: 0.35, tone: 0.7, level: 0.75 }, clap: { decay: 0.5, tone: 0.6, level: 0.7 },
    chat: { decay: 0.2, tone: 0.7, level: 0.5 }, ohat: { decay: 0.55, tone: 0.7, level: 0.45 }, ltom: { decay: 0.4, tone: 0.6, level: 0.7, pan: -0.3 }, htom: { decay: 0.35, tone: 0.6, level: 0.7, pan: 0.3 }, rim: { decay: 0.4, tone: 0.7, level: 0.6 } } },
  'electro': { name: 'ELECTRO', pads: {
    kick: { tune: 4, decay: 0.2, tone: 0.9, level: 0.95 }, snare: { tune: 5, decay: 0.2, tone: 0.9, level: 0.75 }, clap: { decay: 0.25, tone: 0.8, level: 0.7 },
    chat: { decay: 0.1, tone: 0.9, level: 0.5 }, ohat: { decay: 0.3, tone: 0.9, level: 0.45 }, ltom: { tune: 3, decay: 0.25, tone: 0.9, level: 0.7, pan: -0.4 }, htom: { tune: 3, decay: 0.2, tone: 0.9, level: 0.7, pan: 0.4 }, rim: { decay: 0.2, tone: 0.9, level: 0.6 } } },
  'lofi': { name: 'LO-FI', pads: {
    kick: { tune: -4, decay: 0.4, tone: 0.1, level: 0.9 }, snare: { tune: -3, decay: 0.3, tone: 0.15, level: 0.7 }, clap: { decay: 0.3, tone: 0.1, level: 0.6 },
    chat: { decay: 0.15, tone: 0.1, level: 0.4 }, ohat: { decay: 0.35, tone: 0.1, level: 0.35 }, ltom: { tune: -4, decay: 0.35, tone: 0.1, level: 0.6, pan: -0.3 }, htom: { tune: -4, decay: 0.3, tone: 0.1, level: 0.6, pan: 0.3 }, rim: { decay: 0.3, tone: 0.2, level: 0.5 } } },
  'boom': { name: 'BOOM', pads: {
    kick: { tune: -7, decay: 1, tone: 0.35, level: 1 }, snare: { tune: -1, decay: 0.6, tone: 0.35, level: 0.7 }, clap: { decay: 0.7, tone: 0.3, level: 0.6 },
    chat: { decay: 0.3, tone: 0.35, level: 0.45 }, ohat: { decay: 0.7, tone: 0.35, level: 0.4 }, ltom: { tune: -5, decay: 0.7, tone: 0.3, level: 0.7, pan: -0.3 }, htom: { tune: -5, decay: 0.6, tone: 0.3, level: 0.7, pan: 0.3 }, rim: { decay: 0.5, tone: 0.4, level: 0.5 } } },
};

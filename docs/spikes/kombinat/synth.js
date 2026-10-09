// SAW-1: a two-oscillator subtractive synth in the Sawer / Polivoks tradition.
// One Voice per held note. Everything routes: oscs -> filter -> amp -> tremolo -> synth.output
window.K = window.K || {};

K.midiToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);
K.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

K.SYNTH_DEFAULTS = {
  osc1: { wave: 'sawtooth', oct: 0, semi: 0, fine: 0, level: 0.8, unison: 1, spread: 18 },
  osc2: { wave: 'sawtooth', oct: -1, semi: 0, fine: 6, level: 0.5, unison: 1, spread: 18 },
  sub: { level: 0 },
  noise: { level: 0 },
  filter: { type: 'lowpass', cutoff: 1400, res: 2, env: 0.45, keytrack: 0.5 },
  fenv: { a: 0.005, d: 0.35, s: 0.2, r: 0.4 },
  aenv: { a: 0.005, d: 0.25, s: 0.8, r: 0.35 },
  lfo: { wave: 'sine', rate: 5, depth: 0, target: 'cutoff' },
  play: { mode: 'poly', glide: 0.05 },
  out: { level: 0.6 }
};

K.Synth = class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.p = JSON.parse(JSON.stringify(K.SYNTH_DEFAULTS));
    this.output = ctx.createGain();
    this.output.gain.value = this.p.out.level;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.voices = new Map();      // note -> Voice (newest)
    this.all = new Set();         // every live voice incl. releasing
    this.held = [];               // mono note stack

    // Shared LFO
    this.lfo = ctx.createOscillator();
    this.lfo.type = this.p.lfo.wave;
    this.lfo.frequency.value = this.p.lfo.rate;
    this.lfoPitch = ctx.createGain();   // -> osc.detune (cents)
    this.lfoCut = ctx.createGain();     // -> filter.detune (cents)
    this.lfoAmp = ctx.createGain();     // -> tremolo gain
    this.lfo.connect(this.lfoPitch); this.lfo.connect(this.lfoCut); this.lfo.connect(this.lfoAmp);
    this.lfo.start();
    this.applyLfo();

    // Shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Pulse wave (25%) as a PeriodicWave
    const N = 64, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { re[n] = 0; im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25); }
    this.pulseWave = ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }

  // ---- parameters ------------------------------------------------------
  get(path) { const [a, b] = path.split('.'); return this.p[a][b]; }
  set(path, v) {
    const [a, b] = path.split('.');
    this.p[a][b] = v;
    const now = this.ctx.currentTime;
    switch (a) {
      case 'out': this.output.gain.setTargetAtTime(v, now, 0.01); break;
      case 'lfo': this.applyLfo(); break;
      case 'filter':
        this.all.forEach(vc => vc.applyFilter(b));
        break;
      case 'osc1': case 'osc2': case 'sub': case 'noise':
        this.all.forEach(vc => vc.applyOsc(a, b));
        break;
    }
  }
  loadParams(p) {
    const merged = JSON.parse(JSON.stringify(K.SYNTH_DEFAULTS));
    for (const g in p) Object.assign(merged[g], p[g]);
    this.p = merged;
    this.output.gain.setTargetAtTime(this.p.out.level, this.ctx.currentTime, 0.01);
    this.applyLfo();
    this.all.forEach(vc => vc.kill());
    this.all.clear(); this.voices.clear(); this.held = [];
  }
  applyLfo() {
    const l = this.p.lfo, now = this.ctx.currentTime;
    if (this.lfo.type !== l.wave) this.lfo.type = l.wave;
    this.lfo.frequency.setTargetAtTime(l.rate, now, 0.02);
    const dep = l.depth;
    this.lfoPitch.gain.setTargetAtTime(l.target === 'pitch' ? dep * 100 : 0, now, 0.02);     // up to +/-1 semitone... times depth
    this.lfoCut.gain.setTargetAtTime(l.target === 'cutoff' ? dep * 3600 : 0, now, 0.02);    // up to +/-3 octaves
    this.lfoAmp.gain.setTargetAtTime(l.target === 'amp' ? dep * 0.5 : 0, now, 0.02);
  }

  // ---- notes ----------------------------------------------------------
  noteOn(note, vel = 1, time) {
    const t = time !== undefined ? time : this.ctx.currentTime;
    if (this.p.play.mode === 'mono') {
      this.held.push(note);
      const live = [...this.all].find(v => !v.releasing);
      if (live) { live.glideTo(note, t, this.p.play.glide); this.voices.clear(); this.voices.set(note, live); live.note = note; return live; }
    }
    const old = this.voices.get(note);
    if (old) old.release(t);
    const v = new K.Voice(this, note, vel, t);
    v.startAt = t; v.stopAt = Infinity;
    this.voices.set(note, v);
    this.all.add(v);
    // Voice cap: steal the oldest voice that is still sounding at time t. (During export every note is scheduled
    // up front, so counting every voice ever created would kill notes that have not played yet.)
    const live = [...this.all].filter(x => x.stopAt > t && x !== v);
    if (live.length >= 12) live[0].kill(t);
    return v;
  }
  noteOff(note, time) {
    const t = time !== undefined ? time : this.ctx.currentTime;
    if (this.p.play.mode === 'mono') {
      this.held = this.held.filter(n => n !== note);
      const v = this.voices.get(note);
      if (!v) return;
      if (this.held.length) {
        const back = this.held[this.held.length - 1];
        v.glideTo(back, t, this.p.play.glide);
        this.voices.clear(); this.voices.set(back, v); v.note = back;
        return;
      }
    }
    const v = this.voices.get(note);
    if (!v) return;
    this.voices.delete(note);
    v.release(t);
  }
  allOff() {
    const t = this.ctx.currentTime;
    this.voices.forEach(v => v.release(t));
    this.voices.clear(); this.held = [];
  }
  panic() { this.all.forEach(v => v.kill()); this.all.clear(); this.voices.clear(); this.held = []; }
  state() { return JSON.parse(JSON.stringify(this.p)); }
  load(p) { this.loadParams(p || {}); }
  destroy() { this.panic(); try { this.lfo.stop(); this.output.disconnect(); } catch (e) { } }
  _done(v) { this.all.delete(v); }
};

K.Voice = class Voice {
  constructor(synth, note, vel, t) {
    const ctx = synth.ctx, p = synth.p;
    this.synth = synth; this.ctx = ctx; this.note = note; this.vel = vel; this.releasing = false;
    this.groups = {};   // osc1/osc2: {oscs:[], gain, panners:[]}
    this.startTime = t;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = p.filter.type;
    this.filter.Q.value = p.filter.res;
    this.amp = ctx.createGain(); this.amp.gain.value = 0;
    this.trem = ctx.createGain(); this.trem.gain.value = 1;
    this.filter.connect(this.amp); this.amp.connect(this.trem); this.trem.connect(synth.output);
    synth.lfoCut.connect(this.filter.detune);
    synth.lfoAmp.connect(this.trem.gain);

    this.buildGroup('osc1', t);
    this.buildGroup('osc2', t);

    // Sub oscillator (sine, one octave under osc1)
    this.sub = ctx.createOscillator(); this.sub.type = 'sine';
    this.sub.frequency.value = this.baseFreq('osc1') / 2;
    this.subGain = ctx.createGain(); this.subGain.gain.value = p.sub.level;
    this.sub.connect(this.subGain); this.subGain.connect(this.filter);
    synth.lfoPitch.connect(this.sub.detune);
    this.sub.start(t);

    // Noise
    this.noise = ctx.createBufferSource(); this.noise.buffer = synth.noiseBuf; this.noise.loop = true;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = p.noise.level * 0.5;
    this.noise.connect(this.noiseGain); this.noiseGain.connect(this.filter);
    this.noise.start(t);

    this.trigger(t);
  }

  baseFreq(g) {
    const o = this.synth.p[g];
    return K.midiToFreq(this.note + o.oct * 12 + o.semi) * Math.pow(2, o.fine / 1200);
  }
  setWave(osc, wave) {
    if (wave === 'pulse') osc.setPeriodicWave(this.synth.pulseWave);
    else osc.type = wave;
  }
  buildGroup(g, t) {
    const ctx = this.ctx, o = this.synth.p[g];
    const n = Math.max(1, Math.round(o.unison));
    const gain = ctx.createGain();
    gain.gain.value = o.level / Math.sqrt(n);
    gain.connect(this.filter);
    const oscs = [], pans = [];
    const f = this.baseFreq(g);
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      this.setWave(osc, o.wave);
      osc.frequency.value = f;
      const pos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;   // -1..1
      osc.detune.value = pos * o.spread;
      this.synth.lfoPitch.connect(osc.detune);
      if (n > 1) {
        const pan = ctx.createStereoPanner(); pan.pan.value = pos * 0.8;
        osc.connect(pan); pan.connect(gain); pans.push(pan);
      } else osc.connect(gain);
      osc.start(t);
      oscs.push(osc);
    }
    this.groups[g] = { oscs, gain, pans, n };
  }
  applyOsc(g, key) {
    const now = this.ctx.currentTime, p = this.synth.p;
    if (g === 'sub') { this.subGain.gain.setTargetAtTime(p.sub.level, now, 0.01); return; }
    if (g === 'noise') { this.noiseGain.gain.setTargetAtTime(p.noise.level * 0.5, now, 0.01); return; }
    const grp = this.groups[g], o = p[g];
    if (key === 'unison' || key === 'spread') {
      // spread is live; unison count only applies to new notes
      grp.oscs.forEach((osc, i) => {
        const pos = grp.n === 1 ? 0 : (i / (grp.n - 1)) * 2 - 1;
        osc.detune.setTargetAtTime(pos * o.spread, now, 0.01);
      });
      return;
    }
    if (key === 'level') { grp.gain.gain.setTargetAtTime(o.level / Math.sqrt(grp.n), now, 0.01); return; }
    if (key === 'wave') { grp.oscs.forEach(osc => this.setWave(osc, o.wave)); return; }
    const f = this.baseFreq(g);
    grp.oscs.forEach(osc => osc.frequency.setTargetAtTime(f, now, 0.01));
    if (g === 'osc1') this.sub.frequency.setTargetAtTime(f / 2, now, 0.01);
  }
  cutoffBase() {
    const f = this.synth.p.filter;
    const kt = Math.pow(2, f.keytrack * (this.note - 60) / 12);
    return K.clamp(f.cutoff * kt, 20, 20000);
  }
  cutoffPeak(base) {
    const f = this.synth.p.filter;
    return K.clamp(base * Math.pow(2, f.env * 5), 20, 20000);
  }
  applyFilter(key) {
    const now = this.ctx.currentTime, f = this.synth.p.filter;
    if (key === 'type') { this.filter.type = f.type; return; }
    if (key === 'res') { this.filter.Q.setTargetAtTime(f.res, now, 0.01); return; }
    // cutoff / env / keytrack: re-aim the filter at its sustain target
    if (this.releasing) return;
    const base = this.cutoffBase(), peak = this.cutoffPeak(base);
    const sus = base + (peak - base) * this.synth.p.fenv.s;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setTargetAtTime(sus, now, 0.02);
  }
  trigger(t) {
    const p = this.synth.p, a = p.aenv, fe = p.fenv, vel = this.vel;
    const g = this.amp.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(vel, t + Math.max(0.002, a.a));
    g.setTargetAtTime(Math.max(0.0001, a.s * vel), t + Math.max(0.002, a.a), Math.max(0.005, a.d) / 3);

    const base = this.cutoffBase(), peak = this.cutoffPeak(base);
    const fq = this.filter.frequency;
    fq.cancelScheduledValues(t);
    fq.setValueAtTime(base, t);
    fq.exponentialRampToValueAtTime(peak, t + Math.max(0.002, fe.a));
    fq.setTargetAtTime(base + (peak - base) * fe.s, t + Math.max(0.002, fe.a), Math.max(0.005, fe.d) / 3);
  }
  glideTo(note, t, glide) {
    this.note = note;
    const gt = Math.max(0.005, glide);
    this.curF = this.curF || {};
    for (const g of ['osc1', 'osc2']) {
      const f = this.baseFreq(g), from = this.curF[g];   // remembered target, not .value: offline the ramp has not run yet
      this.groups[g].oscs.forEach(osc => { osc.frequency.cancelScheduledValues(t); osc.frequency.setValueAtTime(from !== undefined ? from : osc.frequency.value, t); osc.frequency.exponentialRampToValueAtTime(f, t + gt); });
      if (g === 'osc1') { this.sub.frequency.cancelScheduledValues(t); this.sub.frequency.setValueAtTime((from !== undefined ? from : this.sub.frequency.value * 2) / 2, t); this.sub.frequency.exponentialRampToValueAtTime(f / 2, t + gt); }
      this.curF[g] = f;
    }
    // keytracked cutoff follows
    const base = this.cutoffBase(), peak = this.cutoffPeak(base);
    this.filter.frequency.setTargetAtTime(base + (peak - base) * this.synth.p.fenv.s, t, gt / 2);
  }
  release(t) {
    if (this.releasing) return;
    this.releasing = true;
    const p = this.synth.p, r = Math.max(0.01, p.aenv.r), fr = Math.max(0.01, p.fenv.r);
    const g = this.amp.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.0001, t, r / 3);
    const fq = this.filter.frequency;
    fq.cancelScheduledValues(t);
    fq.setTargetAtTime(this.cutoffBase(), t, fr / 3);
    const stopAt = t + r * 1.6 + 0.05;
    this.stopAt = stopAt;
    this.stopAll(stopAt);
    if (!this.synth.offline) setTimeout(() => this.cleanup(), Math.max(0, stopAt - this.ctx.currentTime) * 1000 + 100);
  }
  stopAll(at) {
    for (const g in this.groups) this.groups[g].oscs.forEach(o => { try { o.stop(at); } catch (e) { } });
    try { this.sub.stop(at); } catch (e) { }
    try { this.noise.stop(at); } catch (e) { }
  }
  kill(at) {
    const now = at !== undefined ? at : this.ctx.currentTime;
    this.releasing = true; this.stopAt = now + 0.08;
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setTargetAtTime(0.0001, now, 0.01);
    this.stopAll(now + 0.08);
    if (!this.synth.offline) setTimeout(() => this.cleanup(), Math.max(0, now - this.ctx.currentTime) * 1000 + 150);
  }
  cleanup() {
    try { this.trem.disconnect(); this.synth.lfoCut.disconnect(this.filter.detune); this.synth.lfoAmp.disconnect(this.trem.gain); } catch (e) { }
    try { this.synth.lfoPitch.disconnect(this.sub.detune); } catch (e) { }
    for (const g in this.groups) this.groups[g].oscs.forEach(o => { try { this.synth.lfoPitch.disconnect(o.detune); } catch (e) { } });
    this.synth._done(this);
  }
};

// Effects ("plugins"). Each has input/output GainNodes, a param table, bypass, and a set() method.
window.K = window.K || {};

K.Effect = class Effect {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();   // used by mix-style effects
    this.wetGain = ctx.createGain();
    this.bypassed = false;
    this.p = {};
    this.constructor.params.forEach(d => this.p[d.id] = d.def);
  }
  static get params() { return []; }
  set(id, v) { this.p[id] = v; this.apply(id, v); }
  apply() { }
  bypass(b) {
    this.bypassed = b;
    const now = this.ctx.currentTime;
    if (!this._bp) { this._bp = this.ctx.createGain(); this._bp.gain.value = 0; this.input.connect(this._bp); this._bp.connect(this.output); }
    this._bp.gain.setTargetAtTime(b ? 1 : 0, now, 0.01);
    this._wetMaster.gain.setTargetAtTime(b ? 0 : 1, now, 0.01);
  }
  // Every effect routes input -> (stuff) -> _wetMaster -> output, so bypass can crossfade.
  wire(buildFn) {
    this._wetMaster = this.ctx.createGain();
    this._wetMaster.connect(this.output);
    buildFn(this.input, this._wetMaster);
  }
  // helper for dry/wet
  mixNodes(dst) {
    this.input.connect(this.dryGain); this.dryGain.connect(dst);
    this.wetGain.connect(dst);
  }
  setMix(m) {
    const now = this.ctx.currentTime;
    this.dryGain.gain.setTargetAtTime(Math.cos(m * Math.PI / 2), now, 0.01);
    this.wetGain.gain.setTargetAtTime(Math.sin(m * Math.PI / 2), now, 0.01);
  }
  ramp(param, v, tc = 0.01) { param.setTargetAtTime(v, this.ctx.currentTime, tc); }
  flush() { }
  destroy() { try { this.input.disconnect(); this.output.disconnect(); } catch (e) { } }
  state() { return { type: this.constructor.type, bypassed: this.bypassed, p: Object.assign({}, this.p) }; }
};

// ---------------------------------------------------------------- Distortion
K.Distortion = class Distortion extends K.Effect {
  static get type() { return 'distortion'; }
  static get title() { return 'DISTORTION'; }
  static get blurb() { return 'Pushes the wave past its limits and squares off the peaks. Adds harmonics: gritty, warm, or wrecked.'; }
  static get params() {
    return [
      { id: 'mode', label: 'MODE', options: [{ value: 'soft', label: 'SOFT' }, { value: 'hard', label: 'HARD' }, { value: 'fold', label: 'FOLD' }, { value: 'crush', label: 'CRUSH' }], def: 'soft' },
      { id: 'drive', label: 'DRIVE', min: 0, max: 1, def: 0.4, unit: '%' },
      { id: 'tone', label: 'TONE', min: 400, max: 16000, def: 6000, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, def: 1, unit: '%' },
      { id: 'level', label: 'OUT', min: 0, max: 1.5, def: 0.6, unit: '%' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => {
      this.pre = ctx.createGain();
      this.shaper = ctx.createWaveShaper(); this.shaper.oversample = '4x';
      this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass';
      this.post = ctx.createGain();
      inp.connect(this.pre); this.pre.connect(this.shaper); this.shaper.connect(this.tone); this.tone.connect(this.post); this.post.connect(this.wetGain);
      this.mixNodes(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  curve() {
    const n = 2048, c = new Float32Array(n), mode = this.p.mode, d = this.p.drive;
    const k = 1 + d * 60;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      let y;
      if (mode === 'soft') y = Math.tanh(x * k) / Math.tanh(k);
      else if (mode === 'hard') y = K.clamp(x * (1 + d * 12), -1, 1);
      else if (mode === 'fold') { const g = 1 + d * 6; let v = x * g; v = Math.abs(((v + 1) % 4 + 4) % 4 - 2) - 1; y = v; }
      else { const bits = Math.max(2, Math.round(12 - d * 10)); const s = Math.pow(2, bits - 1); y = Math.round(x * s) / s; }
      c[i] = y;
    }
    return c;
  }
  apply(id, v) {
    if (id === 'mode' || id === 'drive') { this.shaper.curve = this.curve(); this.ramp(this.pre.gain, this.p.mode === 'soft' ? 1 : 1 + this.p.drive * 2); }
    if (id === 'tone') this.ramp(this.tone.frequency, v);
    if (id === 'mix') this.setMix(v);
    if (id === 'level') this.ramp(this.post.gain, v);
  }
};

// ---------------------------------------------------------------- Delay
K.DIVISIONS = [
  { value: '1/32', label: '1/32', beats: 0.125 }, { value: '1/16', label: '1/16', beats: 0.25 }, { value: '1/16d', label: '1/16.', beats: 0.375 },
  { value: '1/8', label: '1/8', beats: 0.5 }, { value: '1/8d', label: '1/8.', beats: 0.75 }, { value: '1/4', label: '1/4', beats: 1 }, { value: '1/2', label: '1/2', beats: 2 }
];
K.Delay = class Delay extends K.Effect {
  static get type() { return 'delay'; }
  static get title() { return 'DELAY'; }
  static get blurb() { return 'Records the sound and plays it back a beat later. Feedback sends the echo back in again for repeats.'; }
  static get params() {
    return [
      { id: 'div', label: 'TIME', options: K.DIVISIONS.map(d => ({ value: d.value, label: d.label })), def: '1/8d' },
      { id: 'feedback', label: 'FEEDBACK', min: 0, max: 0.95, def: 0.45, unit: '%' },
      { id: 'pingpong', label: 'PING-PONG', options: [{ value: 'off', label: 'OFF' }, { value: 'on', label: 'ON' }], def: 'on' },
      { id: 'tone', label: 'TONE', min: 300, max: 12000, def: 3500, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, def: 0.35, unit: '%' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.bpm = 120;
    this.wire((inp, out) => {
      this.dL = ctx.createDelay(4); this.dR = ctx.createDelay(4);
      this.fbL = ctx.createGain(); this.fbR = ctx.createGain();
      this.filtL = ctx.createBiquadFilter(); this.filtR = ctx.createBiquadFilter();
      this.filtL.type = this.filtR.type = 'lowpass';
      this.merger = ctx.createChannelMerger(2);
      this.inMono = ctx.createGain();
      this.crossL = ctx.createGain(); this.crossR = ctx.createGain(); // ping-pong routing gains
      this.straightL = ctx.createGain(); this.straightR = ctx.createGain();
      inp.connect(this.inMono);
      this.inMono.connect(this.dL);
      // straight: each line feeds back to itself. pingpong: L -> R -> L
      this.dL.connect(this.filtL); this.dR.connect(this.filtR);
      this.filtL.connect(this.fbL); this.filtR.connect(this.fbR);
      this.fbL.connect(this.straightL); this.straightL.connect(this.dL);
      this.fbR.connect(this.straightR); this.straightR.connect(this.dR);
      this.fbL.connect(this.crossL); this.crossL.connect(this.dR);
      this.fbR.connect(this.crossR); this.crossR.connect(this.dL);
      this.inR = ctx.createGain(); this.inMono.connect(this.inR); this.inR.connect(this.dR); // in straight mode both lines get input
      this.filtL.connect(this.merger, 0, 0); this.filtR.connect(this.merger, 0, 1);
      this.merger.connect(this.wetGain);
      this.mixNodes(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  setTempo(bpm) { this.bpm = bpm; this.apply('div'); }
  apply(id, v) {
    if (id === 'div') {
      const beats = K.DIVISIONS.find(d => d.value === this.p.div).beats;
      const t = K.clamp(60 / this.bpm * beats, 0.01, 4);
      this.ramp(this.dL.delayTime, t, 0.05); this.ramp(this.dR.delayTime, t, 0.05);
    }
    if (id === 'feedback') { this.ramp(this.fbL.gain, v); this.ramp(this.fbR.gain, v); }
    if (id === 'pingpong') {
      const pp = v === 'on';
      this.ramp(this.crossL.gain, pp ? 1 : 0); this.ramp(this.crossR.gain, pp ? 1 : 0);
      this.ramp(this.straightL.gain, pp ? 0 : 1); this.ramp(this.straightR.gain, pp ? 0 : 1);
      this.ramp(this.inR.gain, pp ? 0 : 1);
    }
    if (id === 'tone') { this.ramp(this.filtL.frequency, v); this.ramp(this.filtR.frequency, v); }
    if (id === 'mix') this.setMix(v);
  }
};

// ---------------------------------------------------------------- Reverb
K.Reverb = class Reverb extends K.Effect {
  static get type() { return 'reverb'; }
  static get title() { return 'REVERB'; }
  static get blurb() { return 'Thousands of tiny echoes smeared together: the sound of a room. Size sets the room, decay sets how long it rings.'; }
  static get params() {
    return [
      { id: 'size', label: 'SIZE', min: 0.1, max: 1, def: 0.5, unit: '%' },
      { id: 'decay', label: 'DECAY', min: 0.2, max: 8, def: 2.2, curve: 'log', unit: 's' },
      { id: 'predelay', label: 'PRE-DLY', min: 0, max: 120, def: 15, unit: 'ms' },
      { id: 'damp', label: 'DAMP', min: 800, max: 16000, def: 5000, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, def: 0.3, unit: '%' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => {
      this.pre = ctx.createDelay(0.5);
      this.conv = ctx.createConvolver();
      this.damp = ctx.createBiquadFilter(); this.damp.type = 'lowpass';
      inp.connect(this.pre); this.pre.connect(this.conv); this.conv.connect(this.damp); this.damp.connect(this.wetGain);
      this.mixNodes(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  buildImpulse() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.max(0.1, this.p.decay) * sr;
    const buf = ctx.createBuffer(2, Math.floor(len), sr);
    const size = this.p.size;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      // early reflections: sparse taps in the first `size`*80ms
      const early = Math.floor(sr * 0.08 * size);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 2.2 + (1 - size) * 2);
        let s = (Math.random() * 2 - 1) * env;
        if (i < early) s *= 0.4 + 0.6 * Math.random() * (Math.random() < 0.06 ? 3 : 0.2);
        d[i] = s;
      }
    }
    this.conv.buffer = buf;
  }
  flush() { if (this._t) { clearTimeout(this._t); this._t = null; this.buildImpulse(); } }
  apply(id, v) {
    if (id === 'size' || id === 'decay') { clearTimeout(this._t); this._t = setTimeout(() => { this._t = null; this.buildImpulse(); }, 40); }
    if (id === 'predelay') this.ramp(this.pre.delayTime, v / 1000);
    if (id === 'damp') this.ramp(this.damp.frequency, v);
    if (id === 'mix') this.setMix(v);
  }
};

// ---------------------------------------------------------------- Chorus
K.Chorus = class Chorus extends K.Effect {
  static get type() { return 'chorus'; }
  static get title() { return 'CHORUS'; }
  static get blurb() { return 'Copies the sound, wobbles the copy\'s pitch, and blends it back. One voice becomes a section.'; }
  static get params() {
    return [
      { id: 'rate', label: 'RATE', min: 0.05, max: 8, def: 0.6, curve: 'log', unit: 'Hz' },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, def: 0.5, unit: '%' },
      { id: 'delay', label: 'DELAY', min: 2, max: 40, def: 12, unit: 'ms' },
      { id: 'mix', label: 'MIX', min: 0, max: 1, def: 0.5, unit: '%' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => {
      this.dL = ctx.createDelay(0.1); this.dR = ctx.createDelay(0.1);
      this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
      this.lfo2 = ctx.createOscillator(); this.lfo2.type = 'sine';
      this.depL = ctx.createGain(); this.depR = ctx.createGain();
      this.lfo.connect(this.depL); this.lfo2.connect(this.depR);
      this.depL.connect(this.dL.delayTime); this.depR.connect(this.dR.delayTime);
      this.merger = ctx.createChannelMerger(2);
      inp.connect(this.dL); inp.connect(this.dR);
      this.dL.connect(this.merger, 0, 0); this.dR.connect(this.merger, 0, 1);
      this.merger.connect(this.wetGain);
      this.lfo.start(); this.lfo2.start();
      this.mixNodes(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  apply(id, v) {
    if (id === 'rate') { this.ramp(this.lfo.frequency, v); this.ramp(this.lfo2.frequency, v * 1.13); }
    if (id === 'depth' || id === 'delay') {
      const base = this.p.delay / 1000, dep = this.p.depth * base * 0.6;
      this.ramp(this.dL.delayTime, base); this.ramp(this.dR.delayTime, base * 1.2);
      this.ramp(this.depL.gain, dep); this.ramp(this.depR.gain, dep);
    }
    if (id === 'mix') this.setMix(v);
  }
};

// ---------------------------------------------------------------- EQ
K.EQ = class EQ extends K.Effect {
  static get type() { return 'eq'; }
  static get title() { return 'EQ'; }
  static get blurb() { return 'Three volume knobs, each for its own slice of the frequency range. Lows, mids, highs.'; }
  static get params() {
    return [
      { id: 'low', label: 'LOW', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'mid', label: 'MID', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'midf', label: 'MID FREQ', min: 200, max: 6000, def: 1000, curve: 'log', unit: 'Hz' },
      { id: 'high', label: 'HIGH', min: -18, max: 18, def: 0, unit: 'dB' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => {
      this.lo = ctx.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 200;
      this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.Q.value = 1;
      this.hi = ctx.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 4000;
      inp.connect(this.lo); this.lo.connect(this.mid); this.mid.connect(this.hi); this.hi.connect(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  apply(id, v) {
    if (id === 'low') this.ramp(this.lo.gain, v);
    if (id === 'mid') this.ramp(this.mid.gain, v);
    if (id === 'midf') this.ramp(this.mid.frequency, v);
    if (id === 'high') this.ramp(this.hi.gain, v);
  }
};

// ---------------------------------------------------------------- Compressor
K.Compressor = class Compressor extends K.Effect {
  static get type() { return 'compressor'; }
  static get title() { return 'COMPRESSOR'; }
  static get blurb() { return 'An automatic volume hand. When the sound gets louder than the threshold it turns it down. Then makeup brings it all back up.'; }
  static get params() {
    return [
      { id: 'threshold', label: 'THRESH', min: -60, max: 0, def: -24, unit: 'dB' },
      { id: 'ratio', label: 'RATIO', min: 1, max: 20, def: 4, unit: ':1', fmt: v => v.toFixed(1) + ':1' },
      { id: 'attack', label: 'ATTACK', min: 0.001, max: 0.3, def: 0.01, curve: 'log', unit: 's' },
      { id: 'release', label: 'RELEASE', min: 0.02, max: 1.5, def: 0.2, curve: 'log', unit: 's' },
      { id: 'makeup', label: 'MAKEUP', min: 0, max: 24, def: 6, unit: 'dB' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => {
      this.comp = ctx.createDynamicsCompressor(); this.comp.knee.value = 6;
      this.makeup = ctx.createGain();
      inp.connect(this.comp); this.comp.connect(this.makeup); this.makeup.connect(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  get reduction() { return this.comp.reduction; }
  apply(id, v) {
    if (id === 'threshold') this.ramp(this.comp.threshold, v);
    if (id === 'ratio') this.ramp(this.comp.ratio, v);
    if (id === 'attack') this.ramp(this.comp.attack, v);
    if (id === 'release') this.ramp(this.comp.release, v);
    if (id === 'makeup') this.ramp(this.makeup.gain, Math.pow(10, v / 20));
  }
};

// ---------------------------------------------------------------- Filter (as an insert)
K.FilterFX = class FilterFX extends K.Effect {
  static get type() { return 'filter'; }
  static get title() { return 'FILTER'; }
  static get blurb() { return 'A second filter, after the synth. Good for sweeping a whole mix, or carving the echoes down.'; }
  static get params() {
    return [
      { id: 'type', label: 'TYPE', options: [{ value: 'lowpass', label: 'LOW' }, { value: 'highpass', label: 'HIGH' }, { value: 'bandpass', label: 'BAND' }, { value: 'notch', label: 'NOTCH' }], def: 'lowpass' },
      { id: 'cutoff', label: 'CUTOFF', min: 40, max: 18000, def: 2000, curve: 'log', unit: 'Hz' },
      { id: 'res', label: 'RESO', min: 0.1, max: 20, def: 1, curve: 'log', fmt: v => v.toFixed(1) }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => { this.f = ctx.createBiquadFilter(); inp.connect(this.f); this.f.connect(out); });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  apply(id, v) {
    if (id === 'type') this.f.type = v;
    if (id === 'cutoff') this.ramp(this.f.frequency, v);
    if (id === 'res') this.ramp(this.f.Q, v);
  }
};


// ---------------------------------------------------------------- Phaser
K.Phaser = class Phaser extends K.Effect {
  static get type() { return 'phaser'; }
  static get title() { return 'PHASER'; }
  static get blurb() { return 'Sweeps a stack of notches through the sound. The swirl on every psych-rock keyboard and disco guitar.'; }
  static get params() {
    return [
      { id: 'rate', label: 'RATE', min: 0.05, max: 10, def: 0.35, curve: 'log', unit: 'Hz' },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, def: 0.7, unit: '%' },
      { id: 'center', label: 'CENTER', min: 200, max: 4000, def: 900, curve: 'log', unit: 'Hz' },
      { id: 'feedback', label: 'FEEDBACK', min: 0, max: 0.9, def: 0.4, unit: '%' },
      { id: 'stages', label: 'STAGES', options: [{ value: 4, label: '4' }, { value: 6, label: '6' }, { value: 8, label: '8' }], def: 6 },
      { id: 'mix', label: 'MIX', min: 0, max: 1, def: 0.5, unit: '%' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => {
      this.inp = inp;
      this.fb = ctx.createGain();
      this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
      this.lfoGain = ctx.createGain();
      this.lfo.connect(this.lfoGain); this.lfo.start();
      this.stagesN = [];
      this.build(this.p.stages);
      this.mixNodes(out);
    });
    Object.keys(this.p).forEach(k => this.apply(k, this.p[k]));
  }
  build(n) {
    this.stagesN.forEach(f => { try { f.disconnect(); } catch (e) { } });
    try { this.fb.disconnect(); } catch (e) { }
    this.stagesN = [];
    let node = this.inp;
    for (let i = 0; i < n; i++) {
      const f = this.ctx.createBiquadFilter(); f.type = 'allpass'; f.Q.value = 0.6;
      node.connect(f); this.lfoGain.connect(f.frequency); this.stagesN.push(f); node = f;
    }
    node.connect(this.wetGain); node.connect(this.fb); this.fb.connect(this.stagesN[0]);
    this.apply('center'); this.apply('feedback');
  }
  apply(id, v) {
    if (id === 'stages') { if (this.stagesN.length && this.stagesN.length !== +this.p.stages) this.build(+this.p.stages); }
    if (id === 'rate') this.ramp(this.lfo.frequency, v);
    if (id === 'center' || id === 'depth') {
      this.stagesN.forEach((f, i) => this.ramp(f.frequency, this.p.center * Math.pow(1.6, i - this.stagesN.length / 2 + 0.5)));
      this.ramp(this.lfoGain.gain, this.p.center * this.p.depth * 0.9);
    }
    if (id === 'feedback') this.ramp(this.fb.gain, this.p.feedback);
    if (id === 'mix') this.setMix(v);
  }
};

// ---------------------------------------------------------------- Pump (sidechain-style ducking on the beat)
K.Pump = class Pump extends K.Effect {
  static get type() { return 'pump'; }
  static get title() { return 'PUMP'; }
  static get blurb() { return 'Ducks the volume on every beat and lets it swell back. The sidechain breathe of French house and psych-disco. Follows the clock.'; }
  static get params() {
    return [
      { id: 'div', label: 'EVERY', options: [{ value: 2, label: '1/8' }, { value: 4, label: '1/4' }, { value: 8, label: '1/2' }, { value: 16, label: 'BAR' }], def: 4 },
      { id: 'depth', label: 'DEPTH', min: 0, max: 1, def: 0.6, unit: '%' },
      { id: 'hold', label: 'HOLD', min: 0, max: 0.2, def: 0.03, unit: 's' },
      { id: 'release', label: 'RELEASE', min: 0.02, max: 1, def: 0.25, curve: 'log', unit: 's' },
      { id: 'shape', label: 'SHAPE', options: [{ value: 'lin', label: 'LINE' }, { value: 'exp', label: 'CURVE' }], def: 'exp' }
    ];
  }
  constructor(ctx) {
    super(ctx);
    this.wire((inp, out) => { this.g = ctx.createGain(); inp.connect(this.g); this.g.connect(out); });
  }
  apply() { }
  // called by the engine for every sequencer step, live and offline
  onStep(t, step, stepDur) {
    if (step % +this.p.div) return;
    const g = this.g.gain, floor = Math.max(0.002, 1 - this.p.depth), end = t + this.p.hold + this.p.release;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t); g.linearRampToValueAtTime(floor, t + 0.003);
    g.setValueAtTime(floor, t + this.p.hold);
    if (this.p.shape === 'exp') g.exponentialRampToValueAtTime(1, end); else g.linearRampToValueAtTime(1, end);
  }
};

K.EFFECT_TYPES = { distortion: K.Distortion, delay: K.Delay, reverb: K.Reverb, chorus: K.Chorus, phaser: K.Phaser, eq: K.EQ, compressor: K.Compressor, pump: K.Pump, filter: K.FilterFX };

// ---------------------------------------------------------------- Rack
K.Rack = class Rack {
  constructor(ctx, src, dst) {
    this.ctx = ctx; this.src = src; this.dst = dst; this.effects = []; this.bpm = 120;
    this.onChange = null;
    this.rewire();
  }
  rewire() {
    try { this.src.disconnect(); } catch (e) { }
    this.effects.forEach(fx => { try { fx.output.disconnect(); } catch (e) { } });
    let node = this.src;
    for (const fx of this.effects) { node.connect(fx.input); node = fx.output; }
    node.connect(this.dst);
    if (this.onChange) this.onChange();
  }
  add(type, state) {
    const fx = new K.EFFECT_TYPES[type](this.ctx);
    if (fx.setTempo) fx.setTempo(this.bpm);
    if (state) { for (const k in state.p) fx.set(k, state.p[k]); if (state.bypassed) fx.bypass(true); }
    fx.flush();
    this.effects.push(fx);
    this.rewire();
    return fx;
  }
  remove(fx) {
    const i = this.effects.indexOf(fx); if (i < 0) return;
    this.effects.splice(i, 1); fx.destroy(); this.rewire();
  }
  move(fx, dir) {
    const i = this.effects.indexOf(fx), j = i + dir;
    if (i < 0 || j < 0 || j >= this.effects.length) return;
    [this.effects[i], this.effects[j]] = [this.effects[j], this.effects[i]];
    this.rewire();
  }
  clear() { this.effects.forEach(fx => fx.destroy()); this.effects = []; this.rewire(); }
  setTempo(bpm) { this.bpm = bpm; this.effects.forEach(fx => fx.setTempo && fx.setTempo(bpm)); }
  state() { return this.effects.map(fx => fx.state()); }
  load(states) { this.clear(); (states || []).forEach(s => this.add(s.type, s)); }
};

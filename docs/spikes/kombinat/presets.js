// Factory preset bank. Partial synth params merge over K.SYNTH_DEFAULTS.
window.K = window.K || {};

K.PRESETS = [
  { name: 'INIT SAW', tag: 'basic', pattern: 'arp',
    synth: { osc2: { level: 0 }, filter: { cutoff: 8000, res: 0.7, env: 0 }, aenv: { a: 0.005, d: 0.2, s: 0.9, r: 0.2 } }, rack: [] },

  { name: 'POLIVOKS LEAD', tag: 'lead', pattern: 'arp',
    synth: { osc1: { wave: 'sawtooth', level: 0.8 }, osc2: { wave: 'square', oct: 0, fine: 9, level: 0.55 },
      filter: { cutoff: 900, res: 6, env: 0.5, keytrack: 0.7 }, fenv: { a: 0.01, d: 0.3, s: 0.35, r: 0.3 },
      aenv: { a: 0.01, d: 0.2, s: 0.8, r: 0.25 }, play: { mode: 'mono', glide: 0.08 }, lfo: { rate: 5.5, depth: 0.05, target: 'pitch' } },
    rack: [{ type: 'delay', p: { div: '1/8d', feedback: 0.35, mix: 0.25 } }] },

  { name: 'ACID BASS', tag: 'bass', pattern: 'acid',
    synth: { osc1: { wave: 'sawtooth', oct: 0 }, osc2: { level: 0 }, sub: { level: 0.2 },
      filter: { cutoff: 220, res: 12, env: 0.75, keytrack: 0.3 }, fenv: { a: 0.002, d: 0.22, s: 0.05, r: 0.15 },
      aenv: { a: 0.002, d: 0.3, s: 0.6, r: 0.12 }, play: { mode: 'mono', glide: 0.06 } },
    rack: [{ type: 'distortion', p: { mode: 'soft', drive: 0.35, tone: 5000, mix: 0.8, level: 0.6 } }] },

  { name: 'SUB BASS', tag: 'bass', pattern: 'octaves',
    synth: { osc1: { wave: 'sine', oct: -1 }, osc2: { wave: 'triangle', oct: -1, fine: 0, level: 0.3 }, sub: { level: 0.4 },
      filter: { cutoff: 400, res: 0.7, env: 0.2 }, fenv: { a: 0.002, d: 0.15, s: 0, r: 0.1 },
      aenv: { a: 0.003, d: 0.2, s: 0.9, r: 0.1 }, play: { mode: 'mono', glide: 0.03 } },
    rack: [{ type: 'compressor', p: { threshold: -18, ratio: 4, attack: 0.01, release: 0.15, makeup: 4 } }] },

  { name: 'SUPERSAW', tag: 'lead', pattern: 'stabs',
    synth: { osc1: { wave: 'sawtooth', unison: 7, spread: 22, level: 0.7 }, osc2: { wave: 'sawtooth', oct: -1, unison: 3, spread: 12, level: 0.4 },
      filter: { cutoff: 3500, res: 1, env: 0.25 }, fenv: { a: 0.01, d: 0.4, s: 0.5, r: 0.4 },
      aenv: { a: 0.02, d: 0.3, s: 0.8, r: 0.35 } },
    rack: [{ type: 'chorus', p: { rate: 0.4, depth: 0.4, mix: 0.35 } }, { type: 'reverb', p: { size: 0.7, decay: 2.5, mix: 0.25 } }] },

  { name: 'PLUCK', tag: 'keys', pattern: 'pluck',
    synth: { osc1: { wave: 'sawtooth' }, osc2: { wave: 'square', oct: 0, fine: 4, level: 0.4 },
      filter: { cutoff: 300, res: 3, env: 0.9, keytrack: 0.8 }, fenv: { a: 0.001, d: 0.18, s: 0, r: 0.18 },
      aenv: { a: 0.001, d: 0.35, s: 0.15, r: 0.25 } },
    rack: [{ type: 'delay', p: { div: '1/8d', feedback: 0.4, pingpong: 'on', mix: 0.3 } }, { type: 'reverb', p: { size: 0.5, decay: 1.6, mix: 0.2 } }] },

  { name: 'WARM PAD', tag: 'pad', pattern: 'pad',
    synth: { osc1: { wave: 'sawtooth', unison: 4, spread: 14, level: 0.6 }, osc2: { wave: 'triangle', oct: 0, fine: -8, unison: 3, spread: 10, level: 0.5 },
      filter: { cutoff: 700, res: 1.2, env: 0.4 }, fenv: { a: 1.2, d: 1.5, s: 0.5, r: 1.5 },
      aenv: { a: 0.9, d: 0.8, s: 0.85, r: 1.8 }, lfo: { rate: 0.3, depth: 0.12, target: 'cutoff' } },
    rack: [{ type: 'chorus', p: { rate: 0.3, depth: 0.5, mix: 0.4 } }, { type: 'reverb', p: { size: 0.9, decay: 5, damp: 3500, mix: 0.4 } }] },

  { name: 'BRASS', tag: 'lead', pattern: 'stabs',
    synth: { osc1: { wave: 'sawtooth' }, osc2: { wave: 'sawtooth', oct: 0, fine: -7, level: 0.7 },
      filter: { cutoff: 500, res: 2, env: 0.6, keytrack: 0.6 }, fenv: { a: 0.09, d: 0.4, s: 0.6, r: 0.2 },
      aenv: { a: 0.05, d: 0.2, s: 0.9, r: 0.2 } },
    rack: [{ type: 'eq', p: { low: -3, mid: 3, midf: 1800, high: 2 } }] },

  { name: 'WOBBLE', tag: 'bass', pattern: 'octaves',
    synth: { osc1: { wave: 'square' }, osc2: { wave: 'sawtooth', oct: -1, fine: 3, level: 0.7 }, sub: { level: 0.3 },
      filter: { cutoff: 250, res: 8, env: 0 }, aenv: { a: 0.005, d: 0.2, s: 1, r: 0.15 },
      lfo: { wave: 'sine', rate: 4.2, depth: 0.7, target: 'cutoff' }, play: { mode: 'mono', glide: 0.02 } },
    rack: [{ type: 'distortion', p: { mode: 'soft', drive: 0.5, tone: 7000, mix: 0.7, level: 0.55 } }] },

  { name: 'CRUSHED', tag: 'fx', pattern: 'pluck',
    synth: { osc1: { wave: 'square' }, osc2: { wave: 'pulse', oct: 1, level: 0.3 },
      filter: { cutoff: 5000, res: 1, env: 0.3 }, fenv: { a: 0.001, d: 0.12, s: 0.2, r: 0.1 }, aenv: { a: 0.001, d: 0.15, s: 0.4, r: 0.12 } },
    rack: [{ type: 'distortion', p: { mode: 'crush', drive: 0.7, tone: 9000, mix: 1, level: 0.5 } }, { type: 'delay', p: { div: '1/16', feedback: 0.3, mix: 0.2 } }] },

  { name: 'ORGAN', tag: 'keys', pattern: 'stabs',
    synth: { osc1: { wave: 'sine', level: 0.8 }, osc2: { wave: 'sine', oct: 1, fine: 0, level: 0.5 }, sub: { level: 0.4 },
      filter: { cutoff: 6000, res: 0.5, env: 0 }, aenv: { a: 0.01, d: 0.1, s: 1, r: 0.08 }, lfo: { rate: 6, depth: 0.15, target: 'amp' } },
    rack: [{ type: 'reverb', p: { size: 0.8, decay: 2.8, mix: 0.3 } }] },

  { name: 'HOLLOW PULSE', tag: 'keys', pattern: 'arp',
    synth: { osc1: { wave: 'pulse' }, osc2: { wave: 'pulse', oct: 0, fine: 12, level: 0.6 },
      filter: { cutoff: 1800, res: 2.5, env: 0.35 }, fenv: { a: 0.005, d: 0.25, s: 0.3, r: 0.25 }, aenv: { a: 0.005, d: 0.25, s: 0.6, r: 0.3 } },
    rack: [{ type: 'delay', p: { div: '1/4', feedback: 0.3, pingpong: 'on', tone: 2500, mix: 0.3 } }] },

  { name: 'SIREN', tag: 'fx', pattern: 'pad',
    synth: { osc1: { wave: 'triangle' }, osc2: { wave: 'sine', oct: 1, fine: 5, level: 0.4 },
      filter: { cutoff: 4000, res: 1, env: 0 }, aenv: { a: 0.4, d: 0.2, s: 1, r: 0.8 }, lfo: { wave: 'triangle', rate: 0.35, depth: 1, target: 'pitch' } },
    rack: [{ type: 'delay', p: { div: '1/8', feedback: 0.6, mix: 0.4 } }, { type: 'reverb', p: { size: 1, decay: 6, mix: 0.4 } }] },

  { name: 'NOISE HIT', tag: 'fx', pattern: 'off',
    synth: { osc1: { level: 0 }, osc2: { level: 0 }, noise: { level: 1 },
      filter: { type: 'bandpass', cutoff: 1500, res: 4, env: 0.8, keytrack: 0 }, fenv: { a: 0.001, d: 0.15, s: 0, r: 0.1 },
      aenv: { a: 0.001, d: 0.18, s: 0, r: 0.15 } },
    rack: [{ type: 'reverb', p: { size: 0.4, decay: 1.2, mix: 0.3 } }] },

  { name: 'DIRTY OCTAVES', tag: 'bass', pattern: 'octaves',
    synth: { osc1: { wave: 'sawtooth', unison: 2, spread: 8 }, osc2: { wave: 'sawtooth', oct: -1, fine: -5, level: 0.8 }, sub: { level: 0.25 },
      filter: { cutoff: 600, res: 4, env: 0.5, keytrack: 0.5 }, fenv: { a: 0.002, d: 0.2, s: 0.2, r: 0.15 }, aenv: { a: 0.002, d: 0.2, s: 0.7, r: 0.12 }, play: { mode: 'mono', glide: 0.04 } },
    rack: [{ type: 'distortion', p: { mode: 'hard', drive: 0.45, tone: 4500, mix: 0.9, level: 0.5 } }, { type: 'compressor', p: { threshold: -20, ratio: 6, attack: 0.005, release: 0.12, makeup: 5 } }] },

  { name: 'GLASS KEYS', tag: 'keys', pattern: 'pluck',
    synth: { osc1: { wave: 'sine', oct: 1, level: 0.7 }, osc2: { wave: 'triangle', oct: 2, fine: 3, level: 0.3 },
      filter: { cutoff: 9000, res: 0.5, env: 0.2 }, fenv: { a: 0.001, d: 0.3, s: 0, r: 0.3 }, aenv: { a: 0.002, d: 0.6, s: 0.1, r: 0.6 } },
    rack: [{ type: 'chorus', p: { rate: 0.8, depth: 0.3, mix: 0.3 } }, { type: 'delay', p: { div: '1/8d', feedback: 0.45, pingpong: 'on', tone: 4000, mix: 0.35 } }, { type: 'reverb', p: { size: 0.8, decay: 3.5, mix: 0.35 } }] },

  { name: 'DISCO BASS', tag: 'bass', pattern: 'octaves',
    synth: { osc1: { wave: 'sawtooth', oct: 0, level: 0.75 }, osc2: { wave: 'square', oct: -1, fine: -4, level: 0.5 }, sub: { level: 0.25 },
      filter: { cutoff: 520, res: 3.5, env: 0.55, keytrack: 0.4 }, fenv: { a: 0.002, d: 0.16, s: 0.15, r: 0.12 },
      aenv: { a: 0.003, d: 0.18, s: 0.7, r: 0.08 }, play: { mode: 'mono', glide: 0.035 } },
    rack: [{ type: 'distortion', p: { mode: 'soft', drive: 0.22, tone: 4200, mix: 0.6, level: 0.7 } }, { type: 'compressor', p: { threshold: -16, ratio: 4, attack: 0.008, release: 0.12, makeup: 4 } }] },

  { name: 'PHASED KEYS', tag: 'keys', pattern: 'stabs',
    synth: { osc1: { wave: 'sawtooth', oct: 0, level: 0.6, unison: 3, spread: 12 }, osc2: { wave: 'square', oct: 0, fine: 7, level: 0.35 },
      filter: { cutoff: 1800, res: 1.5, env: 0.3, keytrack: 0.5 }, fenv: { a: 0.005, d: 0.25, s: 0.3, r: 0.3 },
      aenv: { a: 0.004, d: 0.25, s: 0.55, r: 0.35 }, play: { mode: 'poly' } },
    rack: [{ type: 'phaser', p: { rate: 0.28, depth: 0.75, center: 800, feedback: 0.45, stages: 6, mix: 0.55 } }, { type: 'delay', p: { div: '1/8d', feedback: 0.3, pingpong: 'on', tone: 3000, mix: 0.22 } }] },

  { name: 'HALO LEAD', tag: 'lead', pattern: 'arp',
    synth: { osc1: { wave: 'sawtooth', oct: 0, level: 0.7, unison: 2, spread: 10 }, osc2: { wave: 'triangle', oct: 1, fine: 5, level: 0.4 },
      filter: { cutoff: 2600, res: 2, env: 0.35, keytrack: 0.6 }, fenv: { a: 0.01, d: 0.35, s: 0.4, r: 0.3 },
      aenv: { a: 0.02, d: 0.3, s: 0.75, r: 0.4 }, play: { mode: 'mono', glide: 0.05 }, lfo: { wave: 'sine', target: 'pitch', rate: 5.2, depth: 0.04 } },
    rack: [{ type: 'chorus', p: { rate: 0.5, depth: 0.45, delay: 14, mix: 0.4 } }, { type: 'delay', p: { div: '1/8d', feedback: 0.4, pingpong: 'on', tone: 2800, mix: 0.3 } }, { type: 'reverb', p: { size: 0.6, mix: 0.25 } }] },
];

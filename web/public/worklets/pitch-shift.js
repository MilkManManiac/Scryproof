/**
 * The pitch shifter behind the Chipmunk and Deep voices, run on the audio
 * thread.
 *
 * Plain JavaScript, served as it is and loaded by URL with
 * `audioWorklet.addModule`: a worklet cannot be bundled into the page, and
 * the page's policy only runs scripts that come from this server.
 *
 * The arithmetic is `shiftPitch` in `web/src/lib/voice-effects.ts`, which
 * explains it; the two are kept the same by hand, and the tests run both.
 * Two readers trail the writer through a circle of recent input, each moving
 * `factor` samples for every one written, half a grain apart, each faded by a
 * Hann window that is silent at the moment it jumps back.
 */

class PitchShift extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    this.factor = typeof settings.factor === 'number' && settings.factor > 0 ? settings.factor : 1;
    const seconds = typeof settings.grainSeconds === 'number' && settings.grainSeconds > 0 ? settings.grainSeconds : 0.05;
    this.grain = Math.max(2, Math.round(seconds * sampleRate));
    this.buffer = new Float32Array(this.grain * 2);
    this.write = 0;
    this.phase = 0;
    // A processor that keeps saying "more" is never collected, so the page
    // says when it is finished with this one.
    this.alive = true;
    this.port.onmessage = (event) => {
      if (event.data === 'stop') this.alive = false;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return this.alive;

    const buffer = this.buffer;
    const grain = this.grain;
    const size = buffer.length;
    const step = (1 - this.factor) / grain;

    for (let n = 0; n < output.length; n += 1) {
      // No input (the microphone is not connected yet) is silence, not a stop.
      buffer[this.write] = input ? input[n] : 0;

      let sum = 0;
      for (let reader = 0; reader < 2; reader += 1) {
        let phase = this.phase + reader * 0.5;
        if (phase >= 1) phase -= 1;
        let at = this.write - phase * grain;
        if (at < 0) at += size;
        const before = Math.floor(at);
        const fraction = at - before;
        const a = buffer[before];
        const b = buffer[(before + 1) % size];
        const window = Math.sin(Math.PI * phase);
        sum += window * window * (a + (b - a) * fraction);
      }
      output[n] = sum;

      this.phase += step;
      this.phase -= Math.floor(this.phase);
      this.write = (this.write + 1) % size;
    }
    // A gap in the input (a microphone being swapped) is not the end.
    return this.alive;
  }
}

registerProcessor('pitch-shift', PitchShift);

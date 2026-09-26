/**
 * The loudness guard: no single sound from one microphone can come out much
 * louder than that person's own talking.
 *
 * It learns how loud someone normally talks (a slow average over the moments
 * they are clearly making sound), and holds every peak under a ceiling a
 * fixed number of decibels above that. A knock on the microphone, a plosive
 * pop, a shout: each is brought down to about the loudness of an emphatic
 * word instead of blasting everyone. Ordinary speech never reaches the
 * ceiling and passes untouched.
 *
 * It looks ahead: the sound is delayed by `LOOKAHEAD` so the gain is already
 * down when the first loud sample leaves, rather than a few milliseconds
 * after the damage is done. The ceiling follows the person, not the
 * microphone, so a hot microphone and a quiet one are both guarded.
 *
 * This file is plain JavaScript served as it is: a worklet is loaded by URL
 * and the page's policy only runs scripts from this server. The tests in
 * `web/src/tests/loudness-guard.test.ts` load this same file in Node.
 */

const LOOKAHEAD = 0.005;
/** How long the gain takes to come back after a loud sound. Slow enough not to pump. */
const RELEASE = 0.12;
/** How fast the learned talking level follows. Seconds. */
const LEARN = 4;
/** Below this a 10 ms slice is silence or room tone and teaches nothing. dBFS. */
const ACTIVE_DB = -50;
/** The level assumed before anything has been heard. dBFS, RMS of a 10 ms slice. */
const START_DB = -26;
/** The learned level is kept inside these. dBFS. */
const MIN_DB = -45;
const MAX_DB = -12;

class LoudnessGuard extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { headroomDb = 14 } = options.processorOptions ?? {};
    this.headroomDb = headroomDb;
    this.delay = new Float32Array(Math.max(1, Math.round(LOOKAHEAD * sampleRate)));
    this.at = 0;
    this.envelope = 0;
    this.gain = 1;
    this.release = Math.exp(-1 / (RELEASE * sampleRate));
    this.hold = Math.exp(-1 / (LOOKAHEAD * sampleRate));
    this.attack = 1 / this.delay.length;
    this.slice = Math.round(0.01 * sampleRate);
    this.sum = 0;
    this.count = 0;
    this.levelDb = START_DB;
    this.learn = 1 - Math.exp(-0.01 / LEARN);
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === 'stop') this.stopped = true;
      else if (typeof event.data?.headroomDb === 'number') this.headroomDb = event.data.headroomDb;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return !this.stopped;
    const delay = this.delay;
    const size = delay.length;
    let ceiling = Math.pow(10, (this.levelDb + this.headroomDb) / 20);

    for (let n = 0; n < output.length; n += 1) {
      const sample = input ? input[n] : 0;

      // Learn the talking level from the sound as it comes in, one 10 ms
      // slice at a time, and only from slices that are clearly sound. A
      // slice far over the ceiling is exactly what this guards against, so
      // it does not teach the level either.
      this.sum += sample * sample;
      this.count += 1;
      if (this.count === this.slice) {
        const db = 10 * Math.log10(this.sum / this.count + 1e-12);
        if (db > ACTIVE_DB && db < this.levelDb + this.headroomDb) {
          this.levelDb += (db - this.levelDb) * this.learn;
          this.levelDb = Math.min(MAX_DB, Math.max(MIN_DB, this.levelDb));
          ceiling = Math.pow(10, (this.levelDb + this.headroomDb) / 20);
        }
        this.sum = 0;
        this.count = 0;
      }

      // The loudest thing in the next few milliseconds, held and let go
      // slowly, decides the gain for the sample leaving now.
      const magnitude = Math.abs(sample);
      this.envelope = magnitude > this.envelope ? magnitude : this.envelope * this.hold;
      const target = this.envelope > ceiling ? ceiling / this.envelope : 1;
      if (target < this.gain) this.gain = Math.max(target, this.gain - this.attack);
      else this.gain = target + (this.gain - target) * this.release;

      const leaving = delay[this.at];
      delay[this.at] = sample;
      this.at = (this.at + 1) % size;
      output[n] = leaving * this.gain;
    }
    return !this.stopped;
  }
}

registerProcessor('loudness-guard', LoudnessGuard);

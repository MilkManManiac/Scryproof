/**
 * Cutting a soundboard clip out of a longer file: the selection rules, the
 * waveform numbers, and the Ogg file the clip is written into, read back the
 * way the server reads it.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { LIMITS, muxOggOpus, oggSeconds } from '@scryproof/shared';

import {
  DETAIL_SPAN,
  SHORTEST_CLIP,
  clipTime,
  firstSelection,
  fitsView,
  moveEdge,
  moveWhole,
  peaks,
  viewAround,
} from '../lib/sound-clip';

const MAX = LIMITS.soundSeconds;

describe('the selection', () => {
  it('starts as the first fifteen seconds, or the whole of a shorter file', () => {
    assert.deepEqual(firstSelection(240), { start: 0, end: MAX });
    assert.deepEqual(firstSelection(4.2), { start: 0, end: 4.2 });
  });

  it('never grows past the longest a sound may be', () => {
    const chosen = { start: 10, end: 20 };
    assert.deepEqual(moveEdge(chosen, 'end', 60, 240), { start: 10, end: 10 + MAX });
    assert.deepEqual(moveEdge(chosen, 'start', 0, 240), { start: 20 - MAX, end: 20 });
  });

  it('never crosses itself or shrinks to nothing', () => {
    const chosen = { start: 10, end: 20 };
    assert.deepEqual(moveEdge(chosen, 'start', 25, 240), { start: 20 - SHORTEST_CLIP, end: 20 });
    assert.deepEqual(moveEdge(chosen, 'end', 5, 240), { start: 10, end: 10 + SHORTEST_CLIP });
  });

  it('stays inside the file', () => {
    assert.deepEqual(moveEdge({ start: 1, end: 3 }, 'start', -4, 30), { start: 0, end: 3 });
    assert.deepEqual(moveEdge({ start: 20, end: 28 }, 'end', 40, 30), { start: 20, end: 30 });
  });

  it('slides whole, keeping its length, and stops at either end', () => {
    assert.deepEqual(moveWhole({ start: 0, end: 5 }, 12, 30), { start: 12, end: 17 });
    assert.deepEqual(moveWhole({ start: 0, end: 5 }, 29, 30), { start: 25, end: 30 });
    assert.deepEqual(moveWhole({ start: 10, end: 15 }, -3, 30), { start: 0, end: 5 });
  });
});

describe('the close-up view', () => {
  it('shows all of a short file', () => {
    assert.deepEqual(viewAround({ start: 2, end: 6 }, 20), { start: 0, end: 20 });
  });

  it('centres on the clip in a long file, kept inside it', () => {
    assert.deepEqual(viewAround({ start: 100, end: 110 }, 240), {
      start: 105 - DETAIL_SPAN / 2,
      end: 105 + DETAIL_SPAN / 2,
    });
    assert.deepEqual(viewAround({ start: 0, end: 5 }, 240), { start: 0, end: DETAIL_SPAN });
    assert.deepEqual(viewAround({ start: 235, end: 240 }, 240), { start: 240 - DETAIL_SPAN, end: 240 });
  });

  it('knows when the clip has left it', () => {
    assert.equal(fitsView({ start: 5, end: 10 }, { start: 0, end: 30 }), true);
    assert.equal(fitsView({ start: 25, end: 35 }, { start: 0, end: 30 }), false);
  });
});

describe('the numbers on screen', () => {
  it('reads as minutes, seconds and tenths', () => {
    assert.equal(clipTime(0), '0:00.0');
    assert.equal(clipTime(3.44), '0:03.4');
    assert.equal(clipTime(62), '1:02.0');
    assert.equal(clipTime(59.96), '1:00.0');
  });

  it('draws the loudest point of each column', () => {
    const rate = 100;
    const left = new Float32Array(400);
    left[50] = 0.5;
    left[250] = -0.9;
    const right = new Float32Array(400);
    right[60] = 0.7;
    const heights = peaks([left, right], rate, 0, 4, 4);
    assert.deepEqual(
      heights.map((value) => Math.round(value * 10) / 10),
      [0.7, 0, 0.9, 0],
    );
    assert.deepEqual(peaks([left], rate, 0, 4, 0), []);
  });
});

describe('the Ogg file a clip is written into', () => {
  const packets = (count: number, size = 200) =>
    Array.from({ length: count }, (_, index) => ({ data: new Uint8Array(size).fill(index % 251), samples: 960 }));

  it('reads back as the length that went in, not the padding', () => {
    // 10 s at 48 kHz, in 20 ms packets, one extra for the encoder's lookahead.
    const bytes = muxOggOpus({
      channels: 2,
      preSkip: 312,
      inputRate: 48000,
      packets: packets(501),
      totalSamples: 480000,
    });
    const seconds = oggSeconds(bytes);
    assert.ok(seconds !== null);
    assert.ok(Math.abs(seconds - 10) < 0.001, `read ${seconds}`);
  });

  it('never claims more than its packets hold', () => {
    const bytes = muxOggOpus({
      channels: 1,
      preSkip: 312,
      inputRate: 48000,
      packets: packets(10),
      totalSamples: 48000,
    });
    assert.equal(oggSeconds(bytes), (10 * 960 - 312) / 48000);
  });

  it('splits big packets over more pages instead of overfilling one', () => {
    const bytes = muxOggOpus({
      channels: 2,
      preSkip: 312,
      inputRate: 48000,
      packets: packets(120, 1400),
      totalSamples: 110000,
    });
    assert.ok(Math.abs((oggSeconds(bytes) ?? 0) - 110000 / 48000) < 0.001);
  });

  it('is refused when a byte is changed or the stream is not Ogg', () => {
    const bytes = muxOggOpus({
      channels: 2,
      preSkip: 312,
      inputRate: 48000,
      packets: packets(20),
      totalSamples: 19000,
    });
    const broken = bytes.slice();
    broken[broken.length - 3] = (broken[broken.length - 3] ?? 0) ^ 0xff;
    assert.equal(oggSeconds(broken), null);
    assert.equal(oggSeconds(bytes.slice(0, bytes.length - 10)), null);
    assert.equal(oggSeconds(new TextEncoder().encode('ID3 this is an mp3')), null);
    assert.equal(oggSeconds(new Uint8Array()), null);
  });
});

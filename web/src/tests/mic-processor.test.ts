/**
 * The microphone chain's wiring, on a pretend audio graph that behaves like
 * Chrome's where it matters: undoing a join that does not exist throws.
 *
 * That is how Strong noise suppression failed in every call from its release
 * on 2026-09-25 until 2026-09-26: the first build undid a join it had never
 * made, the processor never started, and the app quietly fell back to the
 * browser's suppression (voice changers with it). The settings preview built
 * its own chain and worked, so nothing on screen said so.
 *
 * Checked here: every choice builds from nothing, every change from every
 * choice to every other lands, and afterwards there is exactly one way
 * through, with the stages in the right order.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

class FakeNode {
  readonly out = new Set<FakeNode>();
  constructor(readonly kind: string) {}
  connect(to: FakeNode): FakeNode {
    this.out.add(to);
    return to;
  }
  disconnect(to?: FakeNode): void {
    if (to === undefined) return this.out.clear();
    if (!this.out.has(to)) {
      throw Object.assign(new Error('the given destination is not connected.'), { name: 'InvalidAccessError' });
    }
    this.out.delete(to);
  }
}

class FakeParam {
  value = 0;
}

class FakeWorkletNode extends FakeNode {
  readonly port = { postMessage: () => undefined };
  constructor(_context: unknown, name: string) {
    super(name);
  }
}

class FakeContext {
  readonly audioWorklet = { addModule: async () => undefined };
  createGain() {
    return Object.assign(new FakeNode('gain'), { gain: new FakeParam() });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode('highpass'), { type: '', frequency: new FakeParam(), Q: new FakeParam() });
  }
  createMediaStreamDestination() {
    return Object.assign(new FakeNode('outlet'), { stream: { getAudioTracks: () => [{ stop: () => undefined }] } });
  }
  createMediaStreamSource() {
    return new FakeNode('microphone');
  }
}

Object.assign(globalThis, {
  AudioWorkletNode: FakeWorkletNode,
  MediaStream: class {
    constructor(readonly tracks: unknown[]) {}
  },
});

mock.module('../lib/noise-model', {
  namedExports: {
    openSuppressor: async () => {
      const node = new FakeNode('rnnoise');
      return { input: node, output: node, close: () => node.disconnect() };
    },
  },
});

const { MicProcessor } = await import('../lib/voice-effects');
type Choice = import('../lib/voice-effects').MicChoice;

/** Every way from the microphone to the outlet, as the named stages met on the way. */
function routes(from: FakeNode, seen: string[] = []): string[][] {
  if (from.kind === 'outlet') return [seen];
  const named = ['highpass', 'rnnoise', 'loudness-guard', 'pitch-shift'].includes(from.kind);
  const here = named && seen.at(-1) !== from.kind ? [...seen, from.kind] : seen;
  return [...from.out].flatMap((next) => routes(next, here));
}

function expected(choice: Choice): string[] {
  return [
    ...(choice.guard ? ['highpass'] : []),
    ...(choice.suppress ? ['rnnoise'] : []),
    ...(choice.guard ? ['loudness-guard'] : []),
    ...(choice.effect === 'chipmunk' ? ['pitch-shift'] : []),
  ];
}

const CHOICES: Choice[] = [];
for (const suppress of [true, false])
  for (const guard of [true, false])
    for (const effect of ['none', 'chipmunk'] as const) CHOICES.push({ suppress, guard, effect });

const label = (choice: Choice) => `${choice.suppress ? 'model' : 'no model'}, ${choice.guard ? 'guard' : 'no guard'}, ${choice.effect}`;

async function start(choice: Choice) {
  const context = new FakeContext();
  const processor = new MicProcessor(choice, context as unknown as AudioContext);
  await processor.init({ track: {} as MediaStreamTrack } as never);
  const microphone = (processor as unknown as { source: FakeNode }).source;
  return { processor, microphone };
}

describe('the microphone chain', () => {
  for (const choice of CHOICES) {
    test(`builds from nothing: ${label(choice)}`, async () => {
      const { processor, microphone } = await start(choice);
      assert.deepEqual(routes(microphone), [expected(choice)]);
      assert.equal(processor.suppressing, choice.suppress);
      assert.equal(processor.guarding, choice.guard);
    });
  }

  test('every change from every choice lands, with one way through', async () => {
    for (const from of CHOICES) {
      for (const to of CHOICES) {
        const { processor, microphone } = await start(from);
        await processor.set(to);
        assert.deepEqual(routes(microphone), [expected(to)], `${label(from)} to ${label(to)}`);
        await processor.set(from);
        assert.deepEqual(routes(microphone), [expected(from)], `${label(to)} back to ${label(from)}`);
      }
    }
  });

  test('taking it down leaves nothing joined', async () => {
    const { processor, microphone } = await start({ suppress: true, guard: true, effect: 'chipmunk' });
    await processor.destroy();
    assert.deepEqual(routes(microphone), []);
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

let start: (scope?: 'window' | 'machine') => void;
let data: (chunk: Uint8Array) => void;
let end: () => void;
let error: (message: string) => void;
let stopped = 0;
const written: { numberOfFrames: number; timestamp: number; data: Uint8Array }[] = [];
class Track extends EventTarget {
  readyState = 'live';
  contentHint = '';
  writable = new WritableStream({ write: (frame) => { written.push(frame); } });
  stop() { this.readyState = 'ended'; }
}
Object.assign(globalThis, {
  window: { scryproofDesktop: {
    server: 'https://local.test', gateway: 'wss://local.test/gateway', platform: 'darwin', canShareSound: true,
    onAppSound: (s: typeof start, d: typeof data, e: typeof end, failure: typeof error) => {
      start = s; data = d; end = e; error = failure; return () => {};
    },
    stopAppSound: () => { stopped += 1; },
  } },
  MediaStreamTrackGenerator: Track,
  AudioData: class { constructor(init: object) { Object.assign(this, init); } },
});
const { takeAppSound, appSoundScope, drop } = await import('../lib/app-sound');

test('native PCM preserves partial stereo frames and advances timestamps by frames', async () => {
  start('window');
  const track = await takeAppSound(0);
  assert.ok(track);
  data(new Uint8Array([1, 2, 3]));
  data(new Uint8Array([4, 5, 6, 7, 8]));
  data(new Uint8Array([9, 10, 11, 12]));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(written.length, 2);
  assert.equal(written[0]!.numberOfFrames, 2);
  assert.deepEqual(Array.from(written[0]!.data), [1,2,3,4,5,6,7,8]);
  assert.equal(written[1]!.timestamp, 2 * 1_000_000 / 48_000);
  drop(track);
});

test('whole-machine capture keeps its scope and stopping it stops the native helper', async () => {
  start('machine');
  const track = await takeAppSound(0);
  assert.ok(track);
  assert.equal(appSoundScope(track), 'machine');
  const before = stopped;
  drop(track);
  assert.equal(track.readyState, 'ended');
  assert.equal(stopped, before + 1);
  assert.equal(await takeAppSound(0), null);
});

test('a native permission failure reaches capture and is consumed once', async () => {
  error('Allow System Audio Recording, then relaunch');
  await assert.rejects(takeAppSound(0), /Allow System Audio Recording/);
  assert.equal(await takeAppSound(0), null);
  start('window');
  const track = await takeAppSound(0);
  assert.ok(track);
  end();
  assert.equal(track.readyState, 'ended');
});

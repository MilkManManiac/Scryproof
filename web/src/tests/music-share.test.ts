import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { captureMusic } from '../lib/music-share';

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
after(() => {
  if (original) Object.defineProperty(globalThis, 'navigator', original);
});
function track(kind: string) {
  return {
    kind,
    readyState: 'live',
    contentHint: '',
    stop() {
      this.readyState = 'ended';
    },
  };
}
function capture(tracks: ReturnType<typeof track>[]) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getDisplayMedia: async () => ({
          getTracks: () => tracks,
          getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
        }),
      },
    },
  });
}
test('retains just one audio track and stops every captured picture and extra audio source', async () => {
  const video = track('video'),
    audio = track('audio'),
    extra = track('audio');
  capture([video, audio, extra]);
  assert.equal(await captureMusic(), audio);
  assert.equal(video.readyState, 'ended');
  assert.equal(extra.readyState, 'ended');
  assert.equal(audio.readyState, 'live');
  assert.equal(audio.contentHint, 'music');
});
test('choosing a source without sound stops capture and explains how to retry', async () => {
  const video = track('video');
  capture([video]);
  await assert.rejects(captureMusic(), /No audio was shared/);
  assert.equal(video.readyState, 'ended');
});
test('an ended audio source is never offered for publication', async () => {
  const audio = track('audio');
  audio.stop();
  capture([audio]);
  await assert.rejects(captureMusic(), /audio source stopped/);
});
test('unavailable capture gives a listening-compatible explanation', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  await assert.rejects(captureMusic(), /still listen/);
});

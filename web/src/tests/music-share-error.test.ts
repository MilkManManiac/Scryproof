import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let stopped = false;
const video = { kind: 'video', stop() { stopped = true; } };
Object.assign(globalThis, { window: { scryproofDesktop: {
  server: 'https://local.test', gateway: 'wss://local.test/gateway', platform: 'darwin', canShareSound: true,
  prepareScreenShare: async () => true,
} } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
  getDisplayMedia: async () => ({ getAudioTracks: () => [], getTracks: () => [video] }),
} } });
mock.module('../lib/app-sound', { namedExports: {
  takeAppSound: async () => { throw new Error('native helper failure'); },
} });
const { captureMusic } = await import('../lib/music-share');
test('a native music failure stops its unpublished screen capture', async () => {
  await assert.rejects(captureMusic(), /native helper failure/);
  assert.equal(stopped, true);
});

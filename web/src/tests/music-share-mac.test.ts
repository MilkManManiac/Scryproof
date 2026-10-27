import assert from 'node:assert/strict';
import { test } from 'node:test';
let captures = 0;
Object.assign(globalThis, { window: { scryproofDesktop: {
  server: 'https://local.test', gateway: 'wss://local.test/gateway', platform: 'darwin', canShareSound: false,
} } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
  getDisplayMedia: async () => { captures += 1; return { getAudioTracks: () => [], getTracks: () => [] }; },
} } });
const { captureMusic } = await import('../lib/music-share');
test('an unsupported Mac explains music support before opening a capture request', async () => {
  await assert.rejects(captureMusic(), /macOS 14.2.*still listen/);
  assert.equal(captures, 0);
});

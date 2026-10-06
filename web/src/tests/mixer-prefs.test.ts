import assert from 'node:assert/strict';
import { test } from 'node:test';
const storage = new Map([
  [
    'scryproof.voice-prefs.v1',
    JSON.stringify({
      volumes: { wes: 1.5, alex: 0, 'wes:screen': 2, 'alex:screen': 4, invalid: 'loud', huge: 900 },
      outputVolume: 1.25,
    }),
  ],
]);
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});
const { voicePrefs, safeVolume } = await import('../lib/voice-prefs');
test('existing voice and screen levels survive loading; malformed gains are bounded', () => {
  // A share saved at 400% before shares stopped at 200% comes back at 200%.
  assert.deepEqual(voicePrefs.get().volumes, { wes: 1.5, alex: 0, 'wes:screen': 2, 'alex:screen': 2, invalid: 1, huge: 4 });
  assert.equal(voicePrefs.get().outputVolume, 1.25);
  for (const value of [NaN, Infinity, undefined, '4']) assert.equal(safeVolume(value), 1);
  assert.equal(safeVolume(-1), 0);
});
test('music, voice and stream volume remain independent and reset drops only the selected override', () => {
  voicePrefs.setVolumeFor('wes:music', 4);
  assert.equal(voicePrefs.get().volumes.wes, 1.5);
  assert.equal(voicePrefs.get().volumes['wes:screen'], 2);
  assert.equal(voicePrefs.get().volumes['wes:music'], 2, 'a share stops at 200%');
  voicePrefs.setVolumeFor('alex', 4);
  assert.equal(voicePrefs.get().volumes.alex, 4, 'a voice still reaches 400%');
  voicePrefs.setVolumeFor('wes:music', 1);
  assert.equal(voicePrefs.get().volumes['wes:music'], undefined);
  assert.equal(voicePrefs.get().volumes.wes, 1.5);
  assert.equal(JSON.parse(storage.get('scryproof.voice-prefs.v1')!).volumes.wes, 1.5);
});

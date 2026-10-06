import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MusicAudience, MUSIC_AUDIENCE_TTL_MS, readMusicAudience } from '../lib/music-audience';
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test('presence parsing rejects malformed or oversized packets and deduplicates publications', () => {
  assert.equal(readMusicAudience(encode({ listening: ['TR_one', 7] })), null);
  assert.equal(readMusicAudience(encode({ listening: Array(33).fill('TR_one') })), null);
  assert.equal(readMusicAudience(new Uint8Array(4097)), null);
  assert.equal(readMusicAudience(encode({ listening: ['TR_one'], request: 'yes' })), null);
  assert.equal(readMusicAudience(new TextEncoder().encode('{')), null);
  assert.deepEqual(readMusicAudience(encode({ listening: ['TR_one', 'TR_one'], userId: 'impersonated' })), {
    listening: ['TR_one'],
    request: false,
  });
});

test('listeners are scoped to the sender, publication, and current call membership', () => {
  const audience = new MusicAudience();
  audience.update('alex', ['TR_one'], 100);
  audience.update('mara', ['TR_two'], 100);
  assert.deepEqual(audience.listeners('TR_one', new Set(['alex', 'mara']), 101), ['alex']);
  audience.update('alex', [], 102);
  assert.deepEqual(audience.listeners('TR_one', new Set(['alex', 'mara']), 103), []);
  assert.deepEqual(audience.listeners('TR_two', new Set(['alex']), 103), []);
});

test('late publication arrival can use an earlier presence snapshot, but restarting never inherits listeners', () => {
  const audience = new MusicAudience();
  audience.update('alex', ['TR_one'], 100);
  assert.deepEqual(audience.listeners('TR_one', new Set(['alex']), 101), ['alex']);
  audience.end('TR_one');
  assert.deepEqual(audience.listeners('TR_one', new Set(['alex']), 102), []);
  assert.deepEqual(audience.listeners('TR_restarted', new Set(['alex']), 102), []);
});

test('heartbeats refresh presence; missing heartbeats, departures and leaving clear it', () => {
  const audience = new MusicAudience();
  const present = new Set(['alex']);
  audience.update('alex', ['TR_one'], 100);
  assert.deepEqual(audience.listeners('TR_one', present, 100 + MUSIC_AUDIENCE_TTL_MS - 1), ['alex']);
  audience.update('alex', ['TR_one'], 200);
  assert.deepEqual(audience.listeners('TR_one', present, 100 + MUSIC_AUDIENCE_TTL_MS), ['alex']);
  assert.deepEqual(audience.listeners('TR_one', present, 200 + MUSIC_AUDIENCE_TTL_MS), []);
  audience.update('alex', ['TR_one']);
  audience.remove('alex');
  assert.deepEqual(audience.listeners('TR_one', present), []);
  audience.update('alex', ['TR_one']);
  audience.clear();
  assert.deepEqual(audience.listeners('TR_one', present), []);
});

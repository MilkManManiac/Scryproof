import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';
import * as livekit from 'livekit-client';
import type { VoiceSignal } from '@scryproof/shared';
import { MemoryIdentityStore, createDeviceIdentity, type DeviceIdentity } from '../lib/voice-crypto';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'livekit-client/e2ee-worker?worker') return {
    url: 'data:text/javascript,export default class Worker {}', shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {} } });

// Real session and WebCrypto, with media transport stopped at the Room API.
// These users listen only, so no microphone or audio output is mocked.
class Room extends EventEmitter {
  static opened: Room[] = [];
  isE2EEEnabled = true;
  remoteParticipants = new Map();
  localParticipant = { getTrackPublication: () => undefined, trackPublications: new Map() };
  constructor() { super(); Room.opened.push(this); }
  async setE2EEEnabled() {}
  connects = 0;
  async connect() { this.connects += 1; }
  async disconnect() { this.emit(livekit.RoomEvent.Disconnected, livekit.DisconnectReason.CLIENT_INITIATED); }
}
let identity: DeviceIdentity;
let pins: MemoryIdentityStore;
mock.module('livekit-client', { namedExports: { ...livekit, Room } });
mock.module('../lib/voice-identity', { namedExports: {
  loadDeviceIdentity: async () => identity,
  IndexedDbIdentityStore: class { constructor() { return pins; } },
  letInEverywhere: async () => {},
} });
mock.module('../lib/voice-key-provider', { namedExports: {
  voiceSupport: () => ({ ok: true }),
  ScryproofKeyProvider: class { async setParticipantKey() {} },
} });
mock.module('../lib/api', { namedExports: {
  ApiError: class extends Error {},
  api: { voice: { token: async () => ({ url: 'local-test', token: 'test', can: { speak: false, video: false, screenShare: false } }) } },
} });
const { VoiceSession } = await import('../lib/voice-session');
const { voicePrefs } = await import('../lib/voice-prefs');
voicePrefs.set({ sounds: false });

test('approval requests the held sender key and secures both directions without another epoch', async () => {
  const old = await createDeviceIdentity('alex-old');
  const peerIdentity = await createDeviceIdentity('wes');
  const replacement = await createDeviceIdentity('alex-new');
  const peerPins = new MemoryIdentityStore();
  await peerPins.set('alex', old.deviceId, old.fingerprint);
  const messages: { from: string; signal: VoiceSignal & { to?: string } }[] = [];
  const peer = new VoiceSession(() => 'wes', (signal) => messages.push({ from: 'wes', signal }));
  const next = new VoiceSession(() => 'alex', (signal) => messages.push({ from: 'alex', signal }));
  const membership = { channelId: 'room', epoch: 1, members: ['wes', 'alex'] };
  const drain = async () => {
    for (let steps = 0; messages.length; steps += 1) {
      assert.ok(steps < 30, 'key agreement does not loop');
      const { from, signal } = messages.shift()!;
      await (from === 'wes' ? next : peer).onSignal({ ...signal, from });
    }
  };
  try {
    identity = peerIdentity; pins = peerPins;
    await peer.join({ kind: 'channel', id: 'room' }, () => peer.onMembership(membership).then(() => true));
    identity = replacement; pins = new MemoryIdentityStore();
    await next.join({ kind: 'channel', id: 'room' }, () => next.onMembership(membership).then(() => true));
    await drain();
    assert.equal(peer.getSnapshot().people[0]?.state, 'held');
    assert.equal(peer.getSnapshot().people[0]?.verdict, 'new-device');
    await peer.approve('alex', replacement.deviceId);
    await drain();
    assert.equal(peer.getSnapshot().people[0]?.state, 'secured');
    assert.equal(next.getSnapshot().people[0]?.state, 'secured');
    assert.equal(peer.getSnapshot().epoch, 1);
    assert.equal(next.getSnapshot().epoch, 1);
    assert.equal(peer.getSnapshot().code, next.getSnapshot().code);
  } finally { await peer.leave(); await next.leave(); }
});

const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'session reached the expected terminal or connected state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('a LiveKit reconnect ends moved when the gateway rejects ownership', async () => {
  identity = await createDeviceIdentity('offline'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  let checks = 0;
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase), async () => { checks += 1; return false; });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => true);
    const room = Room.opened.at(-1)!;
    room.emit(livekit.RoomEvent.Reconnected);
    await until(() => session.getSnapshot().phase === 'moved');
    assert.equal(checks, 1);
    assert.equal(session.getSnapshot().encrypted, false);
    assert.deepEqual(ends, ['moved']);
  } finally { await session.leave(); }
});

test('a duplicate kick reconnects the gateway owner instead of ending it moved', async () => {
  identity = await createDeviceIdentity('owner'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  let checks = 0;
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase), async () => { checks += 1; return true; });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => true);
    const room = Room.opened.at(-1)!;
    room.emit(livekit.RoomEvent.Disconnected, livekit.DisconnectReason.DUPLICATE_IDENTITY);
    await until(() => Room.opened.at(-1) !== room && session.getSnapshot().phase === 'connected');
    assert.equal(checks, 2, 'confirm before recovery and again before the new media connect');
    assert.deepEqual(ends, []);
    assert.equal(session.getSnapshot().encrypted, true);
  } finally { await session.leave(); }
});

test('a denied automatic join never reaches LiveKit', async () => {
  identity = await createDeviceIdentity('denied'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase));
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => false);
    assert.equal(session.getSnapshot().phase, 'moved');
    assert.equal(Room.opened.at(-1)?.connects, 0);
    assert.deepEqual(ends, ['moved']);
  } finally { await session.leave(); }
});

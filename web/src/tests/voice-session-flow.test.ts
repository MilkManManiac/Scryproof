import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';
import * as livekit from 'livekit-client';
import type { ClientEvent, ServerEvent, VoiceSignal } from '@scryproof/shared';
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
  constructor(readonly options: livekit.RoomOptions) { super(); Room.opened.push(this); }
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
const { VoiceSession, VoiceGatewayUnavailable, VoiceGatewayRefused, VoiceCallLeft } = await import('../lib/voice-session');
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
    room.emit(livekit.RoomEvent.Disconnected);
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
    assert.equal(checks, 1, 'gateway confirmation precedes the only media recovery');
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


test('a gateway outage keeps the call pending and recovers when ready', async () => {
  identity = await createDeviceIdentity('pending-owner'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  let online = false;
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase), async () => {
    if (!online) throw new VoiceGatewayUnavailable();
    return true;
  });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => true);
    const room = Room.opened.at(-1)!;
    room.emit(livekit.RoomEvent.Disconnected);
    await until(() => session.getSnapshot().phase === 'connecting' && session.getSnapshot().error !== null);
    assert.deepEqual(ends, []);
    assert.equal(session.getSnapshot().channelId, 'room');
    online = true;
    await session.resume();
    assert.equal(session.getSnapshot().phase, 'connected');
    assert.deepEqual(ends, []);
  } finally { await session.leave(); }
});

test('SDK automatic retry is disabled and a guarded rebuild preserves epoch and keys', async () => {
  identity = await createDeviceIdentity('stable-owner'); pins = new MemoryIdentityStore();
  const session = new VoiceSession(() => 'me', () => {}, () => {}, async () => true);
  try {
    await session.join({ kind: 'channel', id: 'room' }, () => session.onMembership({ channelId: 'room', epoch: 4, members: ['me'] }).then(() => true));
    const room = Room.opened.at(-1)!;
    assert.equal(room.options.reconnectPolicy?.nextRetryDelayInMs({ elapsedMs: 0, retryCount: 0 }), null);
    await session.resume();
    assert.equal(session.getSnapshot().epoch, 4);
    assert.equal(session.getSnapshot().phase, 'connected');
    assert.equal(Room.opened.at(-1)?.options.reconnectPolicy?.nextRetryDelayInMs({ elapsedMs: 1000, retryCount: 1 }), null);
  } finally { await session.leave(); }
});


test('a definite gateway refusal is terminal rather than an endless media retry', async () => {
  identity = await createDeviceIdentity('refused-owner'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase), async () => {
    throw new VoiceGatewayRefused('You cannot join that voice channel.');
  });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => true);
    Room.opened.at(-1)!.emit(livekit.RoomEvent.Disconnected);
    await until(() => session.getSnapshot().phase === 'failed');
    assert.equal(session.getSnapshot().error, 'You cannot join that voice channel.');
    assert.deepEqual(ends, ['failed']);
  } finally { await session.leave(); }
});


test('automatic recovery expires at sixty seconds of wall-clock loss, including sleep', async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  identity = await createDeviceIdentity('sleep-owner'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase), async () => { throw new VoiceGatewayUnavailable(); });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => true);
    await session.resume();
    now += 59_999;
    await session.resume();
    assert.equal(session.getSnapshot().phase, 'connecting');
    now += 1;
    await session.resume();
    assert.equal(session.getSnapshot().phase, 'ended');
    assert.equal(session.getSnapshot().error, 'You were disconnected from the call.');
    assert.deepEqual(ends, ['ended']);
  } finally { await session.leave(); }
});

test('an explicit offline join retains its claiming callback instead of becoming a resume', async () => {
  identity = await createDeviceIdentity('offline-claim'); pins = new MemoryIdentityStore();
  let online = false;
  let claims = 0; let resumes = 0;
  const session = new VoiceSession(() => 'me', () => {}, () => {}, async () => { resumes += 1; return false; });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => {
      claims += 1;
      if (!online) throw new VoiceGatewayUnavailable();
      return true;
    });
    online = true;
    await session.resume();
    assert.equal(session.getSnapshot().phase, 'connected');
    assert.equal(claims, 2);
    assert.equal(resumes, 0);
  } finally { await session.leave(); }
});

test('a server deliberate-leave refusal ends quietly without moved or failed', async () => {
  identity = await createDeviceIdentity('left-elsewhere'); pins = new MemoryIdentityStore();
  const ends: string[] = [];
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase), async () => { throw new VoiceCallLeft(); });
  try {
    await session.join({ kind: 'channel', id: 'room' }, async () => true);
    await session.resume();
    assert.equal(session.getSnapshot().phase, 'ended');
    assert.equal(session.getSnapshot().error, 'You left this call on another device.');
    assert.deepEqual(ends, ['ended']);
  } finally { await session.leave(); }
});


test('a server that never answers a join is bounded from the request, not its first timeout', async () => {
  identity = await createDeviceIdentity('unanswered-join'); pins = new MemoryIdentityStore();
  let answer: ((owned: boolean) => void) | undefined;
  const session = new VoiceSession(() => 'me', () => {}, () => {}, async () => false, 30);
  const work = session.join({ kind: 'channel', id: 'room' }, () => new Promise<boolean>((resolve) => { answer = resolve; }));
  try {
    await until(() => session.getSnapshot().phase === 'ended');
    assert.equal(session.getSnapshot().error, 'You were disconnected from the call.');
    assert.equal(Room.opened.at(-1)?.connects, 0);
    answer?.(true);
    await work;
    assert.equal(session.getSnapshot().phase, 'ended');
  } finally { answer?.(false); await session.leave(); }
});


/* ----------------- a gateway that does or does not confirm ownership ----------------- */

const { requestVoiceOwnership } = await import('../lib/voice-ownership');

/** A gateway socket the test controls, and the one capability its `ready` frame states. */
function fakeGateway() {
  const sent: ClientEvent[] = [];
  const listeners = new Set<(event: ServerEvent) => void>();
  const gateway = {
    isOpen: true,
    send(event: ClientEvent) { if (!gateway.isOpen) return false; sent.push(event); return true; },
  };
  const link = { confirms: undefined as boolean | undefined };
  const deps = {
    gateway: () => gateway,
    confirms: () => link.confirms,
    listen: (listener: (event: ServerEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    intent: (place: { kind: 'channel' | 'dm'; id: string }, join: true | 'resume', requestId: string) => ({
      channelId: place.id, dmId: null, join, requestId, tabId: 'tab',
    }),
    timeoutMs: 40,
  };
  const voiceStates = () => sent.filter((event) => event.t === 'voice_state');
  return { gateway, link, deps, sent, listeners, voiceStates };
}

test('a gateway that never confirms ownership still lets a join reach the token and media connect', async () => {
  identity = await createDeviceIdentity('old-gateway-join'); pins = new MemoryIdentityStore();
  const fake = fakeGateway();
  fake.link.confirms = false; // its `ready` had no voiceOwnership
  const ends: string[] = [];
  const place = { kind: 'channel' as const, id: 'room' };
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase),
    (where) => requestVoiceOwnership(fake.deps, where, 'resume'));
  try {
    await session.join(place, () => requestVoiceOwnership(fake.deps, place, true));
    assert.equal(session.getSnapshot().phase, 'connected');
    assert.equal(Room.opened.at(-1)?.connects, 1, 'media connected once, on the first attempt');
    // Outlast the ownership timeout: nothing may tear the call down and ask again.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(session.getSnapshot().phase, 'connected');
    assert.equal(fake.voiceStates().length, 1, 'one join announced, so no membership churn for everyone else');
    assert.deepEqual(ends, []);
  } finally { await session.leave(); }
});

test('a gateway that never confirms ownership resumes after a reconnect without a retry loop', async () => {
  identity = await createDeviceIdentity('old-gateway-resume'); pins = new MemoryIdentityStore();
  const fake = fakeGateway();
  fake.link.confirms = false;
  const ends: string[] = [];
  const place = { kind: 'channel' as const, id: 'room' };
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ends.push(phase),
    (where) => requestVoiceOwnership(fake.deps, where, 'resume'));
  try {
    await session.join(place, () => requestVoiceOwnership(fake.deps, place, true));
    assert.equal(session.getSnapshot().phase, 'connected');
    // The socket drops: the client waits, saying nothing to the gateway.
    fake.gateway.isOpen = false; fake.link.confirms = undefined;
    session.gatewayLost();
    await until(() => session.getSnapshot().phase === 'connecting' && session.getSnapshot().error !== null);
    assert.equal(fake.voiceStates().length, 1);
    // The new connection opens, but until its `ready` lands the client still says nothing.
    fake.gateway.isOpen = true;
    await session.resume();
    assert.equal(fake.voiceStates().length, 1, 'no join before the new connection says what it can do');
    // `ready` without voiceOwnership arrives and resumes the call.
    fake.link.confirms = false;
    const connectsBefore = Room.opened.reduce((total, room) => total + room.connects, 0);
    await session.resume();
    assert.equal(session.getSnapshot().phase, 'connected');
    assert.equal(Room.opened.reduce((total, room) => total + room.connects, 0), connectsBefore + 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(session.getSnapshot().phase, 'connected');
    const sentJoins = fake.voiceStates().map((event) => event.d.join);
    assert.deepEqual(sentJoins, [true, 'resume'], 'one join and one resume, nothing repeated');
    assert.deepEqual(ends, []);
  } finally { await session.leave(); }
});

test('a gateway that advertises ownership is still waited on, and still bounded', async () => {
  const fake = fakeGateway();
  fake.link.confirms = true;
  const place = { kind: 'channel' as const, id: 'room' };
  const answered = requestVoiceOwnership(fake.deps, place, true);
  const asked = fake.voiceStates()[0]!;
  assert.equal(fake.listeners.size, 1, 'it is listening for the answer');
  for (const listener of [...fake.listeners]) listener({ t: 'voice_owned', d: { roomId: 'room', requestId: asked.d.requestId! } });
  assert.equal(await answered, true);
  assert.equal(fake.listeners.size, 0);

  const replaced = requestVoiceOwnership(fake.deps, place, 'resume');
  const second = fake.voiceStates()[1]!;
  for (const listener of [...fake.listeners]) listener({ t: 'error', d: { code: 'voice_replaced', message: 'moved', requestId: second.d.requestId! } });
  assert.equal(await replaced, false);

  const silent = requestVoiceOwnership(fake.deps, place, true);
  await assert.rejects(silent, (problem) => problem instanceof VoiceGatewayUnavailable && problem.retry === true);
  assert.equal(fake.listeners.size, 0);
});

test('a connection that has not said what it can do is not sent a join', async () => {
  const fake = fakeGateway();
  await assert.rejects(requestVoiceOwnership(fake.deps, { kind: 'channel', id: 'room' }, true), VoiceGatewayUnavailable);
  assert.equal(fake.sent.length, 0);
});

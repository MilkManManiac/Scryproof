import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { DisconnectReason } from 'livekit-client';

// Vite supplies the worker constructor; Node exercises session decisions and
// lifecycle without starting a media worker or a browser.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'livekit-client/e2ee-worker?worker') return {
    url: 'data:text/javascript,export default class Worker {}', shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });
Object.assign(globalThis, { window: {} });
const { callDisconnect, shouldJoinCall, VoiceSession } = await import('../lib/voice-session');

test('duplicate identity ends as moved; other disconnects fail and can rejoin', () => {
  assert.deepEqual(callDisconnect(DisconnectReason.DUPLICATE_IDENTITY), {
    phase: 'moved', error: 'You joined this call from another device.',
  });
  for (const reason of [undefined, DisconnectReason.CLIENT_INITIATED, DisconnectReason.SERVER_SHUTDOWN]) {
    assert.equal(callDisconnect(reason).phase, 'failed');
  }
  for (const kind of ['channel', 'dm'] as const) {
    const place = { kind, id: 'same-place' };
    assert.equal(shouldJoinCall(place, place, 'connected'), false);
    assert.equal(shouldJoinCall(place, place, 'connecting'), false);
    assert.equal(shouldJoinCall(place, place, 'failed'), true);
    assert.equal(shouldJoinCall(place, place, 'moved'), true);
    assert.equal(shouldJoinCall(null, place, 'idle'), true);
  }
});

test('ending a session publishes the reason and informs the presence owner', async () => {
  const ended: string[] = [];
  const session = new VoiceSession(() => 'me', () => {}, (phase) => ended.push(phase));
  await session.end('failed', 'The call connection was lost.');
  assert.equal(session.getSnapshot().phase, 'failed');
  assert.equal(session.getSnapshot().encrypted, false);
  await session.end('moved', 'You joined this call from another device.');
  assert.equal(session.getSnapshot().phase, 'moved');
  assert.equal(session.getSnapshot().error, 'You joined this call from another device.');
  assert.deepEqual(ended, ['failed', 'moved']);
});

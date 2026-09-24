/**
 * Hostile-server review, 2026-09-24: the voice verification code.
 *
 * The panel says matching twenty-digit codes mean "nobody is in the middle,
 * including this server." That holds only if each device puts its own real
 * identity into the code. `VoiceCall.admit` takes any correctly self-signed
 * announcement that claims this device's own user and device id as 'known'
 * and stores it over this device's own seat, and `verificationCode` reads the
 * seat back from that map. A server that substitutes both sides of a call can
 * therefore hand each device the same pair of impostor keys, and the two codes
 * match while it holds every media key.
 *
 * Expected to FAIL until `admit` refuses an announcement for this device's own
 * seat whose key is not this device's key.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  type Announcement,
  MemoryIdentityStore,
  VoiceCall,
  announce,
  createCallKeypair,
  createDeviceIdentity,
} from '../lib/voice-crypto';

const CALL = 'call-01H0000000000000000000';

interface Device {
  userId: string;
  deviceId: string;
  call: VoiceCall;
  announcement: Announcement;
  fingerprint: string;
}

async function makeDevice(userId: string): Promise<Device> {
  const deviceId = `${userId}-device`;
  const identity = await createDeviceIdentity(deviceId);
  const callKeys = await createCallKeypair();
  const call = new VoiceCall({ callId: CALL, userId, identity, callKeys, pins: new MemoryIdentityStore() });
  return { userId, deviceId, call, announcement: await announce(CALL, userId, identity, callKeys), fingerprint: identity.fingerprint };
}

/** What the server makes for a seat it wants to sit in: its own keys, the victim's names, a valid signature. */
async function impostorFor(victim: Device): Promise<{ announcement: Announcement; fingerprint: string }> {
  const identity = await createDeviceIdentity(victim.deviceId);
  const callKeys = await createCallKeypair();
  return { announcement: await announce(CALL, victim.userId, identity, callKeys), fingerprint: identity.fingerprint };
}

const seatOf = (call: VoiceCall, userId: string, deviceId: string) =>
  call.members.find((member) => member.announcement.userId === userId && member.announcement.deviceId === deviceId);

describe('hostile server: voice verification code', () => {
  test('control: substituting only the other person changes the code, so reading it aloud catches the server', async () => {
    const [alice, bob] = await Promise.all([makeDevice('alice'), makeDevice('bob')]);
    const bobFake = await impostorFor(bob);
    const aliceFake = await impostorFor(alice);

    await alice.call.admit([alice.announcement, bobFake.announcement]);
    await bob.call.admit([bob.announcement, aliceFake.announcement]);

    assert.equal(seatOf(alice.call, 'bob', bob.deviceId)?.fingerprint, bobFake.fingerprint, 'precondition: alice is talking to the server');
    assert.notEqual(await alice.call.verificationCode(), await bob.call.verificationCode());
  });

  test('an announcement claiming this device, with another key, does not replace this device in the call', async () => {
    const alice = await makeDevice('alice');
    const aliceFake = await impostorFor(alice);

    await alice.call.admit([alice.announcement]);
    await alice.call.admit([aliceFake.announcement]);

    assert.equal(seatOf(alice.call, 'alice', alice.deviceId)?.fingerprint, alice.fingerprint);
  });

  test('a server that substitutes both people, and both people’s own seats, cannot make the codes match', async () => {
    const [alice, bob] = await Promise.all([makeDevice('alice'), makeDevice('bob')]);
    const aliceFake = await impostorFor(alice);
    const bobFake = await impostorFor(bob);

    // Each joins with their own announcement, as the session does (voice-session.ts:406).
    await alice.call.admit([alice.announcement]);
    await bob.call.admit([bob.announcement]);
    // The server relays: to alice, bob's impostor and an impostor for alice herself; to bob, the mirror.
    await alice.call.admit([bobFake.announcement, aliceFake.announcement]);
    await bob.call.admit([aliceFake.announcement, bobFake.announcement]);

    // Precondition: the server really is in the middle. Alice's media key goes to the server's key for bob.
    assert.equal(seatOf(alice.call, 'bob', bob.deviceId)?.fingerprint, bobFake.fingerprint);
    assert.equal(seatOf(bob.call, 'alice', alice.deviceId)?.fingerprint, aliceFake.fingerprint);

    assert.notEqual(
      await alice.call.verificationCode(),
      await bob.call.verificationCode(),
      'matching codes told alice and bob nobody was in the middle, and the server was',
    );
  });
});

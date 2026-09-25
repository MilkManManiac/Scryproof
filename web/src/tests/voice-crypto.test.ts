/**
 * Voice key agreement, including a server that lies.
 *
 * The rule under test is non-negotiable 8: no key that decrypts members'
 * content ever exists on the server. Everything here runs on WebCrypto, which
 * Node has, so the whole protocol is exercised for real — real P-256 keys,
 * real ECDH, real AES-GCM — with the gateway replaced by a function that is
 * free to tamper with anything passing through it.
 *
 * The malicious-server cases are the point of the file. A test suite for this
 * that only checks the happy path proves that two honest clients can agree on
 * a key, which was never in doubt.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import {
  type Announcement,
  MemoryIdentityStore,
  needsConsent,
  VoiceCall,
  type WrappedKey,
  announce,
  createCallKeypair,
  createDeviceIdentity,
  createMediaKey,
  fingerprintOf,
  fromBase64,
  pinIdentity,
  toBase64,
  unwrapMediaKey,
  verificationCode,
  verifyAnnouncement,
  wrapMediaKey,
} from '../lib/voice-crypto';

const CALL = 'call-01H0000000000000000000';

/** One person's device, with everything a call needs from it. */
interface Device {
  userId: string;
  call: VoiceCall;
  announcement: Announcement;
}

async function makeDevice(userId: string, callId = CALL): Promise<Device> {
  const identity = await createDeviceIdentity(`${userId}-device`);
  const callKeys = await createCallKeypair();
  const call = new VoiceCall({
    callId,
    userId,
    identity,
    callKeys,
    pins: new MemoryIdentityStore(),
  });
  return { userId, call, announcement: await announce(callId, userId, identity, callKeys) };
}

/**
 * Put everyone in the same call and hand each device's key to the others.
 * This is what an honest gateway does: relay, and nothing else.
 */
async function connect(devices: Device[], epoch = 1): Promise<void> {
  const announcements = devices.map((device) => device.announcement);
  for (const device of devices) await device.call.admit(announcements);
  // The gateway hands everybody the same epoch number with the membership
  // event; a device that counted its own would disagree with a room it joined
  // late, and its keys would not open.
  for (const device of devices) device.call.rotate(epoch);
  await deliver(devices);
}

async function deliver(devices: Device[], tamper: (key: WrappedKey) => WrappedKey = (key) => key) {
  for (const sender of devices) {
    for (const wrapped of await sender.call.distribute()) {
      const recipient = devices.find((device) => device.userId === wrapped.recipientId);
      await recipient?.call.accept(tamper(wrapped));
    }
  }
}

const sameBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a !== null && b !== null && a.length === b.length && a.every((byte, i) => byte === b[i]);

/* ------------------------------------------------------------------ */

describe('an honest call', () => {
  let wes: Device;
  let alex: Device;
  let mara: Device;

  before(async () => {
    [wes, alex, mara] = await Promise.all([makeDevice('wes'), makeDevice('alex'), makeDevice('mara')]);
    await connect([wes, alex, mara]);
  });

  test('every device ends up holding every other device’s media key', () => {
    assert.ok(sameBytes(alex.call.keyFor('wes', 'wes-device'), wes.call.mediaKey));
    assert.ok(sameBytes(mara.call.keyFor('wes', 'wes-device'), wes.call.mediaKey));
    assert.ok(sameBytes(wes.call.keyFor('alex', 'alex-device'), alex.call.mediaKey));
    assert.ok(sameBytes(mara.call.keyFor('alex', 'alex-device'), alex.call.mediaKey));
  });

  test('each person invented their own key, and they are all different', () => {
    assert.ok(!sameBytes(wes.call.mediaKey, alex.call.mediaKey));
    assert.ok(!sameBytes(alex.call.mediaKey, mara.call.mediaKey));
  });

  test('nobody is left silent', () => {
    assert.deepEqual(wes.call.silent, []);
    assert.deepEqual(alex.call.silent, []);
  });

  test('everyone reads the same verification code', async () => {
    const codes = await Promise.all([
      wes.call.verificationCode(),
      alex.call.verificationCode(),
      mara.call.verificationCode(),
    ]);
    assert.equal(codes[0], codes[1]);
    assert.equal(codes[1], codes[2]);
    assert.match(codes[0]!, /^\d{5} \d{5} \d{5} \d{5}$/);
  });
});

describe('the server never sees a key', () => {
  test('what crosses the wire is an announcement and a sealed blob, and nothing else', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await wes.call.admit([wes.announcement, alex.announcement]);
    wes.call.rotate();
    const [wrapped] = await wes.call.distribute();

    // Everything the gateway relays, as it would serialise it.
    const onTheWire = JSON.stringify({ announcement: wes.announcement, wrapped });

    assert.ok(!onTheWire.includes(toBase64(wes.call.mediaKey)));
    // And the wrapped blob is not the key with a different coat of paint.
    assert.ok(!sameBytes(fromBase64(wrapped!.ciphertext), wes.call.mediaKey));
  });

  test('a private key cannot be exported, even by code running on the page', async () => {
    const identity = await createDeviceIdentity();
    await assert.rejects(() => globalThis.crypto.subtle.exportKey('pkcs8', identity.privateKey));
  });
});

describe('a server that lies', () => {
  test('it cannot substitute a call key: the signature is over both', async () => {
    const wes = await makeDevice('wes');
    const attacker = await createCallKeypair();

    const forged: Announcement = {
      ...wes.announcement,
      callKey: toBase64(attacker.publicKeyBytes),
    };

    assert.equal(await verifyAnnouncement(CALL, forged), false);
  });

  test('substituting both keys is caught by the pin, not silently accepted', async () => {
    const store = new MemoryIdentityStore();
    const real = await createDeviceIdentity('alex-device');
    const impostor = await createDeviceIdentity('alex-device');

    const first = await pinIdentity(store, 'alex', 'alex-device', real.fingerprint);
    assert.equal(first, 'first-seen');

    // The next call, the relay swaps in a key it holds the private half of.
    const second = await pinIdentity(store, 'alex', 'alex-device', impostor.fingerprint);
    assert.equal(second, 'changed');

    // And the change was not written over the old one behind anyone's back.
    assert.equal(await store.get('alex', 'alex-device'), real.fingerprint);
  });

  test('inventing a new device id does not get round the pin', async () => {
    // Pins are per device. So the quiet way past the test above is not to
    // change Alex's key but to claim Alex has a second device, which has no
    // old key to disagree with. That must not arrive looking like first contact.
    const store = new MemoryIdentityStore();
    const real = await createDeviceIdentity('alex-laptop');
    const impostor = await createDeviceIdentity('alex-totally-real-phone');

    assert.equal(await pinIdentity(store, 'alex', 'alex-laptop', real.fingerprint), 'first-seen');

    const verdict = await pinIdentity(store, 'alex', 'alex-totally-real-phone', impostor.fingerprint);
    assert.equal(verdict, 'new-device');
    assert.equal(needsConsent(verdict), true);

    // Not pinned on sight: asking again gives the same answer until a person accepts.
    assert.equal(await store.get('alex', 'alex-totally-real-phone'), null);
    assert.equal(
      await pinIdentity(store, 'alex', 'alex-totally-real-phone', impostor.fingerprint),
      'new-device',
    );
  });

  test('somebody nobody has met is still ordinary first contact', async () => {
    const store = new MemoryIdentityStore();
    const mara = await createDeviceIdentity('mara-laptop');
    await pinIdentity(store, 'alex', 'alex-laptop', 'unrelated');

    const verdict = await pinIdentity(store, 'mara', 'mara-laptop', mara.fingerprint);
    assert.equal(verdict, 'first-seen');
    assert.equal(needsConsent(verdict), false);
  });

  test('a user id that is a prefix of another does not share its devices', async () => {
    // "al" must not be treated as already known because "alex" is.
    const store = new MemoryIdentityStore();
    await pinIdentity(store, 'alex', 'laptop', 'aaaa');
    assert.equal(await pinIdentity(store, 'al', 'laptop', 'bbbb'), 'first-seen');
  });

  test('a substituted identity changes the number everybody reads aloud', async () => {
    const real = await createDeviceIdentity();
    const impostor = await createDeviceIdentity();

    const honest = await verificationCode(CALL, [
      { userId: 'wes', fingerprint: 'aaaa' },
      { userId: 'alex', fingerprint: real.fingerprint },
    ]);
    const attacked = await verificationCode(CALL, [
      { userId: 'wes', fingerprint: 'aaaa' },
      { userId: 'alex', fingerprint: impostor.fingerprint },
    ]);

    assert.notEqual(honest, attacked);
  });

  test('a silent extra listener changes the code too', async () => {
    const two = await verificationCode(CALL, [
      { userId: 'wes', fingerprint: 'aaaa' },
      { userId: 'alex', fingerprint: 'bbbb' },
    ]);
    const three = await verificationCode(CALL, [
      { userId: 'wes', fingerprint: 'aaaa' },
      { userId: 'alex', fingerprint: 'bbbb' },
      { userId: 'ghost', fingerprint: 'cccc' },
    ]);
    assert.notEqual(two, three);
  });

  test('it cannot open a wrapped key it relayed', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await wes.call.admit([wes.announcement, alex.announcement]);
    wes.call.rotate();
    const [wrapped] = await wes.call.distribute();

    // The server has its own keypair and all the public material it relayed.
    const server = await makeDevice('server');
    const opened = await unwrapMediaKey({
      callId: CALL,
      wrapped: wrapped!,
      recipientId: wrapped!.recipientId,
      recipientDeviceId: wrapped!.recipientDeviceId,
      recipientCallKey: server.call.callKeys.privateKey,
      sender: wes.announcement,
    });

    assert.equal(opened, null);
  });

  test('it cannot re-address somebody else’s wrapped key to a third person', async () => {
    const [wes, alex, mara] = await Promise.all([
      makeDevice('wes'),
      makeDevice('alex'),
      makeDevice('mara'),
    ]);
    const announcements = [wes.announcement, alex.announcement, mara.announcement];
    for (const device of [wes, alex, mara]) await device.call.admit(announcements);
    for (const device of [wes, alex, mara]) device.call.rotate(1);

    const forAlex = (await wes.call.distribute()).find((key) => key.recipientId === 'alex')!;
    const readdressed: WrappedKey = { ...forAlex, recipientId: 'mara', recipientDeviceId: 'mara-device' };

    assert.equal(await mara.call.accept(readdressed), null);
  });

  test('it cannot replay a key from an earlier epoch', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await connect([wes, alex]);

    const stale = (await wes.call.distribute())[0]!;

    // Somebody joins, so everybody rotates.
    wes.call.rotate();
    alex.call.rotate();

    assert.equal(await alex.call.accept(stale), null);
  });

  test('a key whose epoch label is rewritten still does not open', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await connect([wes, alex]);
    const wrapped = (await wes.call.distribute())[0]!;

    wes.call.rotate();
    alex.call.rotate();

    // The epoch is inside the authenticated data as well as in the header, so
    // relabelling it breaks the tag rather than getting past the check above.
    assert.equal(await alex.call.accept({ ...wrapped, epoch: alex.call.epoch }), null);
  });

  test('it cannot re-attribute a key to a device its owner does not have', async () => {
    // This is the case only the authenticated headers catch, and it took a
    // sabotage run to notice it was missing. Every other tampering is already
    // stopped earlier: the epoch and the two user ids go into the derivation,
    // so changing them produces a different key, and the call keys are
    // pairwise, so a third party cannot derive it at all. The device ids are
    // in neither, which leaves exactly this move.
    //
    // A relay claims Wes has a second device, reusing the call key it already
    // relayed, and relabels the wrapped key as coming from it. If that landed,
    // Alex would file Wes's key under a device Wes has never owned — and the
    // list of who can be heard is keyed by device.
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    const wrapped = await wrapMediaKey({
      callId: CALL,
      epoch: 1,
      mediaKey: createMediaKey(),
      senderId: 'wes',
      senderDeviceId: 'wes-device',
      senderCallKey: wes.call.callKeys.privateKey,
      recipient: alex.announcement,
    });

    const opened = await unwrapMediaKey({
      callId: CALL,
      wrapped: { ...wrapped, senderDeviceId: 'wes-laptop' },
      recipientId: 'alex',
      recipientDeviceId: 'alex-device',
      recipientCallKey: alex.call.callKeys.privateKey,
      // The relay's story about that second device, carrying the real call key.
      sender: { ...wes.announcement, deviceId: 'wes-laptop' },
    });

    assert.equal(opened, null);
  });

  test('a flipped bit in the ciphertext is a refusal, not a wrong key', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await wes.call.admit([wes.announcement, alex.announcement]);
    await alex.call.admit([wes.announcement, alex.announcement]);
    wes.call.rotate();
    alex.call.rotate();

    const wrapped = (await wes.call.distribute()).find((key) => key.recipientId === 'alex')!;
    const bytes = fromBase64(wrapped.ciphertext);
    bytes[0] = bytes[0]! ^ 0x01;

    assert.equal(await alex.call.accept({ ...wrapped, ciphertext: toBase64(bytes) }), null);
  });

  test('a second, different key for one sender in one epoch is refused', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await connect([wes, alex]);

    const real = (await wes.call.distribute()).find((key) => key.recipientId === 'alex')!;
    assert.ok(sameBytes(await alex.call.accept(real), wes.call.mediaKey));

    // Wes's own device wraps a different key under the same headers. Even
    // though this opens, taking it would let a relay that replayed a captured
    // wrap steer Alex onto a key nobody else is using.
    const swapped = await wrapMediaKey({
      callId: CALL,
      epoch: wes.call.epoch,
      mediaKey: createMediaKey(),
      senderId: 'wes',
      senderDeviceId: 'wes-device',
      senderCallKey: wes.call.callKeys.privateKey,
      recipient: alex.announcement,
    });

    assert.equal(await alex.call.accept(swapped), null);
    assert.ok(sameBytes(alex.call.keyFor('wes', 'wes-device'), wes.call.mediaKey));
  });

  test('an unsigned stranger is dropped from the call, not shown as a member', async () => {
    const wes = await makeDevice('wes');
    const ghost = await makeDevice('ghost');
    const forged: Announcement = { ...ghost.announcement, signature: toBase64(new Uint8Array(64)) };

    const result = await wes.call.admit([wes.announcement, forged]);

    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.userId, 'ghost');
    assert.deepEqual(
      wes.call.members.map((member) => member.announcement.userId),
      ['wes'],
    );
  });

  test('an announcement replayed from another call does not verify', async () => {
    const wes = await makeDevice('wes', 'call-one');
    assert.equal(await verifyAnnouncement('call-one', wes.announcement), true);
    assert.equal(await verifyAnnouncement('call-two', wes.announcement), false);
  });

  test('an announcement re-attributed to another user does not verify', async () => {
    const wes = await makeDevice('wes');
    assert.equal(await verifyAnnouncement(CALL, { ...wes.announcement, userId: 'alex' }), false);
  });

  test('an announcement claiming this device, with another key, is refused', async () => {
    // The relay's most direct move on the verification code: sign an
    // announcement with a key of its own, but under this device's own user and
    // device id, so it would land in this device's own slot.
    const wes = await makeDevice('wes');
    const impostor = await makeDevice('wes');
    await wes.call.admit([wes.announcement]);

    const result = await wes.call.admit([impostor.announcement]);

    assert.equal(result.rejected.length, 1);
    assert.deepEqual(
      wes.call.members.map((member) => member.fingerprint),
      [wes.call.identity.fingerprint],
    );
  });

  test('an impostor in this device’s own seat cannot change the number read aloud', async () => {
    const wes = await makeDevice('wes');
    const alex = await makeDevice('alex');
    const impostor = await makeDevice('wes');
    await wes.call.admit([wes.announcement, alex.announcement]);
    const honest = await wes.call.verificationCode();

    await wes.call.admit([impostor.announcement]);

    assert.equal(await wes.call.verificationCode(), honest);
  });

  test('two devices of one person give the same code in any order', async () => {
    // One person can be in a call on two devices, so the members list can hold
    // two entries with the same user id. The relay picks the order it hands
    // them to each screen; the code must not depend on that choice.
    const asAliceHeardIt = await verificationCode(CALL, [
      { userId: 'wes', fingerprint: 'aaaa' },
      { userId: 'alex', fingerprint: 'bbbb' },
      { userId: 'alex', fingerprint: 'cccc' },
    ]);
    const asBobHeardIt = await verificationCode(CALL, [
      { userId: 'alex', fingerprint: 'cccc' },
      { userId: 'wes', fingerprint: 'aaaa' },
      { userId: 'alex', fingerprint: 'bbbb' },
    ]);

    assert.equal(asAliceHeardIt, asBobHeardIt);
  });
});

describe('rotation', () => {
  test('leaving means the leaver cannot decrypt what is said next', async () => {
    const [wes, alex, mara] = await Promise.all([
      makeDevice('wes'),
      makeDevice('alex'),
      makeDevice('mara'),
    ]);
    await connect([wes, alex, mara]);

    const keyMaraHeld = mara.call.keyFor('wes', 'wes-device');
    assert.ok(sameBytes(keyMaraHeld, wes.call.mediaKey));

    // Mara leaves. The two who remain rotate.
    wes.call.remove('mara', 'mara-device');
    alex.call.remove('mara', 'mara-device');
    wes.call.rotate(2);
    alex.call.rotate(2);
    await deliver([wes, alex]);

    assert.ok(!sameBytes(keyMaraHeld, wes.call.mediaKey));
    assert.ok(sameBytes(alex.call.keyFor('wes', 'wes-device'), wes.call.mediaKey));
  });

  test('joining means the newcomer cannot decrypt what came before', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await connect([wes, alex]);
    const before = wes.call.mediaKey;

    const mara = await makeDevice('mara');
    const everyone = [wes.announcement, alex.announcement, mara.announcement];
    for (const device of [wes, alex, mara]) await device.call.admit(everyone);
    for (const device of [wes, alex, mara]) device.call.rotate(2);
    await deliver([wes, alex, mara]);

    assert.ok(!sameBytes(mara.call.keyFor('wes', 'wes-device'), before));
    assert.ok(sameBytes(mara.call.keyFor('wes', 'wes-device'), wes.call.mediaKey));
  });

  test('the epoch only ever goes up', async () => {
    const wes = await makeDevice('wes');
    const first = wes.call.rotate();
    const second = wes.call.rotate();
    assert.equal(second, first + 1);
  });
});

describe('who can be heard', () => {
  test('a participant with no key yet is reported, not assumed', async () => {
    const [wes, alex] = await Promise.all([makeDevice('wes'), makeDevice('alex')]);
    await wes.call.admit([wes.announcement, alex.announcement]);
    wes.call.rotate();

    assert.deepEqual(
      wes.call.silent.map((member) => member.announcement.userId),
      ['alex'],
    );
  });

  test('first contact is flagged, and the same key next time is not', async () => {
    const pins = new MemoryIdentityStore();
    const alex = await makeDevice('alex');
    const alexFingerprint = await fingerprintOf(fromBase64(alex.announcement.identityKey));

    assert.equal(await pinIdentity(pins, 'alex', 'alex-device', alexFingerprint), 'first-seen');
    assert.equal(await pinIdentity(pins, 'alex', 'alex-device', alexFingerprint), 'known');
  });

  test('our own device is never flagged to us', async () => {
    const wes = await makeDevice('wes');
    const result = await wes.call.admit([wes.announcement]);
    assert.deepEqual(result.flagged, []);
  });
});

describe('a device nobody expected', () => {
  /**
   * Wes has met Alex before, on Alex's laptop. Now something claiming to be
   * Alex turns up on a device Wes has never seen. It might be a new phone. It
   * might be the relay. Until Wes says which, it is not in the call.
   */
  async function scene() {
    const pins = new MemoryIdentityStore();
    await pinIdentity(pins, 'alex', 'alex-laptop', 'the-key-wes-remembers');

    const identity = await createDeviceIdentity('wes-device');
    const callKeys = await createCallKeypair();
    const wes = new VoiceCall({ callId: CALL, userId: 'wes', identity, callKeys, pins });
    const wesAnnouncement = await announce(CALL, 'wes', identity, callKeys);

    const strangerIdentity = await createDeviceIdentity('alex-new-phone');
    const strangerKeys = await createCallKeypair();
    const stranger = new VoiceCall({
      callId: CALL,
      userId: 'alex',
      identity: strangerIdentity,
      callKeys: strangerKeys,
      pins: new MemoryIdentityStore(),
    });
    const strangerAnnouncement = await announce(CALL, 'alex', strangerIdentity, strangerKeys);

    return { wes, wesAnnouncement, stranger, strangerAnnouncement };
  }

  test('it is flagged, held, and not counted as a participant', async () => {
    const { wes, wesAnnouncement, strangerAnnouncement } = await scene();
    const result = await wes.admit([wesAnnouncement, strangerAnnouncement]);

    assert.equal(result.flagged.length, 1);
    assert.equal(result.flagged[0]!.verdict, 'new-device');
    assert.equal(wes.awaitingConsent.length, 1);
    assert.deepEqual(wes.members.map((member) => member.announcement.userId), ['wes']);
  });

  test('it is sent no key', async () => {
    const { wes, wesAnnouncement, strangerAnnouncement } = await scene();
    await wes.admit([wesAnnouncement, strangerAnnouncement]);
    wes.rotate(1);

    assert.deepEqual(await wes.distribute(), []);
  });

  test('its own key is refused, so it cannot be heard either', async () => {
    const { wes, wesAnnouncement, stranger, strangerAnnouncement } = await scene();
    await wes.admit([wesAnnouncement, strangerAnnouncement]);
    await stranger.admit([wesAnnouncement, strangerAnnouncement]);
    wes.rotate(1);
    stranger.rotate(1);

    const [fromStranger] = await stranger.distribute();
    assert.ok(fromStranger, 'the stranger has no reason to hold back');
    assert.equal(await wes.accept(fromStranger), null);
  });

  test('it does not change the number read aloud until it is approved', async () => {
    const { wes, wesAnnouncement, strangerAnnouncement } = await scene();
    await wes.admit([wesAnnouncement]);
    const alone = await wes.verificationCode();

    await wes.admit([strangerAnnouncement]);
    assert.equal(await wes.verificationCode(), alone);

    await wes.approve('alex', 'alex-new-phone');
    assert.notEqual(await wes.verificationCode(), alone);
  });

  test('approving it releases keys in both directions and remembers the device', async () => {
    const { wes, wesAnnouncement, stranger, strangerAnnouncement } = await scene();
    await wes.admit([wesAnnouncement, strangerAnnouncement]);
    await stranger.admit([wesAnnouncement, strangerAnnouncement]);
    wes.rotate(1);
    stranger.rotate(1);

    const approved = await wes.approve('alex', 'alex-new-phone');
    assert.equal(approved?.verdict, 'known');
    assert.equal(wes.awaitingConsent.length, 0);

    const [toStranger] = await wes.distribute();
    assert.ok(sameBytes(await stranger.accept(toStranger!), wes.mediaKey));

    const [fromStranger] = await stranger.distribute();
    assert.ok(sameBytes(await wes.accept(fromStranger!), stranger.mediaKey));

    // Next call, the same phone is simply known.
    const again = await wes.admit([strangerAnnouncement]);
    assert.deepEqual(again.flagged, []);
  });

  test('approving something that is not waiting does nothing', async () => {
    const { wes } = await scene();
    assert.equal(await wes.approve('alex', 'never-announced'), null);
  });

  test('a held device that leaves is forgotten, not left waiting', async () => {
    const { wes, wesAnnouncement, strangerAnnouncement } = await scene();
    await wes.admit([wesAnnouncement, strangerAnnouncement]);
    wes.remove('alex', 'alex-new-phone');
    assert.equal(wes.awaitingConsent.length, 0);
  });
});

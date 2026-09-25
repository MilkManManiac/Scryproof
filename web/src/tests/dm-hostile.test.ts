/**
 * Hostile-server review, 2026-09-24: direct messages.
 *
 * Three of the review's smaller findings live here, and the fixes they got:
 * the server adding a device for somebody outside the conversation to the list
 * it hands out, reactions from devices nobody has accepted, and replays and
 * time-shifts (the same message shown again, or an old one shown as new).
 * Safety numbers are read off the same identity keys, so a comparison that
 * matches proves the server is not in the middle; the numbers themselves are
 * tested in `safety-number.test.ts`.
 *
 * Real P-256 keys and real AES-GCM throughout, as in `dm-crypto.test.ts`. The
 * server is played by the test, which may list any device it likes.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { DeviceKey } from '@scryproof/shared';

import {
  type AssessedDevice,
  type DmDevice,
  CLOCK_SLACK_MS,
  assessDevices,
  believedDevice,
  createDmKeypair,
  describeDevice,
  openMessage,
  recipientsFor,
  replayedIds,
  sealMessage,
  timeLooksMoved,
} from '../lib/dm-crypto';
import { MemoryIdentityStore, createDeviceIdentity } from '../lib/voice-crypto';

const DM = 'dm-01H0000000000000000000';

async function makeDevice(userId: string): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
}

/** A sealed body, as the server stores one: the bytes, under an id of its own. */
const row = (id: string, sealed: { iv: string; ciphertext: string }): { id: string; iv: string; ciphertext: string } => ({
  id,
  iv: sealed.iv,
  ciphertext: sealed.ciphertext,
});

describe('only members get a copy', () => {
  test('a trusted device of somebody outside the conversation is left out, and named', async () => {
    const store = new MemoryIdentityStore();
    const wesLaptop = await makeDevice('wes');
    const wesPhone = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');

    // Eve is a real person with a real, trusted device. She is simply not in
    // this conversation, which the server knows and does not care about.
    const known: AssessedDevice[] = [
      ...(await assessDevices(store, 'wes', [wesLaptop.published, wesPhone.published])),
      ...(await assessDevices(store, 'sam', [sam.published])),
      ...(await assessDevices(store, 'eve', [eve.published])),
    ];
    assert.equal(known.some((entry) => entry.device.userId === 'eve' && entry.verdict === 'invalid'), false);

    const { recipients, outsiders } = recipientsFor(known, new Set(['wes', 'sam']));

    // The members' devices, this person's own other device among them.
    assert.deepEqual(
      recipients.map((device) => device.deviceId).sort(),
      [sam.published.deviceId, wesLaptop.published.deviceId, wesPhone.published.deviceId].sort(),
    );
    // And the one the server added, so the conversation can say so.
    assert.deepEqual(outsiders.map((entry) => entry.device.deviceId), [eve.published.deviceId]);
  });

  test('a device somebody has not accepted is not a recipient, and is not a stranger either', async () => {
    const store = new MemoryIdentityStore();
    const samLaptop = await makeDevice('sam');
    await assessDevices(store, 'sam', [samLaptop.published]);
    const samTablet = await makeDevice('sam');
    const eve = await makeDevice('eve');

    const known: AssessedDevice[] = [
      ...(await assessDevices(store, 'sam', [samLaptop.published, samTablet.published])),
      ...(await assessDevices(store, 'eve', [eve.published])),
    ];

    const { recipients, outsiders } = recipientsFor(known, new Set(['sam']));
    assert.deepEqual(recipients.map((device) => device.deviceId), [samLaptop.published.deviceId]);
    assert.deepEqual(outsiders.map((entry) => entry.device.deviceId), [eve.published.deviceId]);
  });

  test('the outsider gets no copy of the message key and cannot open what was sent', async () => {
    const store = new MemoryIdentityStore();
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');
    const known: AssessedDevice[] = [
      ...(await assessDevices(store, 'wes', [wes.published])),
      ...(await assessDevices(store, 'sam', [sam.published])),
      ...(await assessDevices(store, 'eve', [eve.published])),
    ];

    const { recipients } = recipientsFor(known, new Set(['wes', 'sam']));
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'two of us' }, recipients });

    const opened = await openMessage({ dmId: DM, self: eve.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
    assert.deepEqual(opened, { ok: false, reason: 'no-key' });
    // The people it was locked for still read it.
    const theirs = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
    assert.deepEqual(theirs, { ok: true, body: { v: 1, text: 'two of us' }, legacy: false });
  });
});

describe('reactions and replays', () => {
  test('a device nobody has accepted is not believed, so its reactions are not counted', async () => {
    const store = new MemoryIdentityStore();
    const samLaptop = await makeDevice('sam');
    const met = await assessDevices(store, 'sam', [samLaptop.published]);
    const samTablet = await makeDevice('sam');
    const planted = await assessDevices(store, 'sam', [samTablet.published]);
    assert.deepEqual(planted.map((entry) => entry.verdict), ['new-device']);

    const known = [...met, ...planted];
    assert.equal(believedDevice(known, 'sam', samLaptop.published.deviceId)?.verdict, 'first-seen');
    assert.equal(believedDevice(known, 'sam', samTablet.published.deviceId), null);
    // A device of theirs the server listed, but never theirs. Nothing to believe.
    assert.equal(believedDevice(known, 'eve', samTablet.published.deviceId), null);
  });

  test('a key that changed is not believed either, whatever the verdict used to be', async () => {
    const store = new MemoryIdentityStore();
    const samLaptop = await makeDevice('sam');
    await assessDevices(store, 'sam', [samLaptop.published]);

    const forged: DmDevice = {
      userId: 'sam',
      identity: await createDeviceIdentity(samLaptop.device.identity.deviceId),
      dm: await createDmKeypair(),
    };
    const swapped = await assessDevices(store, 'sam', [await describeDevice(forged)]);
    assert.deepEqual(swapped.map((entry) => entry.verdict), ['changed']);
    assert.equal(believedDevice(swapped, 'sam', samLaptop.published.deviceId), null);
  });

  test('the same sealed bytes under a second id are a repeat, and only the earliest is drawn', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'yes' }, recipients: [sam.published] });

    const rows = [
      row('00000000-0000-7000-8000-000000000002', sealed),
      row('00000000-0000-7000-8000-000000000001', sealed),
    ];
    assert.deepEqual(replayedIds(rows), ['00000000-0000-7000-8000-000000000002']);
    const drawn = rows.filter((entry) => !replayedIds(rows).includes(entry.id));
    assert.deepEqual(drawn.map((entry) => entry.id), ['00000000-0000-7000-8000-000000000001']);
  });

  test('messages that are not repeats of each other are all drawn', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const one = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'one' }, recipients: [sam.published] });
    const two = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'two' }, recipients: [sam.published] });

    const rows = [
      row('00000000-0000-7000-8000-000000000001', one),
      row('00000000-0000-7000-8000-000000000002', two),
    ];
    assert.deepEqual(replayedIds(rows), []);

    // The same one-time IV twice, with different words under it, is a repeat:
    // a sender never reuses one, so the second is the server's doing.
    const reused = [
      row('00000000-0000-7000-8000-000000000001', one),
      { id: '00000000-0000-7000-8000-000000000002', iv: one.iv, ciphertext: two.ciphertext },
    ];
    assert.deepEqual(replayedIds(reused), ['00000000-0000-7000-8000-000000000002']);

    // A row with nothing sealed in it is a message that did not open, not a repeat.
    assert.deepEqual(
      replayedIds([
        { id: 'a', iv: '', ciphertext: '' },
        { id: 'b', iv: '', ciphertext: '' },
      ]),
      [],
    );
  });
});

describe('the sender\'s own time', () => {
  test('a sealed time opens with the message, and a time that is not a number is dropped', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const when = Date.UTC(2026, 8, 24, 12, 0, 0);

    const sealed = await sealMessage({
      dmId: DM,
      sender: wes.device,
      body: { v: 1, text: 'the-words-the-server-must-not-see', at: when },
      recipients: [sam.published],
    });
    assert.equal(JSON.stringify(sealed).includes('the-words'), false);
    const opened = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
    assert.deepEqual(opened, { ok: true, body: { v: 1, text: 'the-words-the-server-must-not-see', at: when }, legacy: false });

    // Words of the sender's own, with something in the time's place. The time
    // goes and the words stay: a message is not thrown away over a field the
    // reader would only use to draw a note.
    for (const odd of ['yesterday', Number.POSITIVE_INFINITY, { ms: when }]) {
      const strange = await sealMessage({
        dmId: DM,
        sender: wes.device,
        body: { v: 1, text: 'no clock', at: odd } as never,
        recipients: [sam.published],
      });
      const body = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...strange });
      assert.deepEqual(body, { ok: true, body: { v: 1, text: 'no clock' }, legacy: false });
    }
  });

  test('an old message shown as new is worth saying, and a minute of clock drift is not', () => {
    const at = Date.UTC(2026, 8, 24, 12, 0, 0);
    const server = new Date(at).toISOString();

    assert.equal(timeLooksMoved(at, server), false);
    assert.equal(timeLooksMoved(at + 59_000, server), false);
    assert.equal(timeLooksMoved(at - CLOCK_SLACK_MS + 1, server), false);
    assert.equal(timeLooksMoved(at + CLOCK_SLACK_MS + 1, server), true);

    // The attack this is for: the words were written a month ago and the
    // server says they arrived now. Only the sealed time can say otherwise.
    assert.equal(timeLooksMoved(at - 30 * 24 * 60 * 60_000, server), true);

    // Nothing to compare, so nothing is claimed.
    assert.equal(timeLooksMoved(null, server), false);
    assert.equal(timeLooksMoved(at, 'not a timestamp'), false);
  });
});

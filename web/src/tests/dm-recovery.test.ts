/**
 * The recovery phrase: twelve words that are a device, and the vouching that
 * lets a new laptop in without anybody's friends being asked.
 *
 * As in the DM suite, the server is played by the test and may lie.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { DeviceKey } from '@scryproof/shared';

import {
  type DmDevice,
  assessDevices,
  createDmKeypair,
  describeDevice,
  endorse,
  isTrusted,
  openMessage,
  rewrapKey,
  sealMessage,
  verifyDevice,
} from '../lib/dm-crypto';
import { isRecoveryDevice, newPhrase, phraseLooksRight, recoveryDevice, tidyPhrase } from '../lib/dm-recovery';
import { MemoryIdentityStore, createDeviceIdentity } from '../lib/voice-crypto';

const DM = 'dm-01H0000000000000000000';

async function makeDevice(userId: string): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
}

const verdicts = async (store: MemoryIdentityStore, userId: string, devices: DeviceKey[]) =>
  Object.fromEntries((await assessDevices(store, userId, devices)).map((entry) => [entry.device.deviceId, entry.verdict]));

describe('the words', () => {
  test('twelve of them, different every time, and they pass their own check', () => {
    const phrase = newPhrase();
    assert.equal(phrase.split(' ').length, 12);
    assert.notEqual(phrase, newPhrase());
    assert.equal(phraseLooksRight(phrase), true);
  });

  test('typed back with capitals, numbers and line breaks, they are the same words', () => {
    const phrase = newPhrase();
    const messy = phrase
      .split(' ')
      .map((word, index) => `${index + 1}. ${word.toUpperCase()}`)
      .join('\n');
    assert.equal(tidyPhrase(messy), phrase);
  });

  test('a wrong word is caught before it becomes a device', async () => {
    const words = newPhrase().split(' ');
    words[3] = words[3] === 'zoo' ? 'zone' : 'zoo';
    // One in sixteen wrong phrases passes the checksum by luck. Find one that does not.
    if (phraseLooksRight(words.join(' '))) words[4] = words[4] === 'abandon' ? 'ability' : 'abandon';
    if (phraseLooksRight(words.join(' '))) return;
    await assert.rejects(recoveryDevice('wes', words.join(' ')));
  });
});

describe('the device the words stand for', () => {
  test('the same words give the same device, every time', async () => {
    const phrase = newPhrase();
    const once = await describeDevice(await recoveryDevice('wes', phrase));
    const again = await describeDevice(await recoveryDevice('wes', `  ${phrase.toUpperCase()}  `));
    assert.equal(once.deviceId, again.deviceId);
    assert.equal(once.identityKey, again.identityKey);
    assert.equal(once.dmKey, again.dmKey);
    assert.equal(isRecoveryDevice(once.deviceId), true);
    assert.equal(await verifyDevice(once), true);
  });

  test('different words, or the same words on another account, are a different device', async () => {
    const phrase = newPhrase();
    const mine = await describeDevice(await recoveryDevice('wes', phrase));
    const theirs = await describeDevice(await recoveryDevice('sam', phrase));
    const other = await describeDevice(await recoveryDevice('wes', newPhrase()));
    assert.notEqual(mine.dmKey, theirs.dmKey);
    assert.notEqual(mine.dmKey, other.dmKey);
    assert.notEqual(mine.deviceId, other.deviceId);
  });

  test('its private keys cannot be read back out', async () => {
    const device = await recoveryDevice('wes', newPhrase());
    assert.equal(device.identity.privateKey.extractable, false);
    assert.equal(device.dm.privateKey.extractable, false);
    await assert.rejects(globalThis.crypto.subtle.exportKey('jwk', device.dm.privateKey));
  });

  test('a message locked to the phrase opens on a laptop that only has the words', async () => {
    const phrase = newPhrase();
    const sam = await makeDevice('sam');
    const published = await describeDevice(await recoveryDevice('wes', phrase));
    const sealed = await sealMessage({
      dmId: DM,
      sender: sam.device,
      body: { v: 1, text: 'the old laptop is gone' },
      recipients: [sam.published, published],
    });

    // Later, somewhere else, from the words alone.
    const rebuilt = await recoveryDevice('wes', phrase);
    const opened = await openMessage({ dmId: DM, self: rebuilt, authorId: 'sam', senderDevice: sam.published, ...sealed });
    assert.deepEqual(opened, { ok: true, body: { v: 1, text: 'the old laptop is gone' }, legacy: false });

    const wrong = await recoveryDevice('wes', newPhrase());
    const refused = await openMessage({ dmId: DM, self: wrong, authorId: 'sam', senderDevice: sam.published, ...sealed });
    assert.equal(refused.ok, false);
  });
});

describe('vouching', () => {
  test('a friend who trusts the laptop trusts the phrase, and then the next laptop, unasked', async () => {
    const laptop = await makeDevice('wes');
    const phrase = await recoveryDevice('wes', newPhrase());
    const desktop = await makeDevice('wes');

    const sam = new MemoryIdentityStore();
    assert.deepEqual(await verdicts(sam, 'wes', [laptop.published]), { [laptop.published.deviceId]: 'first-seen' });

    const phrasePublished = {
      ...(await describeDevice(phrase)),
      endorsedBy: await endorse('wes', laptop.device.identity, await describeDevice(phrase)),
    };
    const desktopPublished = { ...desktop.published, endorsedBy: await endorse('wes', phrase.identity, desktop.published) };

    // Listed back to front, so the chain has to be followed rather than stumbled on.
    const seen = await verdicts(sam, 'wes', [desktopPublished, phrasePublished, laptop.published]);
    assert.equal(seen[laptop.published.deviceId], 'known');
    assert.equal(isTrusted(seen[phrasePublished.deviceId]!), true);
    assert.equal(isTrusted(seen[desktopPublished.deviceId]!), true);

    // And it is remembered: next time they are simply known.
    const later = await verdicts(sam, 'wes', [desktopPublished, phrasePublished, laptop.published]);
    assert.deepEqual(new Set(Object.values(later)), new Set(['known']));
  });

  test('a device the server slips in, vouched for by nobody believed, still waits to be accepted', async () => {
    const laptop = await makeDevice('wes');
    const sam = new MemoryIdentityStore();
    await verdicts(sam, 'wes', [laptop.published]);

    const intruder = await makeDevice('wes');
    const accomplice = await makeDevice('wes');
    const cases: DeviceKey[] = [
      // Vouched for by another device nobody has accepted.
      { ...intruder.published, endorsedBy: await endorse('wes', accomplice.device.identity, intruder.published) },
      // Says the laptop vouched, with a signature the laptop did not make.
      {
        ...intruder.published,
        endorsedBy: { deviceId: laptop.published.deviceId, signature: (await endorse('wes', accomplice.device.identity, intruder.published)).signature },
      },
    ];
    for (const forged of cases) {
      const seen = await verdicts(sam, 'wes', [laptop.published, accomplice.published, forged]);
      assert.equal(seen[intruder.published.deviceId], 'new-device');
    }
  });

  test('vouching made for one device cannot be moved onto another, or onto another person', async () => {
    const laptop = await makeDevice('wes');
    const real = await makeDevice('wes');
    const intruder = await makeDevice('wes');
    const sam = new MemoryIdentityStore();
    await verdicts(sam, 'wes', [laptop.published]);

    const genuine = await endorse('wes', laptop.device.identity, real.published);
    const moved = { ...intruder.published, endorsedBy: genuine };
    assert.equal((await verdicts(sam, 'wes', [laptop.published, moved]))[intruder.published.deviceId], 'new-device');

    const sams = await makeDevice('sam');
    const crossed = { ...sams.published, endorsedBy: await endorse('wes', laptop.device.identity, sams.published) };
    const wes = new MemoryIdentityStore();
    const first = await makeDevice('sam');
    await verdicts(wes, 'sam', [first.published]);
    assert.equal((await verdicts(wes, 'sam', [first.published, crossed]))[sams.published.deviceId], 'new-device');
  });

  test('a key that changed is never rescued by vouching', async () => {
    const laptop = await makeDevice('wes');
    const phone = await makeDevice('wes');
    const sam = new MemoryIdentityStore();
    await verdicts(sam, 'wes', [laptop.published, phone.published]);

    const swapped: DmDevice = { userId: 'wes', identity: await createDeviceIdentity(phone.published.deviceId), dm: await createDmKeypair() };
    const swappedPublished = await describeDevice(swapped);
    const vouched = { ...swappedPublished, endorsedBy: await endorse('wes', laptop.device.identity, swappedPublished) };
    assert.equal((await verdicts(sam, 'wes', [laptop.published, vouched]))[phone.published.deviceId], 'changed');
  });
});

describe('history from before the phrase', () => {
  test('the laptop passes old keys on to the phrase, and the words then open them', async () => {
    const laptop = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const old = await sealMessage({
      dmId: DM,
      sender: sam.device,
      body: { v: 1, text: 'from before there was a phrase' },
      recipients: [sam.published, laptop.published],
    });

    const words = newPhrase();
    const phrase = await describeDevice(await recoveryDevice('wes', words));
    const copy = await rewrapKey({ dmId: DM, self: laptop.device, authorId: 'sam', senderDevice: sam.published, target: phrase, ...old });
    assert.ok(copy);
    const keys = [...old.keys, { userId: 'wes', deviceId: phrase.deviceId, ...copy, wrappedBy: laptop.published.deviceId }];

    const rebuilt = await recoveryDevice('wes', words);
    const base = { dmId: DM, self: rebuilt, authorId: 'sam', senderDevice: sam.published, iv: old.iv, ciphertext: old.ciphertext, keys };
    assert.deepEqual(await openMessage({ ...base, ownDevices: [laptop.published] }), {
      ok: true,
      body: { v: 1, text: 'from before there was a phrase' },
      legacy: false,
    });

    // The laptop has to be one this person believes. Unlisted, its copy counts for nothing.
    assert.equal((await openMessage({ ...base, ownDevices: [] })).ok, false);
    // And a copy cannot be relabelled as having come from the sender.
    const relabelled = keys.map((key) => ({ ...key, wrappedBy: null }));
    assert.equal((await openMessage({ ...base, keys: relabelled, ownDevices: [laptop.published] })).ok, false);
  });

  test('a copy made for one message does not open another', async () => {
    const laptop = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const recipients = [sam.published, laptop.published];
    const one = await sealMessage({ dmId: DM, sender: sam.device, body: { v: 1, text: 'one' }, recipients });
    const two = await sealMessage({ dmId: DM, sender: sam.device, body: { v: 1, text: 'two' }, recipients });

    const words = newPhrase();
    const phrase = await describeDevice(await recoveryDevice('wes', words));
    const copy = await rewrapKey({ dmId: DM, self: laptop.device, authorId: 'sam', senderDevice: sam.published, target: phrase, ...one });
    assert.ok(copy);
    const moved = [{ userId: 'wes', deviceId: phrase.deviceId, ...copy, wrappedBy: laptop.published.deviceId }];
    const opened = await openMessage({
      dmId: DM,
      self: await recoveryDevice('wes', words),
      authorId: 'sam',
      senderDevice: sam.published,
      iv: two.iv,
      ciphertext: two.ciphertext,
      keys: moved,
      ownDevices: [laptop.published],
    });
    assert.equal(opened.ok, false);
  });

  test('nobody can pass a key on to somebody else', async () => {
    const laptop = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');
    const sealed = await sealMessage({ dmId: DM, sender: sam.device, body: { v: 1, text: 'x' }, recipients: [laptop.published] });
    const copy = await rewrapKey({ dmId: DM, self: laptop.device, authorId: 'sam', senderDevice: sam.published, target: eve.published, ...sealed });
    assert.equal(copy, null);
  });
});

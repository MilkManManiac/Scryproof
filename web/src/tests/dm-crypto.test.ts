/**
 * Direct message encryption, including a server that lies.
 *
 * Same rule as the voice suite, non-negotiable 8, and the same shape: real
 * P-256 keys and real AES-GCM, with the server played by the test, which may
 * do anything a real one could: read what it stores, swap keys in the table it
 * hands out, move sealed pieces between messages and people.
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
  isTrusted,
  openFile,
  openMessage,
  sealFile,
  sealMessage,
  verifyDevice,
} from '../lib/dm-crypto';
import { MemoryIdentityStore, createDeviceIdentity, fromBase64, toBase64 } from '../lib/voice-crypto';

const DM = 'dm-01H0000000000000000000';

async function makeDevice(userId: string): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
}

const flip = (value: string): string => {
  const bytes = fromBase64(value);
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
  return toBase64(bytes);
};

describe('sealing and opening', () => {
  test('the other person opens it, and so does the sender', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const sealed = await sealMessage({
      dmId: DM,
      sender: wes.device,
      body: { v: 1, text: 'see you thursday' },
      recipients: [wes.published, sam.published],
    });

    for (const reader of [sam, wes]) {
      const opened = await openMessage({ dmId: DM, self: reader.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
      assert.deepEqual(opened, { ok: true, body: { v: 1, text: 'see you thursday' } });
    }
  });

  test('a reply and a reaction carry what they point at inside the seal', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const bodies = [
      { v: 1, text: 'thursday works', replyTo: 'message-7' },
      { v: 1, kind: 'reaction', target: 'message-7', emoji: '👍' },
    ] as const;

    for (const body of bodies) {
      const sealed = await sealMessage({ dmId: DM, sender: wes.device, body, recipients: [sam.published] });
      assert.equal(JSON.stringify(sealed).includes('message-7'), false);
      const opened = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
      assert.deepEqual(opened, { ok: true, body });
    }
  });

  test('a body of a shape nobody defined does not open as anything', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    for (const body of [{ v: 1, kind: 'poll', text: 'x' }, { v: 1, kind: 'reaction', target: 'm' }, { v: 2, text: 'x' }]) {
      const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: body as never, recipients: [sam.published] });
      const opened = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
      assert.deepEqual(opened, { ok: false, reason: 'failed' });
    }
  });

  test('a file opens with the key its message carries, and with nothing else', async () => {
    const bytes = new TextEncoder().encode('the-file-the-server-must-not-read');
    const { sealed, key, iv } = await sealFile(DM, bytes);

    assert.equal(Buffer.from(sealed).toString('latin1').includes('the-file'), false);
    assert.deepEqual(await openFile(DM, { key, iv }, sealed), bytes);

    // Moved into another conversation, changed on the way, or opened with another file's key.
    assert.equal(await openFile('dm-somewhere-else', { key, iv }, sealed), null);
    const changed = sealed.slice();
    changed[0] = (changed[0] ?? 0) ^ 1;
    assert.equal(await openFile(DM, { key, iv }, changed), null);
    const other = await sealFile(DM, bytes);
    assert.equal(await openFile(DM, { key: other.key, iv }, sealed), null);
  });

  test('what the server stores does not contain the text', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const secret = 'the-word-the-server-must-not-see';
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: secret }, recipients: [sam.published] });

    const stored = JSON.stringify(sealed);
    assert.equal(stored.includes(secret), false);
    const raw = Buffer.from(sealed.ciphertext, 'base64').toString('latin1');
    assert.equal(raw.includes(secret), false);
  });

  test('a device that was given no copy reports that, rather than failing', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const samsNewPhone = await makeDevice('sam');
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'hi' }, recipients: [sam.published] });

    const opened = await openMessage({ dmId: DM, self: samsNewPhone.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
    assert.deepEqual(opened, { ok: false, reason: 'no-key' });
  });

  test('every message gets its own key', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const one = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'same' }, recipients: [sam.published] });
    const two = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'same' }, recipients: [sam.published] });
    assert.notEqual(one.ciphertext, two.ciphertext);
    assert.notEqual(one.keys[0]?.key, two.keys[0]?.key);
  });
});

describe('a server that lies', () => {
  test('a third person cannot open a copy made for someone else, even relabelled as theirs', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'private' }, recipients: [sam.published] });

    const relabelled = sealed.keys.map((key) => ({ ...key, userId: 'eve', deviceId: eve.device.identity.deviceId }));
    const opened = await openMessage({ dmId: DM, self: eve.device, authorId: 'wes', senderDevice: wes.published, ...sealed, keys: relabelled });
    assert.deepEqual(opened, { ok: false, reason: 'failed' });
  });

  test('a changed body does not open', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'pay sam 10' }, recipients: [sam.published] });
    const opened = await openMessage({
      dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed, ciphertext: flip(sealed.ciphertext),
    });
    assert.deepEqual(opened, { ok: false, reason: 'failed' });
  });

  test('a message cannot be attributed to somebody else', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');
    const sealed = await sealMessage({ dmId: DM, sender: eve.device, body: { v: 1, text: 'it is wes, honest' }, recipients: [sam.published] });

    // The server says Wes wrote it, and offers Wes's real device as the sender.
    const asWes = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
    assert.deepEqual(asWes, { ok: false, reason: 'failed' });
    // Or says Wes wrote it and offers Eve's device.
    const mixed = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: eve.published, ...sealed });
    assert.deepEqual(mixed, { ok: false, reason: 'failed' });
  });

  test('a message cannot be replayed into another conversation', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const sealed = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'yes' }, recipients: [sam.published] });
    const opened = await openMessage({ dmId: 'dm-another', self: sam.device, authorId: 'wes', senderDevice: wes.published, ...sealed });
    assert.deepEqual(opened, { ok: false, reason: 'failed' });
  });

  test('a key cannot be moved from one message onto another', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const one = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'one' }, recipients: [sam.published] });
    const two = await sealMessage({ dmId: DM, sender: wes.device, body: { v: 1, text: 'two' }, recipients: [sam.published] });
    const opened = await openMessage({ dmId: DM, self: sam.device, authorId: 'wes', senderDevice: wes.published, ...two, keys: one.keys });
    assert.deepEqual(opened, { ok: false, reason: 'failed' });
  });

  test('a DM key swapped in the table fails its signature', async () => {
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');
    assert.equal(await verifyDevice(sam.published), true);
    assert.equal(await verifyDevice({ ...sam.published, dmKey: eve.published.dmKey }), false);
    assert.equal(await verifyDevice({ ...sam.published, userId: 'eve' }), false);
  });

  test('a whole device swapped in the table is caught by the pin, and gets no copy', async () => {
    const store = new MemoryIdentityStore();
    const sam = await makeDevice('sam');
    const first = await assessDevices(store, 'sam', [sam.published]);
    assert.deepEqual(first.map((entry) => entry.verdict), ['first-seen']);

    // Same device id, keys the server made. Validly signed, by the wrong identity.
    const forged: DmDevice = { userId: 'sam', identity: await createDeviceIdentity(sam.device.identity.deviceId), dm: await createDmKeypair() };
    const swapped = await assessDevices(store, 'sam', [await describeDevice(forged)]);
    assert.deepEqual(swapped.map((entry) => entry.verdict), ['changed']);
    assert.equal(swapped.some((entry) => isTrusted(entry.verdict)), false);
  });

  test('a device added to somebody already known waits to be accepted', async () => {
    const store = new MemoryIdentityStore();
    const sam = await makeDevice('sam');
    await assessDevices(store, 'sam', [sam.published]);

    const planted = await makeDevice('sam');
    const next = await assessDevices(store, 'sam', [sam.published, planted.published]);
    assert.deepEqual(next.map((entry) => entry.verdict), ['known', 'new-device']);
  });

  test('meeting somebody for the first time pins every device they have', async () => {
    const store = new MemoryIdentityStore();
    const laptop = await makeDevice('sam');
    const phone = await makeDevice('sam');
    const met = await assessDevices(store, 'sam', [laptop.published, phone.published]);
    assert.deepEqual(met.map((entry) => entry.verdict), ['first-seen', 'first-seen']);
    const again = await assessDevices(store, 'sam', [laptop.published, phone.published]);
    assert.deepEqual(again.map((entry) => entry.verdict), ['known', 'known']);
  });

  test('a device filed under the wrong person is invalid', async () => {
    const store = new MemoryIdentityStore();
    const eve = await makeDevice('eve');
    const result = await assessDevices(store, 'sam', [eve.published]);
    assert.deepEqual(result.map((entry) => entry.verdict), ['invalid']);
  });
});

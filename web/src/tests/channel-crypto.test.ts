/**
 * Encrypted channels, including a server that lies.
 *
 * Same shape as the DM and voice suites: real P-256 keys and real AES-GCM,
 * with the server played by the test. It may read what it stores, swap keys
 * in the table it hands out, move sealed pieces between messages, channels,
 * epochs and people, and invent keys of its own.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ChannelEpoch, DeviceKey } from '@scryproof/shared';

import {
  type MessageFrame,
  createEpochKey,
  describeEpoch,
  handOver,
  keyMatchesEpoch,
  openChannelMessage,
  sealChannelMessage,
  takeOver,
} from '../lib/channel-crypto';
import { type DmDevice, createDmKeypair, describeDevice } from '../lib/dm-crypto';
import { createDeviceIdentity, fromBase64, toBase64 } from '../lib/voice-crypto';

const CHANNEL = 'channel-01H00000000000000000';
const OTHER_CHANNEL = 'channel-01H99999999999999999';

async function makeDevice(userId: string): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
}

const flip = (value: string): string => {
  const bytes = fromBase64(value);
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
  return toBase64(bytes);
};

async function newEpoch(maker: DmDevice, epoch = 1, channelId = CHANNEL): Promise<{ key: Uint8Array; record: ChannelEpoch }> {
  const key = createEpochKey();
  return { key, record: await describeEpoch({ channelId, epoch, key, maker }) };
}

function frameOf(sealed: Awaited<ReturnType<typeof sealChannelMessage>>, authorId: string, replyToId: string | null = null): MessageFrame {
  return {
    channelId: CHANNEL,
    epoch: sealed.keyEpoch,
    authorId,
    senderDeviceId: sealed.senderDeviceId,
    replyToId,
    mentionIds: sealed.mentionIds,
    mentionsEveryone: sealed.mentionsEveryone,
  };
}

describe('the epoch key', () => {
  test('handed over, it opens for the device it was locked for and matches its commitment', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const { key, record } = await newEpoch(wes.device);

    const copy = await handOver({ channelId: CHANNEL, epoch: 1, key, from: wes.device, to: sam.published });
    const opened = await takeOver({ channelId: CHANNEL, epoch: 1, self: sam.device, from: wes.published, copy });
    assert.deepEqual(opened, key);
    assert.equal(await keyMatchesEpoch({ channelId: CHANNEL, record, maker: wes.published, key: opened! }), true);
  });

  test('a copy moved to another device, epoch or channel does not open', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const eve = await makeDevice('eve');
    const key = createEpochKey();
    const copy = await handOver({ channelId: CHANNEL, epoch: 1, key, from: wes.device, to: sam.published });

    assert.equal(await takeOver({ channelId: CHANNEL, epoch: 1, self: eve.device, from: wes.published, copy }), null);
    assert.equal(await takeOver({ channelId: CHANNEL, epoch: 2, self: sam.device, from: wes.published, copy }), null);
    assert.equal(await takeOver({ channelId: OTHER_CHANNEL, epoch: 1, self: sam.device, from: wes.published, copy }), null);
    // The server says a different device handed it over.
    assert.equal(await takeOver({ channelId: CHANNEL, epoch: 1, self: sam.device, from: eve.published, copy }), null);
  });

  test('a key the server invents does not match the maker\'s commitment', async () => {
    const wes = await makeDevice('wes');
    const { record } = await newEpoch(wes.device);
    assert.equal(await keyMatchesEpoch({ channelId: CHANNEL, record, maker: wes.published, key: createEpochKey() }), false);
  });

  test('a commitment the server invents does not carry the maker\'s signature', async () => {
    const wes = await makeDevice('wes');
    const { key, record } = await newEpoch(wes.device);
    const other = createEpochKey();
    const swapped = (await describeEpoch({ channelId: CHANNEL, epoch: 1, key: other, maker: (await makeDevice('wes')).device })).commitment;
    assert.equal(await keyMatchesEpoch({ channelId: CHANNEL, record: { ...record, commitment: swapped }, maker: wes.published, key: other }), false);
    assert.equal(await keyMatchesEpoch({ channelId: CHANNEL, record: { ...record, signature: flip(record.signature) }, maker: wes.published, key }), false);
  });

  test('an epoch record moved to another channel or epoch, or claimed for another maker, fails', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const { key, record } = await newEpoch(wes.device);
    assert.equal(await keyMatchesEpoch({ channelId: OTHER_CHANNEL, record, maker: wes.published, key }), false);
    assert.equal(await keyMatchesEpoch({ channelId: CHANNEL, record: { ...record, epoch: 2 }, maker: wes.published, key }), false);
    assert.equal(
      await keyMatchesEpoch({ channelId: CHANNEL, record: { ...record, creatorId: 'sam', creatorDeviceId: sam.published.deviceId }, maker: sam.published, key }),
      false,
    );
    // The record names Wes's device, the server hands over Sam's as if it were it.
    assert.equal(await keyMatchesEpoch({ channelId: CHANNEL, record, maker: sam.published, key }), false);
  });
});

describe('messages', () => {
  test('any holder opens it, and it says who wrote it', async () => {
    const wes = await makeDevice('wes');
    const { key } = await newEpoch(wes.device);
    const sealed = await sealChannelMessage({
      channelId: CHANNEL,
      epoch: 1,
      key,
      sender: wes.device,
      body: { v: 1, text: 'roll for initiative' },
      replyToId: 'message-3',
      mentionIds: ['sam', 'wes', 'sam'],
      mentionsEveryone: false,
    });
    // The sender is dropped from their own mentions and duplicates go, as the server would.
    assert.deepEqual(sealed.mentionIds, ['sam']);

    const opened = await openChannelMessage({ frame: frameOf(sealed, 'wes', 'message-3'), senderDevice: wes.published, key, ...sealed });
    assert.deepEqual(opened, { ok: true, body: { v: 1, text: 'roll for initiative' } });
  });

  test('the server cannot read it: no plaintext in anything it stores', async () => {
    const wes = await makeDevice('wes');
    const { key, record } = await newEpoch(wes.device);
    const sealed = await sealChannelMessage({
      channelId: CHANNEL, epoch: 1, key, sender: wes.device,
      body: { v: 1, text: 'the dragon is in the well' },
      replyToId: null, mentionIds: [], mentionsEveryone: false,
    });
    const stored = JSON.stringify({ sealed, record });
    assert.equal(stored.includes('dragon'), false);
    for (const field of [sealed.ciphertext, sealed.nonce, sealed.signature, record.commitment]) {
      assert.equal(Buffer.from(fromBase64(field)).toString('latin1').includes('dragon'), false);
    }
  });

  test('a member holding the key cannot write in someone else\'s name', async () => {
    const wes = await makeDevice('wes');
    const sam = await makeDevice('sam');
    const { key } = await newEpoch(wes.device);

    // Sam has the channel key and seals a message, then the server files it under Wes.
    const forged = await sealChannelMessage({
      channelId: CHANNEL, epoch: 1, key, sender: sam.device,
      body: { v: 1, text: 'I quit the campaign' }, replyToId: null, mentionIds: [], mentionsEveryone: false,
    });
    const asWes = { ...frameOf(forged, 'wes'), senderDeviceId: wes.published.deviceId };
    assert.deepEqual(await openChannelMessage({ frame: asWes, senderDevice: wes.published, key, ...forged }), { ok: false, reason: 'forged' });
    // Or claims Wes wrote it with Sam's device: the device is not Wes's.
    assert.deepEqual(
      await openChannelMessage({ frame: { ...frameOf(forged, 'wes') }, senderDevice: sam.published, key, ...forged }),
      { ok: false, reason: 'forged' },
    );

    // Sam takes a real message of Wes's and swaps the body for one sealed with the same key.
    const real = await sealChannelMessage({
      channelId: CHANNEL, epoch: 1, key, sender: wes.device,
      body: { v: 1, text: 'see you thursday' }, replyToId: null, mentionIds: [], mentionsEveryone: false,
    });
    const swapped = { ...real, ciphertext: forged.ciphertext, nonce: forged.nonce };
    assert.deepEqual(await openChannelMessage({ frame: frameOf(real, 'wes'), senderDevice: wes.published, key, ...swapped }), { ok: false, reason: 'forged' });
  });

  test('the server cannot move a message, repoint its reply, or change who it pings', async () => {
    const wes = await makeDevice('wes');
    const { key } = await newEpoch(wes.device);
    const sealed = await sealChannelMessage({
      channelId: CHANNEL, epoch: 1, key, sender: wes.device,
      body: { v: 1, text: 'agreed' }, replyToId: 'message-3', mentionIds: ['sam'], mentionsEveryone: false,
    });
    const frame = frameOf(sealed, 'wes', 'message-3');
    const open = (changed: Partial<MessageFrame>) =>
      openChannelMessage({ frame: { ...frame, ...changed }, senderDevice: wes.published, key, ...sealed });

    for (const changed of [
      { channelId: OTHER_CHANNEL },
      { replyToId: 'message-9' },
      { replyToId: null },
      { mentionIds: [] },
      { mentionIds: ['sam', 'alex'] },
      { mentionsEveryone: true },
      { epoch: 2 },
    ]) {
      const result = await open(changed);
      assert.equal(result.ok, false, JSON.stringify(changed));
    }
    assert.equal((await open({})).ok, true);
  });

  test('a flipped bit anywhere is refused, never shown', async () => {
    const wes = await makeDevice('wes');
    const { key } = await newEpoch(wes.device);
    const sealed = await sealChannelMessage({
      channelId: CHANNEL, epoch: 1, key, sender: wes.device,
      body: { v: 1, text: 'hello' }, replyToId: null, mentionIds: [], mentionsEveryone: false,
    });
    const frame = frameOf(sealed, 'wes');
    for (const field of ['ciphertext', 'nonce', 'signature'] as const) {
      const result = await openChannelMessage({ frame, senderDevice: wes.published, key, ...sealed, [field]: flip(sealed[field]) });
      assert.equal(result.ok, false, field);
    }
  });

  test('the wrong epoch key opens nothing, even with a good signature', async () => {
    const wes = await makeDevice('wes');
    const { key } = await newEpoch(wes.device);
    const sealed = await sealChannelMessage({
      channelId: CHANNEL, epoch: 1, key, sender: wes.device,
      body: { v: 1, text: 'hello' }, replyToId: null, mentionIds: [], mentionsEveryone: false,
    });
    const result = await openChannelMessage({ frame: frameOf(sealed, 'wes'), senderDevice: wes.published, key: createEpochKey(), ...sealed });
    assert.deepEqual(result, { ok: false, reason: 'failed' });
  });

  test('garbage from the server is a message that does not open, not a crash', async () => {
    const wes = await makeDevice('wes');
    const frame: MessageFrame = {
      channelId: CHANNEL, epoch: 1, authorId: 'wes', senderDeviceId: wes.published.deviceId,
      replyToId: null, mentionIds: [], mentionsEveryone: false,
    };
    for (const junk of ['', 'not base64!!', 'AAAA']) {
      const result = await openChannelMessage({ frame, senderDevice: wes.published, key: createEpochKey(), nonce: junk, ciphertext: junk, signature: junk });
      assert.equal(result.ok, false);
    }
    assert.equal(
      await takeOver({ channelId: CHANNEL, epoch: 1, self: wes.device, from: wes.published, copy: { iv: 'AAAA', key: '!!' } }),
      null,
    );
  });
});

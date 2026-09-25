/**
 * Hostile-server review, 2026-09-24: encrypted channels, through `ChannelKeys`.
 *
 * `channel-crypto.test.ts` proves the helpers: a moved or forged message does
 * not open. These tests go one level up, to the class that decides whom to
 * give keys to, which key to send under, and what an opened message says. The
 * API, this device and the two stores are replaced; the crypto is real. The
 * "server" below answers every question the way a malicious server would.
 *
 * Needs `--experimental-test-module-mocks` (the package's test script passes it
 * on this branch). All four tests here pass now, and the attacks they play are
 * the ones the fixes were written for.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, mock, test } from 'node:test';

import type { ChannelKeyCopy, ChannelKeyState, ChannelKeyWant, DeviceKey, Message } from '@scryproof/shared';

import { type Remembered, mergeRemembered } from '../lib/channel-memory';
import { createEpochKey, describeEpoch, handOver, sealChannelMessage, takeOver } from '../lib/channel-crypto';
import type { SealedChannelMessage } from '../lib/channel-crypto';
import { type DmDevice, createDmKeypair, describeDevice, endorse } from '../lib/dm-crypto';
import { createDeviceIdentity } from '../lib/voice-crypto';

const CHANNEL = 'channel-01H00000000000000000';

/* ------------------------------- the fakes -------------------------------- */

/** IndexedDB, as far as pins go: one shared table, like the real one. */
const pinTable = new Map<string, string>();
class MemoryPins {
  async get(userId: string, deviceId: string): Promise<string | null> {
    return pinTable.get(`${userId}:${deviceId}`) ?? null;
  }
  async set(userId: string, deviceId: string, fingerprint: string): Promise<void> {
    pinTable.set(`${userId}:${deviceId}`, fingerprint);
  }
  async devices(userId: string): Promise<string[]> {
    return [...pinTable.keys()].filter((key) => key.startsWith(`${userId}:`)).map((key) => key.slice(userId.length + 1));
  }
}

/**
 * And as far as acceptance goes. A separate table on purpose: a pin is written
 * on first sight, an acceptance only when a person on this device says yes.
 */
const acceptedTable = new Map<string, string>();
class MemoryAccepted {
  async get(userId: string, deviceId: string): Promise<string | null> {
    return acceptedTable.get(`${userId}:${deviceId}`) ?? null;
  }
  async set(userId: string, deviceId: string, fingerprint: string): Promise<void> {
    acceptedTable.set(`${userId}:${deviceId}`, fingerprint);
  }
}

/** The channel memory, with the real merge rules and a table that forgets. */
const remembered = new Map<string, Remembered>();
class MemoryChannelMemory {
  async all(): Promise<Record<string, Remembered>> {
    return Object.fromEntries(remembered);
  }
  async remember(channelId: string, entry: Remembered): Promise<void> {
    remembered.set(channelId, mergeRemembered(remembered.get(channelId), entry));
  }
}

/** What the server says. Tests set it; the fake API reads it. */
const server = {
  state: null as ChannelKeyState | null,
  devices: [] as DeviceKey[],
  readers: [] as string[],
  wanted: [] as ChannelKeyWant[],
  received: [] as { epoch: number; userId: string; deviceId: string; iv: string; key: string }[],
};

let self: DmDevice;

class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

mock.module('../lib/voice-identity', {
  namedExports: {
    IndexedDbIdentityStore: MemoryPins,
    IndexedDbAcceptedStore: MemoryAccepted,
    IndexedDbChannelMemory: MemoryChannelMemory,
  },
});
mock.module('../lib/this-device', {
  namedExports: {
    deviceFor: async (userId: string, pins: MemoryPins) => {
      await pins.set(userId, self.identity.deviceId, self.identity.fingerprint);
      return self;
    },
    recoveryOpenerFor: () => null,
  },
});
mock.module('../lib/api', {
  namedExports: {
    ApiError,
    api: {
      channelKeys: {
        state: async () => structuredClone(server.state),
        devices: async () => ({ devices: server.devices, readers: server.readers }),
        wanted: async () => ({ wanted: server.wanted, devices: server.devices }),
        handOver: async (_channelId: string, body: { keys: typeof server.received }) => {
          server.received.push(...body.keys);
          return { added: body.keys.length };
        },
        request: async () => undefined,
      },
    },
  },
});

const { ChannelKeys, KeyWait, channelMemory } = await import('../lib/channel-keys');

/* -------------------------------- the scene -------------------------------- */

async function makeDevice(userId: string, label = `${userId}-device`): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(label), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
}

/** What the composer hands `seal` for one plain message. */
const sealInput = () => ({
  channelId: CHANNEL,
  text: 'the plan for Saturday',
  replyToId: null,
  replyAuthorId: null,
  memberIds: new Set(['alice', 'bob']),
  canMentionEveryone: false,
});

/** A sealed message row, as the server would hand it back. */
function sealedRow(sealed: SealedChannelMessage, authorId: string, id: string): Message {
  return {
    id,
    channelId: CHANNEL,
    authorId,
    kind: 'text',
    content: null,
    ciphertext: sealed.ciphertext,
    nonce: sealed.nonce,
    signature: sealed.signature,
    senderDeviceId: sealed.senderDeviceId,
    keyEpoch: sealed.keyEpoch,
    replyToId: null,
    replyTo: null,
    mentions: [],
    mentionsEveryone: false,
    deleted: false,
    attachments: [],
    reactions: [],
    createdAt: '2026-09-24T13:00:00.000Z',
    editedAt: null,
    pinnedAt: null,
  } as unknown as Message;
}

/** A plaintext row, as a server that wants words in somebody's mouth sends one. */
function plainRow(id: string, createdAt: string): Message {
  return {
    id,
    channelId: CHANNEL,
    authorId: 'bob',
    kind: 'text',
    content: 'try the west door at midnight',
    ciphertext: null,
    keyEpoch: null,
    nonce: null,
    senderDeviceId: null,
    signature: null,
    replyToId: null,
    replyTo: null,
    mentions: [],
    mentionsEveryone: false,
    deleted: false,
    attachments: [],
    reactions: [],
    createdAt,
    editedAt: null,
    pinnedAt: null,
  } as unknown as Message;
}

const [alice, bob, mallory] = await Promise.all([makeDevice('alice'), makeDevice('bob'), makeDevice('mallory')]);
const epochKeys = [createEpochKey(), createEpochKey()];
const keyFor = (epoch: number) => epochKeys[epoch - 1]!;

/** Alice made both epochs and holds a copy of each, as the maker does. */
async function aliceHolds(epoch: number): Promise<ChannelKeyCopy> {
  const copy = await handOver({ channelId: CHANNEL, epoch, key: keyFor(epoch), from: alice.device, to: alice.published });
  return { epoch, ...copy, wrapperId: 'alice', wrapperDeviceId: alice.device.identity.deviceId };
}

const sameBytes = (a: Uint8Array | null, b: Uint8Array): boolean =>
  a !== null && a.length === b.length && a.every((byte, i) => byte === b[i]);

beforeEach(async () => {
  self = alice.device;
  pinTable.clear();
  acceptedTable.clear();
  remembered.clear();
  channelMemory().forget();
  // Alice has met Bob before (a DM, a call): his device is pinned, and — since
  // meeting somebody in a DM and then letting them into a channel is what the
  // lock panel does — accepted. She has never met Mallory, who is neither.
  pinTable.set(`bob:${bob.device.identity.deviceId}`, bob.device.identity.fingerprint);
  acceptedTable.set(`bob:${bob.device.identity.deviceId}`, bob.device.identity.fingerprint);
  server.state = {
    current: 1,
    epochs: [await describeEpoch({ channelId: CHANNEL, epoch: 1, key: keyFor(1), maker: alice.device })],
    keys: [await aliceHolds(1)],
    holders: [{ userId: 'alice', deviceId: alice.device.identity.deviceId }],
  };
  server.devices = [alice.published, bob.published, mallory.published];
  server.readers = ['alice', 'bob', 'mallory'];
  server.wanted = [];
  server.received = [];
});

/* -------------------------------- the tests -------------------------------- */

describe('hostile server: channel keys', () => {
  test('control: a device alice already believes, waiting for a key, is handed one that opens', async () => {
    server.wanted = [{ epoch: 1, userId: 'bob', deviceId: bob.device.identity.deviceId }];
    await new ChannelKeys('alice').handOut(CHANNEL);

    const copy = server.received.find((entry) => entry.userId === 'bob');
    assert.ok(copy, 'bob got no copy');
    const opened = await takeOver({ channelId: CHANNEL, epoch: 1, self: bob.device, from: alice.published, copy });
    assert.ok(sameBytes(opened, keyFor(1)));
  });

  test('a device of someone alice has never met gets no key until a person here accepts it', async () => {
    // handOut's own comment: "Devices nobody here has accepted are skipped, and stay waiting until someone does."
    // The server invents mallory, lists her as a reader, and asks for every epoch on her behalf.
    server.wanted = [{ epoch: 1, userId: 'mallory', deviceId: mallory.device.identity.deviceId }];
    const keys = new ChannelKeys('alice');
    await keys.handOut(CHANNEL);
    // Asked twice: the first look pins a never-met device as 'first-seen', and a pin reads as 'known' ever after.
    keys.keysChanged(CHANNEL, false);
    await keys.handOut(CHANNEL);

    const copy = server.received.find((entry) => entry.userId === 'mallory');
    const opened = copy ? await takeOver({ channelId: CHANNEL, epoch: 1, self: mallory.device, from: alice.published, copy }) : null;
    assert.equal(copy, undefined, `mallory was handed the channel key without anyone accepting her (it opens: ${sameBytes(opened, keyFor(1))})`);
  });

  test('a verified message moved to another author is not shown as verified', async () => {
    const sealed = await sealChannelMessage({
      channelId: CHANNEL,
      epoch: 1,
      key: keyFor(1),
      sender: bob.device,
      body: { v: 1, text: 'I owe Carol 200 dollars' },
      replyToId: null,
      mentionIds: [],
      mentionsEveryone: false,
    });
    const message = {
      id: 'message-1',
      channelId: CHANNEL,
      authorId: 'bob',
      kind: 'text',
      content: null,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      signature: sealed.signature,
      senderDeviceId: sealed.senderDeviceId,
      keyEpoch: sealed.keyEpoch,
      replyToId: null,
      replyTo: null,
      mentions: [],
      mentionsEveryone: false,
      deleted: false,
      attachments: [],
    } as unknown as Message;

    const keys = new ChannelKeys('alice');
    const [genuine] = await keys.open([message]);
    assert.equal(genuine?.sealed, 'ok', 'precondition: bob’s real message opens as verified');

    // The server re-sends it (a message_update) with the same id and signature and a different author.
    const [moved] = await keys.open([{ ...message, authorId: 'carol' } as Message]);
    assert.notEqual(
      moved?.sealed,
      'ok',
      `bob's signed words are shown as carol's, marked verified: "${moved?.content}" by ${moved?.authorId}`,
    );
  });

  test('a server cannot move alice back to an older key once she has sent under a newer one', async () => {
    // Epoch 2 exists because mallory was removed after epoch 1; she still holds epoch 1's key.
    server.state = {
      current: 2,
      epochs: [
        await describeEpoch({ channelId: CHANNEL, epoch: 1, key: keyFor(1), maker: alice.device }),
        await describeEpoch({ channelId: CHANNEL, epoch: 2, key: keyFor(2), maker: alice.device }),
      ],
      keys: [await aliceHolds(1), await aliceHolds(2)],
      holders: [{ userId: 'alice', deviceId: alice.device.identity.deviceId }],
    };
    const input = {
      channelId: CHANNEL,
      text: 'the plan for Saturday',
      replyToId: null,
      replyAuthorId: null,
      memberIds: new Set(['alice', 'bob']),
      canMentionEveryone: false,
    };
    const keys = new ChannelKeys('alice');
    assert.equal((await keys.seal(input)).keyEpoch, 2, 'precondition: alice sends under epoch 2');

    // The server says the current epoch is 1 again, and that the keys changed.
    server.state = { ...server.state, current: 1 };
    keys.keysChanged(CHANNEL, false);
    // Refusing to send (KeyWait) is a fine answer; sending under epoch 1 is not.
    const second = await keys.seal(input).then((sealed) => sealed.keyEpoch, (problem: unknown) => problem);
    assert.ok(second instanceof KeyWait || (typeof second === 'number' && second >= 2), `alice sealed a new message under epoch ${String(second)}, a key a removed member holds`);
  });

  test('a key made by a device nobody here accepted is never sent under', async () => {
    // The server invents Mallory, says she made epoch 2, and locks her copy for
    // alice well enough that alice's device can open it. Everything else about
    // the channel works; the only thing wrong is who the key belongs to.
    const copy = await handOver({ channelId: CHANNEL, epoch: 2, key: keyFor(2), from: mallory.device, to: alice.published });
    server.state = {
      current: 2,
      epochs: [await describeEpoch({ channelId: CHANNEL, epoch: 2, key: keyFor(2), maker: mallory.device })],
      keys: [{ epoch: 2, ...copy, wrapperId: 'mallory', wrapperDeviceId: mallory.device.identity.deviceId }],
      holders: [{ userId: 'mallory', deviceId: mallory.device.identity.deviceId }],
    };

    const problem = await new ChannelKeys('alice')
      .seal(sealInput())
      .then(() => null, (thrown: unknown) => thrown);
    assert.ok(
      problem instanceof KeyWait && problem.reason === 'untrusted-maker',
      `alice sealed a message under a key the server made and never said who (${String(problem)})`,
    );
  });

  test('a device alice has met but never let into this channel is let in by one click', async () => {
    // Dave's device is pinned: they have met, in a DM. Meeting somebody pins
    // their device on first sight, and that is not a person saying yes.
    const dave = await makeDevice('dave');
    pinTable.set(`dave:${dave.published.deviceId}`, dave.device.identity.fingerprint);
    server.devices = [alice.published, dave.published];
    server.readers = ['alice', 'dave'];
    server.wanted = [{ epoch: 1, userId: 'dave', deviceId: dave.published.deviceId }];

    const keys = new ChannelKeys('alice');
    await keys.handOut(CHANNEL);
    assert.equal(
      server.received.find((entry) => entry.deviceId === dave.published.deviceId),
      undefined,
      'a device that was only pinned was handed the channel key',
    );

    const [waiting] = (await keys.holders(CHANNEL)).waiting.filter((entry) => entry.device.userId === 'dave');
    assert.ok(waiting, 'dave was not offered for acceptance in the lock panel');
    await keys.accept(CHANNEL, waiting);

    const copy = server.received.find((entry) => entry.deviceId === dave.published.deviceId);
    assert.ok(copy, 'dave got no key after being let in');
    const opened = await takeOver({ channelId: CHANNEL, epoch: 1, self: dave.device, from: alice.published, copy });
    assert.ok(sameBytes(opened, keyFor(1)));
  });

  test('a vouch counts from a device that was accepted, and not from one that was only pinned', async () => {
    const [charlie1, charlie2, dana1, dana2] = await Promise.all([
      makeDevice('charlie', 'charlie-laptop'),
      makeDevice('charlie', 'charlie-phone'),
      makeDevice('dana', 'dana-laptop'),
      makeDevice('dana', 'dana-phone'),
    ]);
    const charliePhone = { ...charlie2.published, endorsedBy: await endorse('charlie', charlie1.device.identity, charlie2.published) };
    const danaPhone = { ...dana2.published, endorsedBy: await endorse('dana', dana1.device.identity, dana2.published) };
    // Charlie's laptop is a device a person here let in. Dana's is only pinned.
    pinTable.set(`charlie:${charlie1.published.deviceId}`, charlie1.device.identity.fingerprint);
    acceptedTable.set(`charlie:${charlie1.published.deviceId}`, charlie1.device.identity.fingerprint);
    pinTable.set(`dana:${dana1.published.deviceId}`, dana1.device.identity.fingerprint);

    server.devices = [alice.published, charlie1.published, charliePhone, dana1.published, danaPhone];
    server.readers = ['alice', 'charlie', 'dana'];
    server.wanted = [
      { epoch: 1, userId: 'charlie', deviceId: charliePhone.deviceId },
      { epoch: 1, userId: 'dana', deviceId: danaPhone.deviceId },
    ];

    await new ChannelKeys('alice').handOut(CHANNEL);
    assert.ok(
      server.received.find((entry) => entry.deviceId === charliePhone.deviceId),
      'a device vouched for by an accepted device got no key',
    );
    assert.equal(
      server.received.find((entry) => entry.deviceId === danaPhone.deviceId),
      undefined,
      'a vouch from a device nobody here accepted was treated as acceptance',
    );
  });

  test('a message from a device alice only pinned, never let in, shows as unverified', async () => {
    const erin = await makeDevice('erin');
    pinTable.set(`erin:${erin.published.deviceId}`, erin.device.identity.fingerprint);
    server.devices = [alice.published, erin.published];
    server.readers = ['alice', 'erin'];

    const sealed = await sealChannelMessage({
      channelId: CHANNEL,
      epoch: 1,
      key: keyFor(1),
      sender: erin.device,
      body: { v: 1, text: 'meet me behind the shed' },
      replyToId: null,
      mentionIds: [],
      mentionsEveryone: false,
    });
    const message = sealedRow(sealed, 'erin', 'message-erin');

    const keys = new ChannelKeys('alice');
    const [opened] = await keys.open([message]);
    assert.equal(opened?.content, 'meet me behind the shed', 'a correctly signed message should still open');
    assert.equal(opened?.sealed, 'unverified', 'a device nobody here let in was shown as verified');

    // One click in the lock panel, and the same message reads as verified.
    const [waiting] = (await keys.holders(CHANNEL)).waiting.filter((entry) => entry.device.userId === 'erin');
    assert.ok(waiting, 'erin was not offered for acceptance');
    await keys.accept(CHANNEL, waiting);
    const [again] = await keys.open([message]);
    assert.equal(again?.sealed, 'ok');
  });

  test('plaintext the server made up in an encrypted channel is shown as forged, not as text', async () => {
    const SINCE = '2026-09-24T12:00:00.000Z';
    await channelMemory().remember({ id: CHANNEL, encryptedAt: SINCE });
    const keys = new ChannelKeys('alice');

    const [after] = await keys.open([plainRow('message-after', '2026-09-24T12:00:01.000Z')]);
    assert.equal(after?.content, null, `the server put words in bob's mouth: "${String(after?.content)}"`);
    assert.equal(after?.sealed, 'forged');

    // History from before the switch is the channel's own readable past.
    const [before] = await keys.open([plainRow('message-before', '2026-09-24T11:59:59.000Z')]);
    assert.equal(before?.content, 'try the west door at midnight');
    assert.equal(before?.sealed, undefined);

    // A channel that was made encrypted has no readable past at all: `since`
    // is null, and every plaintext message in it is something the server made.
    await channelMemory().remember({ id: CHANNEL, encryptedAt: null });
    const [older] = await keys.open([plainRow('message-older', '2020-01-01T00:00:00.000Z')]);
    assert.equal(older?.content, null);
    assert.equal(older?.sealed, 'forged');
  });

  test('the epoch alice sent under is remembered past the object that sent it', async () => {
    server.state = {
      current: 2,
      epochs: [
        await describeEpoch({ channelId: CHANNEL, epoch: 1, key: keyFor(1), maker: alice.device }),
        await describeEpoch({ channelId: CHANNEL, epoch: 2, key: keyFor(2), maker: alice.device }),
      ],
      keys: [await aliceHolds(1), await aliceHolds(2)],
      holders: [{ userId: 'alice', deviceId: alice.device.identity.deviceId }],
    };
    const first = new ChannelKeys('alice');
    assert.equal((await first.seal(sealInput())).keyEpoch, 2, 'precondition: alice sends under epoch 2');

    // A page reload: a fresh object that has never sent anything, and the
    // server back on the older key.
    server.state = { ...server.state, current: 1 };
    const second = new ChannelKeys('alice');
    const answer = await second.seal(sealInput()).then((sealed) => sealed.keyEpoch, (problem: unknown) => problem);
    assert.ok(
      answer instanceof KeyWait,
      `a new tab sealed under epoch ${String(answer)} after the server moved the channel back`,
    );
  });
});

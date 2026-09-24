/**
 * Hostile-server review, 2026-09-24: encrypted channels, through `ChannelKeys`.
 *
 * `channel-crypto.test.ts` proves the helpers: a moved or forged message does
 * not open. These tests go one level up, to the class that decides whom to
 * give keys to, which key to send under, and what an opened message says. The
 * API, this device and the pin store are replaced; the crypto is real. The
 * "server" below answers every question the way a malicious server would.
 *
 * Needs `--experimental-test-module-mocks` (the package's test script passes it
 * on this branch). The control passes today; the other three are expected to
 * FAIL until the fixes land.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, mock, test } from 'node:test';

import type { ChannelKeyCopy, ChannelKeyState, ChannelKeyWant, DeviceKey, Message } from '@scryproof/shared';

import { createEpochKey, describeEpoch, handOver, sealChannelMessage, takeOver } from '../lib/channel-crypto';
import { type DmDevice, createDmKeypair, describeDevice } from '../lib/dm-crypto';
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

mock.module('../lib/voice-identity', { namedExports: { IndexedDbIdentityStore: MemoryPins } });
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

const { ChannelKeys, KeyWait } = await import('../lib/channel-keys');

/* -------------------------------- the scene -------------------------------- */

async function makeDevice(userId: string): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(`${userId}-device`), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
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
  // Alice has met Bob before (a DM, a call): his device is pinned. She has never met Mallory.
  pinTable.set(`bob:${bob.device.identity.deviceId}`, bob.device.identity.fingerprint);
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
});

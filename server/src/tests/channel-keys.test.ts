/**
 * Encrypted channels, as the server sees them: which keys it will store, who
 * it lets hand them on to whom, when it retires one, and which messages it
 * refuses. The server never has a key, so the locked copies and the sealed
 * bodies here are random bytes. The signatures are real, because the server
 * checks those.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, webcrypto } from 'node:crypto';

import { concatLabelled, epochSignedBytes, messageSignedBytes } from '@scryproof/shared';
import type { ChannelKeyState, ServerEvent } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-channel-keys-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { members, messages } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const hub = await import('../gateway/hub.js');
const { eq } = await import('drizzle-orm');

type App = Awaited<ReturnType<typeof buildApp>>;

const b64 = (bytes: ArrayBuffer | Uint8Array): string => Buffer.from(bytes as ArrayBuffer).toString('base64');
const subtle = webcrypto.subtle;
type CryptoKey = webcrypto.CryptoKey;

interface Person {
  id: string;
  cookie: string;
  deviceId: string;
  signing: CryptoKey;
  inbox: ServerEvent[];
}

async function publishDevice(app: App, person: Omit<Person, 'signing'>): Promise<CryptoKey> {
  const identity = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const dm = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const identityKey = new Uint8Array(await subtle.exportKey('spki', identity.publicKey));
  const dmKey = new Uint8Array(await subtle.exportKey('spki', dm.publicKey));
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    concatLabelled('scryproof/dm/device/v1', person.id, person.deviceId, identityKey, dmKey),
  );
  const reply = await app.inject({
    method: 'PUT',
    url: '/api/devices',
    headers: { cookie: person.cookie },
    payload: { deviceId: person.deviceId, identityKey: b64(identityKey), dmKey: b64(dmKey), signature: b64(signature) },
  });
  assert.equal(reply.statusCode, 200, reply.body);
  return identity.privateKey;
}

function listen(person: Person, serverId: string): void {
  hub.addConnection({
    id: `listener-${person.id}`,
    ws: { readyState: 1, send: (raw: string) => person.inbox.push(JSON.parse(raw) as ServerEvent) },
    userId: person.id,
    sessionId: 's',
    servers: new Set<string>([serverId]),
    permissionCache: new Map(),
    status: 'online',
    lastSeenAt: Date.now(),
    alive: true,
  } as unknown as Parameters<typeof hub.addConnection>[0]);
}

const copyFor = (person: Person) => ({
  userId: person.id,
  deviceId: person.deviceId,
  iv: b64(randomBytes(12)),
  key: b64(randomBytes(48)),
});

describe('encrypted channels', () => {
  let app: App;
  let serverId = '';
  let channelId = '';
  const people: Record<'wes' | 'alex' | 'mara' | 'dev' | 'stranger', Person> = {} as never;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();

    for (const name of ['wes', 'alex', 'mara', 'dev', 'stranger'] as const) {
      const user = await registerUser({
        username: name,
        displayName: name,
        password: 'a long enough password',
        inviteCode: null,
        skipInvite: true,
      });
      const session = await createSession(user, null);
      const base = { id: user.id, cookie: `${config.cookieName}=${session.token}`, deviceId: `device-${name}-0001`, inbox: [] };
      people[name] = { ...base, signing: await publishDevice(app, base) };
    }

    const made = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: people.wes.cookie },
      payload: { name: 'Table' },
    });
    assert.equal(made.statusCode, 200, made.body);
    serverId = made.json().server.id as string;
    await getDb()
      .insert(members)
      .values([people.alex, people.mara].map((person) => ({ serverId, userId: person.id })));
    for (const person of Object.values(people)) listen(person, serverId);
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const call = (person: Person, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: person.cookie }, ...(payload ? { payload } : {}) });

  async function makeEpoch(maker: Person, epoch: number, to: Person[]) {
    const commitment = randomBytes(32);
    const signature = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      maker.signing,
      epochSignedBytes({ channelId, epoch, creatorId: maker.id, creatorDeviceId: maker.deviceId, commitment }),
    );
    return call(maker, 'POST', `/api/channels/${channelId}/epochs`, {
      epoch,
      deviceId: maker.deviceId,
      commitment: b64(commitment),
      signature: b64(signature),
      keys: to.map(copyFor),
    });
  }

  async function sealed(sender: Person, epoch: number, extra: { mentionIds?: string[]; signer?: CryptoKey } = {}) {
    const nonce = randomBytes(12);
    const ciphertext = randomBytes(64);
    const mentionIds = extra.mentionIds ?? [];
    const signature = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      extra.signer ?? sender.signing,
      messageSignedBytes({
        channelId,
        epoch,
        authorId: sender.id,
        senderDeviceId: sender.deviceId,
        replyToId: null,
        mentionIds,
        mentionsEveryone: false,
        nonce,
        ciphertext,
      }),
    );
    return {
      ciphertext: b64(ciphertext),
      nonce: b64(nonce),
      keyEpoch: epoch,
      senderDeviceId: sender.deviceId,
      signature: b64(signature),
      mentionIds,
      mentionsEveryone: false,
    };
  }

  const state = async (person: Person): Promise<ChannelKeyState> => {
    const reply = await call(person, 'GET', `/api/channels/${channelId}/keys?deviceId=${person.deviceId}`);
    assert.equal(reply.statusCode, 200, reply.body);
    return reply.json() as ChannelKeyState;
  };

  it('makes an encrypted text channel, and a voice channel is never flagged', async () => {
    const text = await call(people.wes, 'POST', `/api/servers/${serverId}/channels`, { name: 'secrets', type: 'text', encrypted: true });
    assert.equal(text.statusCode, 200, text.body);
    assert.equal(text.json().channel.encrypted, true);
    channelId = text.json().channel.id as string;

    const voice = await call(people.wes, 'POST', `/api/servers/${serverId}/channels`, { name: 'Table', type: 'voice', encrypted: true });
    assert.equal(voice.json().channel.encrypted, false);
  });

  it('refuses plaintext, and a sealed message before anyone has made the key', async () => {
    const plain = await call(people.wes, 'POST', `/api/channels/${channelId}/messages`, { content: 'hello' });
    assert.equal(plain.statusCode, 400);
    const early = await call(people.wes, 'POST', `/api/channels/${channelId}/messages`, await sealed(people.wes, 1));
    assert.equal(early.statusCode, 409);
    assert.equal(early.json().code, 'no_epoch');
  });

  it('refuses a key locked for someone who cannot read the channel', async () => {
    const { wes, alex, stranger } = people;
    const reply = await makeEpoch(wes, 1, [wes, alex, stranger]);
    assert.equal(reply.statusCode, 400);
    assert.equal(reply.json().code, 'not_a_reader');
  });

  it('refuses a key whose maker did not sign it, or that leaves out the maker', async () => {
    const { wes, alex, mara } = people;
    const forged = await makeEpoch({ ...wes, signing: alex.signing }, 1, [wes, alex]);
    assert.equal(forged.json().code, 'bad_signature');
    const noOwn = await makeEpoch(wes, 1, [alex, mara]);
    assert.equal(noOwn.json().code, 'missing_own_copy');
  });

  it('stores the first key made, once, and tells the readers', async () => {
    const { wes, alex, mara, stranger } = people;
    const made = await makeEpoch(wes, 1, [wes, alex, mara]);
    assert.equal(made.statusCode, 200, made.body);
    const again = await makeEpoch(alex, 1, [alex, wes]);
    assert.equal(again.json().code, 'epoch_exists');
    assert.ok(alex.inbox.some((event) => event.t === 'channel_keys' && event.d.channelId === channelId));
    assert.ok(!stranger.inbox.some((event) => event.t === 'channel_keys'));

    const mine = await state(alex);
    assert.equal(mine.current, 1);
    assert.equal(mine.keys.length, 1);
    assert.equal(mine.keys[0]?.wrapperId, wes.id);
    assert.equal(mine.holders.length, 3);
  });

  it('stores a signed message with no readable body, and pings who the sender named', async () => {
    const { wes, alex } = people;
    const reply = await call(wes, 'POST', `/api/channels/${channelId}/messages`, await sealed(wes, 1, { mentionIds: [alex.id] }));
    assert.equal(reply.statusCode, 200, reply.body);
    const message = reply.json().message;
    assert.equal(message.content, null);
    assert.equal(message.senderDeviceId, wes.deviceId);
    assert.deepEqual(message.mentions, [alex.id]);

    const [row] = await getDb().select().from(messages).where(eq(messages.id, message.id));
    assert.equal(row?.content, null);
    assert.ok(row?.ciphertext && row.signature);
  });

  it('refuses a message signed by the wrong key, or pinging a stranger', async () => {
    const { wes, alex, stranger } = people;
    const wrongKey = await call(wes, 'POST', `/api/channels/${channelId}/messages`, await sealed(wes, 1, { signer: alex.signing }));
    assert.equal(wrongKey.json().code, 'bad_signature');
    const strangerPing = await call(wes, 'POST', `/api/channels/${channelId}/messages`, await sealed(wes, 1, { mentionIds: [stranger.id] }));
    assert.equal(strangerPing.json().code, 'unknown_member');
    const files = await call(wes, 'POST', `/api/channels/${channelId}/messages`, { ...(await sealed(wes, 1)), attachmentIds: ['x'] });
    assert.equal(files.json().code, 'encrypted_files_unsupported');
  });

  it('retires the key when someone who holds it is removed, and refuses the old one', async () => {
    const { wes, alex, mara } = people;
    const kicked = await call(wes, 'DELETE', `/api/servers/${serverId}/members/${mara.id}`);
    assert.equal(kicked.statusCode, 200, kicked.body);

    alex.inbox.length = 0;
    const old = await call(alex, 'POST', `/api/channels/${channelId}/messages`, await sealed(alex, 1));
    assert.equal(old.statusCode, 409);
    assert.equal(old.json().code, 'key_rotated');
    assert.ok(alex.inbox.some((event) => event.t === 'channel_keys' && event.d.current === 2));
    assert.equal((await state(wes)).current, 2);

    // The new key cannot be locked for Mara.
    const withMara = await makeEpoch(alex, 2, [alex, wes, mara]);
    assert.equal(withMara.json().code, 'not_a_reader');
    const made = await makeEpoch(alex, 2, [alex, wes]);
    assert.equal(made.statusCode, 200, made.body);
    const sent = await call(alex, 'POST', `/api/channels/${channelId}/messages`, await sealed(alex, 2));
    assert.equal(sent.statusCode, 200, sent.body);
  });

  it('a gain does not retire the key: a newcomer is handed every epoch, by someone who has it', async () => {
    const { wes, alex, mara, dev } = people;
    await getDb().insert(members).values({ serverId, userId: dev.id });
    assert.equal((await state(dev)).current, 2);

    const asked = await call(wes, 'GET', `/api/channels/${channelId}/keys/wanted?deviceId=${wes.deviceId}`);
    const wanted = asked.json().wanted as { epoch: number; userId: string }[];
    assert.deepEqual(
      wanted.filter((want) => want.userId === dev.id).map((want) => want.epoch).sort(),
      [1, 2],
    );
    assert.ok(!wanted.some((want) => want.userId === mara.id), 'nobody is asked to hand keys to Mara');

    const handed = await call(wes, 'POST', `/api/channels/${channelId}/keys`, {
      deviceId: wes.deviceId,
      keys: [1, 2].map((epoch) => ({ epoch, ...copyFor(dev) })).concat([{ epoch: 2, ...copyFor(mara) }]),
    });
    assert.equal(handed.statusCode, 200, handed.body);
    assert.equal(handed.json().added, 2, 'the copy for Mara is dropped');
    assert.equal((await state(dev)).keys.length, 2);
    assert.equal((await state(wes)).current, 2, 'still the same key');
  });

  it('a device can only hand on an epoch it holds', async () => {
    const { wes, alex } = people;
    const late = people.stranger;
    await getDb().insert(members).values({ serverId, userId: late.id });
    // Epoch 3 does not exist, so Alex holds no copy of it: a key for it could only be made up.
    const invented = await call(alex, 'POST', `/api/channels/${channelId}/keys`, {
      deviceId: alex.deviceId,
      keys: [{ epoch: 3, ...copyFor(late) }],
    });
    assert.equal(invented.json().added, 0);
    const real = await call(alex, 'POST', `/api/channels/${channelId}/keys`, {
      deviceId: alex.deviceId,
      keys: [{ epoch: 2, ...copyFor(late) }],
    });
    assert.equal(real.json().added, 1);
    await call(wes, 'DELETE', `/api/servers/${serverId}/members/${late.id}`);
  });

  it('someone who cannot read the channel learns nothing about its keys', async () => {
    const { stranger } = people;
    const reply = await call(stranger, 'GET', `/api/channels/${channelId}/keys?deviceId=${stranger.deviceId}`);
    assert.equal(reply.statusCode, 404);
    const devices = await call(stranger, 'GET', `/api/channels/${channelId}/key-devices`);
    assert.equal(devices.statusCode, 404);
  });
});

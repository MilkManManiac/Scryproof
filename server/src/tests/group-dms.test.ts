/**
 * Group conversations, as the server sees them: who is in one, who a message
 * reaches, and what a block does when there are more than two people.
 *
 * The server never sees a message, so the sealed bytes and the copies of the
 * key here are random. What is under test is the part the server decides:
 * which copies it keeps, and who it tells.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, webcrypto } from 'node:crypto';

import type { DmChannel, DmMessage, ServerEvent } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-group-dms-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const hub = await import('../gateway/hub.js');

type App = Awaited<ReturnType<typeof buildApp>>;

/** Length-prefixed join, as the client signs with. */
function concatLabelled(...parts: (string | Uint8Array)[]): Uint8Array {
  const encoded = parts.map((part) => (typeof part === 'string' ? new TextEncoder().encode(part) : part));
  const out = new Uint8Array(encoded.reduce((sum, part) => sum + 4 + part.length, 0));
  const view = new DataView(out.buffer);
  let at = 0;
  for (const part of encoded) {
    view.setUint32(at, part.length, false);
    out.set(part, at + 4);
    at += 4 + part.length;
  }
  return out;
}

const b64 = (bytes: ArrayBuffer | Uint8Array): string => Buffer.from(bytes as ArrayBuffer).toString('base64');

interface Person {
  id: string;
  name: string;
  cookie: string;
  deviceId: string;
  inbox: ServerEvent[];
}

/** One browser's worth of keys, published the way a real one would. */
async function publishDevice(app: App, person: Person): Promise<void> {
  const subtle = webcrypto.subtle;
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
}

function listen(person: Person): void {
  hub.addConnection({
    id: `listener-${person.id}`,
    ws: { readyState: 1, send: (raw: string) => person.inbox.push(JSON.parse(raw) as ServerEvent) },
    userId: person.id,
    sessionId: 's',
    servers: new Set<string>(),
    permissionCache: new Map(),
    status: 'online',
    lastSeenAt: Date.now(),
    alive: true,
  } as unknown as Parameters<typeof hub.addConnection>[0]);
}

describe('group conversations', () => {
  let app: App;
  const people: Record<'wes' | 'alex' | 'mara' | 'dev' | 'stranger', Person> = {} as never;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();

    for (const name of ['wes', 'alex', 'mara', 'dev', 'stranger'] as const) {
      const user = await registerUser({
        username: name,
        displayName: name[0]!.toUpperCase() + name.slice(1),
        password: 'a long enough password',
        inviteCode: null,
        skipInvite: true,
      });
      const session = await createSession(user, null);
      people[name] = {
        id: user.id,
        name,
        cookie: `${config.cookieName}=${session.token}`,
        deviceId: `device-${name}-0001`,
        inbox: [],
      };
    }

    // Everyone but the stranger shares one server.
    const made = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: people.wes.cookie },
      payload: { name: 'Table' },
    });
    assert.equal(made.statusCode, 200, made.body);
    const serverId = made.json().server.id as string;
    await getDb()
      .insert(members)
      .values([people.alex, people.mara, people.dev].map((person) => ({ serverId, userId: person.id })));

    for (const person of Object.values(people)) {
      await publishDevice(app, person);
      listen(person);
    }
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const call = (person: Person, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: person.cookie }, ...(payload ? { payload } : {}) });

  /** A sealed message with one random key copy for each person named. */
  const sealedFor = (sender: Person, to: Person[]) => ({
    senderDeviceId: sender.deviceId,
    iv: b64(randomBytes(12)),
    ciphertext: b64(randomBytes(48)),
    keys: [sender, ...to].map((person) => ({
      userId: person.id,
      deviceId: person.deviceId,
      iv: b64(randomBytes(12)),
      key: b64(randomBytes(48)),
    })),
  });

  const created = (person: Person, dmId: string): DmMessage | undefined =>
    person.inbox
      .filter((event): event is Extract<ServerEvent, { t: 'dm_message_create' }> => event.t === 'dm_message_create')
      .map((event) => event.d)
      .find((message) => message.dmId === dmId);

  let groupId = '';

  it('makes a group of three, and tells the other two', async () => {
    const { wes, alex, mara } = people;
    const reply = await call(wes, 'POST', '/api/dms/groups', { userIds: [alex.id, mara.id] });
    assert.equal(reply.statusCode, 200, reply.body);
    const dm = reply.json().dm as DmChannel;
    assert.equal(dm.kind, 'group');
    assert.equal(dm.title, null);
    assert.deepEqual(dm.members.map((member) => member.id).sort(), [wes.id, alex.id, mara.id].sort());
    groupId = dm.id;

    for (const person of [alex, mara]) {
      assert.ok(person.inbox.some((event) => event.t === 'dm_create' && event.d.id === groupId), `${person.name} was not told`);
    }
  });

  it('refuses a group of two, and anyone the maker shares no server with', async () => {
    const { wes, alex, mara, stranger } = people;
    const small = await call(wes, 'POST', '/api/dms/groups', { userIds: [alex.id] });
    assert.equal(small.statusCode, 400);
    assert.equal(small.json().code, 'group_too_small');

    const outside = await call(wes, 'POST', '/api/dms/groups', { userIds: [alex.id, stranger.id] });
    assert.equal(outside.statusCode, 404);

    const intoGroup = await call(wes, 'POST', `/api/dms/${groupId}/members`, { userId: stranger.id });
    assert.equal(intoGroup.statusCode, 404);

    const pair = (await call(wes, 'POST', '/api/dms', { userId: mara.id })).json().dm as DmChannel;
    assert.equal(pair.kind, 'pair');
    const grow = await call(wes, 'POST', `/api/dms/${pair.id}/members`, { userId: alex.id });
    assert.equal(grow.statusCode, 400);
    assert.equal(grow.json().code, 'not_a_group');
  });

  it('delivers a message to everyone in it, each with only their own copy', async () => {
    const { wes, alex, mara } = people;
    const sent = await call(alex, 'POST', `/api/dms/${groupId}/messages`, sealedFor(alex, [wes, mara]));
    assert.equal(sent.statusCode, 200, sent.body);
    for (const person of [wes, mara]) {
      const message = created(person, groupId);
      assert.ok(message, `${person.name} did not get it`);
      assert.deepEqual(message.keys.map((key) => key.userId), [person.id]);
    }
    for (const person of Object.values(people)) person.inbox.length = 0;
  });

  it('a block stops one person reaching the blocker, and nobody else', async () => {
    const { wes, alex, mara } = people;
    assert.equal((await call(mara, 'PUT', `/api/blocks/${alex.id}`)).statusCode, 200);

    // Alex's app does not know, and seals for Mara as usual.
    const sent = await call(alex, 'POST', `/api/dms/${groupId}/messages`, sealedFor(alex, [wes, mara]));
    assert.equal(sent.statusCode, 200, 'a block in a group must not refuse the sender');
    const messageId = sent.json().message.id as string;
    assert.ok(created(wes, groupId), 'Wes still hears from Alex');
    assert.equal(created(mara, groupId), undefined, 'Mara was told about a message from someone she blocked');

    const history = (await call(mara, 'GET', `/api/dms/${groupId}/messages`)).json().messages as DmMessage[];
    const held = history.find((message) => message.id === messageId);
    assert.ok(held, 'the row is still listed, so replies to it make sense');
    assert.equal(held.keys.length, 0, 'the copy locked for Mara was kept');

    const listed = (await call(mara, 'GET', '/api/dms')).json().dms as DmChannel[];
    assert.notEqual(listed.find((dm) => dm.id === groupId)?.lastMessageId, messageId, 'it made the group unread for Mara');

    // Mara and Wes carry on, and Mara still reaches Alex: the block is hers, not a wall around her.
    for (const person of Object.values(people)) person.inbox.length = 0;
    const back = await call(mara, 'POST', `/api/dms/${groupId}/messages`, sealedFor(mara, [wes, alex]));
    assert.equal(back.statusCode, 200, back.body);
    assert.ok(created(wes, groupId));
    assert.ok(created(alex, groupId));

    // Between two people the block still closes the conversation outright.
    const pairOpen = await call(alex, 'POST', '/api/dms', { userId: mara.id });
    assert.equal(pairOpen.statusCode, 403);

    // Nor can Alex put her in a new group with him.
    const regroup = await call(alex, 'POST', '/api/dms/groups', { userIds: [mara.id, wes.id] });
    assert.equal(regroup.statusCode, 403);

    await app.inject({ method: 'DELETE', url: `/api/blocks/${alex.id}`, headers: { cookie: mara.cookie } });
  });

  it('someone added reads from their joining on', async () => {
    const { wes, alex, mara, dev } = people;
    for (const person of Object.values(people)) person.inbox.length = 0;
    const added = await call(alex, 'POST', `/api/dms/${groupId}/members`, { userId: dev.id });
    assert.equal(added.statusCode, 200, added.body);
    assert.ok(dev.inbox.some((event) => event.t === 'dm_create' && event.d.id === groupId), 'Dev was not told');
    for (const person of [wes, alex, mara]) {
      const update = person.inbox.find((event) => event.t === 'dm_update');
      assert.ok(update && update.t === 'dm_update' && update.d.members.some((member) => member.id === dev.id));
    }

    const again = await call(wes, 'POST', `/api/dms/${groupId}/members`, { userId: dev.id });
    assert.equal(again.statusCode, 409);

    const before = (await call(dev, 'GET', `/api/dms/${groupId}/messages`)).json().messages as DmMessage[];
    assert.equal(before.length, 0, 'Dev was shown what was said before he came');
    const listed = (await call(dev, 'GET', '/api/dms')).json().dms as DmChannel[];
    const mine = listed.find((dm) => dm.id === groupId);
    assert.ok(mine && mine.lastReadMessageId === mine.lastMessageId, 'the group arrived unread for Dev');

    const devices = (await call(dev, 'GET', `/api/dms/${groupId}/devices`)).json().devices as { userId: string }[];
    assert.deepEqual([...new Set(devices.map((device) => device.userId))].sort(), [wes.id, alex.id, mara.id, dev.id].sort());

    const sent = await call(wes, 'POST', `/api/dms/${groupId}/messages`, sealedFor(wes, [alex, mara, dev]));
    assert.equal(sent.statusCode, 200, sent.body);
    const after = (await call(dev, 'GET', `/api/dms/${groupId}/messages`)).json().messages as DmMessage[];
    assert.equal(after.length, 1);
    assert.equal(after[0]!.keys[0]?.userId, dev.id);
  });

  it('counts what is waiting, and reading clears it', async () => {
    const { wes, alex, mara, dev } = people;
    const unread = async (person: Person): Promise<number | undefined> =>
      ((await call(person, 'GET', '/api/dms')).json().dms as DmChannel[]).find((dm) => dm.id === groupId)?.unreadCount;

    // Wes sent one in the last test; Dev has not read it.
    assert.equal(await unread(dev), 1);
    const sent = await call(wes, 'POST', `/api/dms/${groupId}/messages`, sealedFor(wes, [alex, mara, dev]));
    assert.equal(sent.statusCode, 200, sent.body);
    assert.equal(await unread(dev), 2);
    assert.equal(await unread(wes), 0, 'your own messages counted as waiting for you');

    const newest = (sent.json().message as DmMessage).id;
    const read = await call(dev, 'PUT', `/api/dms/${groupId}/read`, { messageId: newest });
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(await unread(dev), 0);
  });

  it('leaving takes someone out of everything sent after', async () => {
    const { wes, alex, mara, dev } = people;
    for (const person of Object.values(people)) person.inbox.length = 0;
    // She is in the group's call when she goes.
    hub.setVoiceState({
      userId: mara.id, serverId: null, channelId: null, dmId: groupId,
      selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false, sharingScreen: false, cameraOn: false,
    });
    const left = await call(mara, 'POST', `/api/dms/${groupId}/leave`);
    assert.equal(left.statusCode, 200, left.body);
    assert.equal(hub.getDmVoiceState(mara.id) ?? null, null, 'and is out of the call');
    assert.ok(
      wes.inbox.some((event) => event.t === 'voice_state_update' && event.d.userId === mara.id && event.d.dmId === null),
      'the others see her go',
    );
    assert.ok(mara.inbox.some((event) => event.t === 'dm_left' && event.d.dmId === groupId));
    assert.ok(wes.inbox.some((event) => event.t === 'dm_update' && !event.d.members.some((member) => member.id === mara.id)));

    const gone = await call(mara, 'GET', `/api/dms/${groupId}/messages`);
    assert.equal(gone.statusCode, 404);

    // A copy still addressed to her is refused, as it would be for anyone outside.
    const stale = await call(wes, 'POST', `/api/dms/${groupId}/messages`, sealedFor(wes, [alex, dev, mara]));
    assert.equal(stale.statusCode, 400);
    assert.equal(stale.json().code, 'invalid_recipient');

    // A pair cannot be left; it can only be blocked.
    const pair = (await call(wes, 'POST', '/api/dms', { userId: alex.id })).json().dm as DmChannel;
    const leavePair = await call(wes, 'POST', `/api/dms/${pair.id}/leave`);
    assert.equal(leavePair.statusCode, 400);
  });
});

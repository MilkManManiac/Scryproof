/**
 * Phone notifications, as the server decides them: who is woken, who is left
 * alone, what a woken phone is told, and that the relay is told nothing.
 *
 * No relay is contacted: the sender is swapped for one that records.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-push-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { channels, members, pushSubscriptions } = await import('../db/schema.js');
const { registerUser, createSession, revokeSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { uuidv7 } = await import('../lib/ids.js');
const hub = await import('../gateway/hub.js');
const push = await import('../services/push.js');
const { isRelayEndpoint, vapidAuthorization, topicFor } = await import('../lib/web-push.js');

type App = Awaited<ReturnType<typeof buildApp>>;

interface Person {
  id: string;
  cookie: string;
  sessionId: string;
  endpoint: string;
}

const pings: { endpoint: string; topic: string }[] = [];
const settle = () => new Promise((done) => setTimeout(done, 50));

describe('phone notifications', () => {
  let app: App;
  let wes: Person;
  let alex: Person;
  let serverId = '';
  let channelId = '';

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();

    const make = async (username: string, displayName: string, host: string): Promise<Person> => {
      const user = await registerUser({
        username,
        displayName,
        password: 'a long enough password',
        inviteCode: null,
        skipInvite: true,
      });
      const session = await createSession(user, null);
      return {
        id: user.id,
        cookie: `${config.cookieName}=${session.token}`,
        sessionId: session.sessionId,
        endpoint: `https://${host}/push/${randomBytes(8).toString('hex')}`,
      };
    };
    wes = await make('wes', 'Wes', 'web.push.apple.com');
    alex = await make('alex', 'Alex', 'fcm.googleapis.com');

    const made = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: wes.cookie },
      payload: { name: 'The Table' },
    });
    assert.equal(made.statusCode, 200, made.body);
    serverId = made.json().server.id as string;
    await getDb().insert(members).values({ serverId, userId: alex.id });
    channelId = uuidv7();
    await getDb().insert(channels).values({ id: channelId, serverId, name: 'general' });

    push.setPingSender(async (endpoint, topic) => {
      pings.push({ endpoint, topic });
      return endpoint.includes('gone') ? 'gone' : 'sent';
    });
  });

  after(async () => {
    push.setPingSender(null);
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    pings.length = 0;
    push.resetPush();
  });

  const call = (person: Person, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: person.cookie }, ...(payload ? { payload } : {}) });

  const subscribe = (
    person: Person,
    settings: { mutedServers?: string[]; mutedChannels?: string[]; mentions?: boolean; messages?: boolean } = {},
  ) =>
    call(person, 'PUT', '/api/push/subscription', {
      endpoint: person.endpoint,
      mutedServers: settings.mutedServers ?? [],
      mutedChannels: settings.mutedChannels ?? [],
      mentions: settings.mentions ?? true,
      messages: settings.messages ?? false,
    });

  const mention = (from: Person, to: Person) =>
    call(from, 'POST', `/api/channels/${channelId}/messages`, { content: `<@${to.id}> are you on tonight?` });

  it('only subscribes to the relays it knows, so the box cannot be made to call anywhere', async () => {
    for (const good of [
      'https://web.push.apple.com/abc',
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=abc',
    ]) {
      assert.equal(isRelayEndpoint(good), true, good);
    }
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/abc',
      'https://fcm.googleapis.com.evil.example/abc',
      'https://127.0.0.1/abc',
      'https://localhost/abc',
      'https://user:pass@fcm.googleapis.com/abc',
      'https://evilpush.apple.com.example/abc',
      'not a url',
    ]) {
      assert.equal(isRelayEndpoint(bad), false, bad);
    }

    const reply = await call(wes, 'PUT', '/api/push/subscription', {
      endpoint: 'https://127.0.0.1:8787/api/servers',
      mutedServers: [],
      mutedChannels: [],
    });
    assert.equal(reply.statusCode, 400);
  });

  it('signs the ping so the relay knows it is us, and that signature checks out', () => {
    const keys = config.push!;
    const header = vapidAuthorization('https://web.push.apple.com/abc', keys, Date.now());
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    assert.ok(match, header);
    const [, head, claims, signature, k] = match;
    assert.equal(k, keys.publicKey);
    assert.deepEqual(JSON.parse(Buffer.from(claims!, 'base64url').toString()).aud, 'https://web.push.apple.com');

    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: point.subarray(1, 33).toString('base64url'),
        y: point.subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${head}.${claims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature!, 'base64url'),
    );
    assert.equal(ok, true);
  });

  it('hands out the public key', async () => {
    const reply = await call(wes, 'GET', '/api/push');
    assert.equal(reply.json().publicKey, config.push!.publicKey);
  });

  it('wakes a mentioned person, and tells their phone that much and no more: not who, not where, not what', async () => {
    assert.equal((await subscribe(wes)).statusCode, 200);
    assert.equal((await mention(alex, wes)).statusCode, 200);
    await settle();

    assert.equal(pings.length, 1);
    assert.equal(pings[0]!.endpoint, wes.endpoint);
    assert.equal(pings[0]!.topic, topicFor(channelId));

    const pending = await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint });
    const body = pending.json();
    assert.equal(body.unread, 1);
    assert.equal(body.show.length, 1);
    assert.equal(body.show[0].title, 'Someone mentioned you');
    assert.equal(body.show[0].body, undefined);
    // Where a tap goes is there; nothing that could be read off a lock screen.
    assert.equal(body.show[0].channelId, channelId);
    for (const secret of ['tonight', 'Alex', 'general', 'The Table']) {
      assert.equal(JSON.stringify(body).includes(secret), false, secret);
    }

    // Drawn once. A second wake does not bring it back.
    const again = (await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json();
    assert.equal(again.show.length, 0);
    assert.equal(again.unread, 1);

    await call(wes, 'POST', '/api/push/seen');
    const seen = (await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json();
    assert.equal(seen.unread, 0);
  });

  it('does not wake the sender, or anyone who was not addressed', async () => {
    await subscribe(alex);
    await call(alex, 'POST', `/api/channels/${channelId}/messages`, { content: 'nobody in particular' });
    await mention(alex, wes);
    await settle();
    assert.deepEqual(
      pings.map((ping) => ping.endpoint),
      [wes.endpoint],
    );
  });

  it('says "Someone messaged you" for a direct message, and nothing about who or which chat', async () => {
    // Called the way routes/dms.ts calls it: a sealed DM needs device keys
    // this file does not set up, and the route adds nothing but the ids.
    await subscribe(wes);
    const dmId = uuidv7();
    await push.pushTo([wes.id], { kind: 'dm', serverId: null, channelId: null, dmId, messageId: uuidv7() });
    assert.equal(pings.length, 1);
    assert.equal(pings[0]!.topic, topicFor(dmId));
    const body = (await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json();
    assert.deepEqual(Object.keys(body.show[0]).sort(), ['channelId', 'dmId', 'kind', 'messageId', 'serverId', 'title']);
    assert.equal(body.show[0].title, 'Someone messaged you');
    assert.equal(body.show[0].dmId, dmId);
  });

  it('wakes a phone for every message only when that phone asked for every message', async () => {
    const chat = () => call(alex, 'POST', `/api/channels/${channelId}/messages`, { content: 'anyone around' });

    await subscribe(wes, { messages: false });
    await chat();
    await settle();
    assert.equal(pings.length, 0);

    await subscribe(wes, { messages: true });
    await chat();
    await settle();
    assert.equal(pings.length, 1);
    const body = (await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json();
    assert.equal(body.show[0].title, 'New message in a channel');
    assert.equal(JSON.stringify(body).includes('anyone'), false);

    // A mention is one notification, the mention, not both.
    pings.length = 0;
    await mention(alex, wes);
    await settle();
    assert.equal(pings.length, 1);
    const both = (await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json();
    assert.deepEqual(
      both.show.map((ping: { title: string }) => ping.title),
      ['Someone mentioned you'],
    );

    // Muting the channel on that phone silences every message too.
    pings.length = 0;
    await subscribe(wes, { messages: true, mutedChannels: [channelId] });
    await chat();
    await settle();
    assert.equal(pings.length, 0);
  });

  it('stays quiet for mentions when that phone turned mention sounds off', async () => {
    await subscribe(wes, { mentions: false });
    await mention(alex, wes);
    await settle();
    assert.equal(pings.length, 0);
    await subscribe(wes);
  });

  it('leaves the phone alone while its person is at another window', async () => {
    const connection = {
      id: 'wes-desk',
      ws: { readyState: 1, send: () => {} },
      userId: wes.id,
      sessionId: 'desk',
      servers: new Set<string>(),
      permissionCache: new Map(),
      status: 'online',
      lastSeenAt: Date.now(),
      alive: true,
      attending: true,
    } as unknown as Parameters<typeof hub.addConnection>[0];
    hub.addConnection(connection);
    try {
      await mention(alex, wes);
      await settle();
      assert.equal(pings.length, 0);

      // Walked away from the desk: the phone gets it again.
      connection.attending = false;
      await mention(alex, wes);
      await settle();
      assert.equal(pings.length, 1);
    } finally {
      hub.removeConnection(connection);
    }
  });

  it('keeps quiet for a muted server or channel, as muted on that phone', async () => {
    await subscribe(wes, { mutedServers: [serverId] });
    await mention(alex, wes);
    await settle();
    assert.equal(pings.length, 0);
    assert.equal((await call(wes, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json().unread, 0);

    await subscribe(wes, { mutedChannels: [channelId] });
    await mention(alex, wes);
    await settle();
    assert.equal(pings.length, 0);

    await subscribe(wes);
    await mention(alex, wes);
    await settle();
    assert.equal(pings.length, 1);
  });

  it('forgets a phone the relay says is gone', async () => {
    const gone = { ...wes, endpoint: 'https://web.push.apple.com/gone-for-good' };
    await subscribe(gone);
    await mention(alex, wes);
    await settle();
    const rows = await getDb().select().from(pushSubscriptions);
    assert.equal(
      rows.some((row) => row.endpoint === gone.endpoint),
      false,
    );
  });

  it('will not show one person what another person\'s phone was sent', async () => {
    await subscribe(wes);
    await mention(alex, wes);
    await settle();
    const snoop = (await call(alex, 'POST', '/api/push/pending', { endpoint: wes.endpoint })).json();
    assert.deepEqual(snoop, { show: [], unread: 0 });
  });

  it('stops when the session that turned it on is signed out', async () => {
    await subscribe(wes);
    await revokeSession(wes.sessionId);
    await mention(alex, wes);
    await settle();
    assert.equal(pings.length, 0);
  });
});

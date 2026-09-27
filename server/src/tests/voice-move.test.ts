/**
 * Moving someone between voice channels (POST /members/:userId/move).
 * Wes, 2026-09-26: "an admin should be able to move who is in voice calls
 * kinda like disc". The rules that matter: only someone with Move members
 * who outranks them, only into a channel they are allowed in, and the old
 * call is left for real (the state is cleared, which rotates its key) even
 * if their device never acts on the event.
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Permission, type ServerDetail, type ServerEvent } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-voice-move-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { channelOverwrites, members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const hub = await import('../gateway/hub.js');

type App = Awaited<ReturnType<typeof buildApp>>;

interface Person {
  id: string;
  cookie: string;
}

async function person(username: string): Promise<Person> {
  const user = await registerUser({
    username,
    displayName: username,
    password: 'a long enough password',
    inviteCode: null,
    skipInvite: true,
  });
  const session = await createSession(user, null);
  return { id: user.id, cookie: `${config.cookieName}=${session.token}` };
}

/**
 * A stand-in for someone's open window, keeping what the server sends it.
 * `followsMoves` is what an app from 2026-09-27 on says when it connects.
 */
function listen(userId: string, serverId: string, followsMoves = true): ServerEvent[] {
  const heard: ServerEvent[] = [];
  hub.addConnection({
    id: `test-${userId}`,
    ws: { readyState: 1, send: (raw: string) => heard.push(JSON.parse(raw) as ServerEvent) } as never,
    userId,
    sessionId: 'test',
    servers: new Set([serverId]),
    permissionCache: new Map(),
    status: 'online',
    lastSeenAt: Date.now(),
    alive: true,
    followsMoves,
  });
  return heard;
}

function seat(serverId: string, userId: string, channelId: string): void {
  hub.setVoiceState({
    userId,
    serverId,
    channelId,
    dmId: null,
    selfMute: false,
    selfDeaf: false,
    serverMute: false,
    serverDeaf: false,
    sharingScreen: false,
    cameraOn: false,
  });
}

describe('moving someone between voice channels', () => {
  let app: App;
  let owner: Person;
  let friend: Person;
  let other: Person;
  let server: ServerDetail;
  let lounge: string;
  let den: string;
  let secret: string;
  let heard: ServerEvent[];

  const move = (by: Person, userId: string, channelId: string) =>
    app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/members/${userId}/move`,
      headers: { cookie: by.cookie },
      payload: { channelId },
    });

  const voiceChannel = async (name: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/channels`,
      headers: { cookie: owner.cookie },
      payload: { name, type: 'voice' },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().channel.id as string;
  };

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    owner = await person('move-owner');
    friend = await person('move-friend');
    other = await person('move-other');

    const created = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: owner.cookie },
      payload: { name: 'Moves' },
    });
    assert.equal(created.statusCode, 200, created.body);
    server = created.json().server as ServerDetail;
    await getDb().insert(members).values([
      { serverId: server.id, userId: friend.id },
      { serverId: server.id, userId: other.id },
    ]);

    lounge = await voiceChannel('Lounge');
    den = await voiceChannel('Den');
    secret = await voiceChannel('Secret');
    // Secret: nobody but the owner may connect.
    const everyone = server.roles.find((role) => role.isEveryone)!;
    await getDb().insert(channelOverwrites).values({
      channelId: secret,
      targetType: 'role',
      targetId: everyone.id,
      allow: 0n,
      deny: Permission.CONNECT,
    });
    heard = listen(friend.id, server.id);
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('moves them: tells them where to, then takes them out of the old call', async () => {
    seat(server.id, friend.id, lounge);
    heard.length = 0;
    const response = await move(owner, friend.id, den);
    assert.equal(response.statusCode, 200, response.body);

    assert.equal(hub.getVoiceState(server.id, friend.id), null);
    const first = heard[0];
    assert.equal(first?.t, 'voice_move');
    assert.deepEqual(first?.t === 'voice_move' ? first.d : null, {
      serverId: server.id,
      fromChannelId: lounge,
      channelId: den,
      by: owner.id,
    });
    // After it, the departure from the old channel.
    assert.ok(heard.slice(1).some((event) => event.t === 'voice_state_update' && event.d.channelId === null));
  });

  it('refuses to move someone whose app cannot follow, rather than drop them', async () => {
    // Wes, 2026-09-27: the one friend whose app was out of date was dropped.
    listen(other.id, server.id, false);
    seat(server.id, other.id, lounge);
    const response = await move(owner, other.id, den);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, 'outdated_app');
    assert.equal(hub.getVoiceState(server.id, other.id)?.channelId, lounge);
    hub.setVoiceState({ ...hub.getVoiceState(server.id, other.id)!, channelId: null });
  });

  it('refuses without Move members', async () => {
    seat(server.id, friend.id, lounge);
    const response = await move(other, friend.id, den);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(hub.getVoiceState(server.id, friend.id)?.channelId, lounge);
  });

  it('will not put them in a channel they are not allowed in', async () => {
    seat(server.id, friend.id, lounge);
    const response = await move(owner, friend.id, secret);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().code, 'target_cannot_connect');
    assert.equal(hub.getVoiceState(server.id, friend.id)?.channelId, lounge);
  });

  it('refuses someone who is not in a call, and a channel that is not voice', async () => {
    const idle = await move(owner, other.id, den);
    assert.equal(idle.statusCode, 400, idle.body);
    assert.equal(idle.json().code, 'not_in_voice');

    seat(server.id, friend.id, lounge);
    const text = server.channels.find((channel) => channel.type === 'text')!;
    const notVoice = await move(owner, friend.id, text.id);
    assert.equal(notVoice.statusCode, 400, notVoice.body);
  });

  it('cannot move the owner', async () => {
    seat(server.id, owner.id, lounge);
    // Give the friend Move members through @everyone for this one check.
    const everyone = server.roles.find((role) => role.isEveryone)!;
    const granted = await app.inject({
      method: 'PATCH',
      url: `/api/roles/${everyone.id}`,
      headers: { cookie: owner.cookie },
      payload: { permissions: (BigInt(everyone.permissions) | Permission.MOVE_MEMBERS).toString() },
    });
    assert.equal(granted.statusCode, 200, granted.body);
    const response = await move(friend, owner.id, den);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(hub.getVoiceState(server.id, owner.id)?.channelId, lounge);
  });

  it('a kick takes them out of the call first, and tells them', async () => {
    seat(server.id, friend.id, lounge);
    heard.length = 0;
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/servers/${server.id}/members/${friend.id}`,
      headers: { cookie: owner.cookie },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(hub.getVoiceState(server.id, friend.id), null);
    const left = heard.findIndex((event) => event.t === 'voice_state_update' && event.d.userId === friend.id && event.d.channelId === null);
    const gone = heard.findIndex((event) => event.t === 'server_delete');
    assert.ok(left >= 0, 'their app hears it is out of the call, so it hangs up');
    assert.ok(gone > left, 'before the server disappears from their list');
  });
});

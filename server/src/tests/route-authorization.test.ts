/**
 * Object authorization at route boundaries. These checks use real HTTP
 * handlers and a real test database so a permissive route cannot hide behind
 * correct lower-level permission arithmetic.
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Permission, encodeMask, type ServerDetail } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-route-authorization-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { avatars, channelOverwrites, categoryOverwrites, members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

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

describe('route authorization', () => {
  let app: App;
  let host: Person;
  let friend: Person;
  let stranger: Person;
  let first: ServerDetail;
  let second: ServerDetail;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    host = await person('route-host');
    friend = await person('route-friend');
    stranger = await person('route-stranger');

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: host.cookie },
      payload: { name: 'First' },
    });
    assert.equal(firstResponse.statusCode, 200, firstResponse.body);
    first = firstResponse.json().server as ServerDetail;

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie: host.cookie },
      payload: { name: 'Second' },
    });
    assert.equal(secondResponse.statusCode, 200, secondResponse.body);
    second = secondResponse.json().server as ServerDetail;

    await getDb().insert(members).values({ serverId: first.id, userId: friend.id });
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('has no endpoint for joining a server by id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/servers/${first.id}/members/${stranger.id}`,
      headers: { cookie: stranger.cookie },
    });
    assert.equal(response.statusCode, 404, response.body);

    const rows = await getDb().select().from(members);
    assert.equal(rows.some((row) => row.serverId === first.id && row.userId === stranger.id), false);
  });

  it('allows only the host to create account invitations', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/instance-invites',
      headers: { cookie: friend.cookie },
      payload: {},
    });
    assert.equal(refused.statusCode, 403, refused.body);

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/instance-invites',
      headers: { cookie: host.cookie },
      payload: {},
    });
    assert.equal(allowed.statusCode, 200, allowed.body);
  });

  it('does not move a channel under a category from another server', async () => {
    const channel = first.channels[0]!;
    const originalCategoryId = channel.categoryId;
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/channels/${channel.id}`,
      headers: { cookie: host.cookie },
      payload: { categoryId: second.categories[0]!.id },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, 'unknown_category');

    const unchanged = await app.inject({
      method: 'GET',
      url: `/api/channels/${channel.id}`,
      headers: { cookie: host.cookie },
    });
    assert.equal(unchanged.statusCode, 200, unchanged.body);
    assert.equal(unchanged.json().channel.categoryId, originalCategoryId);
  });

  it('accepts member overwrites only for members of the same server', async () => {
    const channel = first.channels[0]!;
    const category = first.categories[0]!;
    const payload = {
      targetType: 'member',
      allow: encodeMask(Permission.VIEW_CHANNEL),
      deny: '0',
    };

    const channelRefused = await app.inject({
      method: 'PUT',
      url: `/api/channels/${channel.id}/permissions/${stranger.id}`,
      headers: { cookie: host.cookie },
      payload,
    });
    assert.equal(channelRefused.statusCode, 400, channelRefused.body);
    assert.equal(channelRefused.json().code, 'unknown_member');

    const categoryRefused = await app.inject({
      method: 'PUT',
      url: `/api/categories/${category.id}/permissions/${stranger.id}`,
      headers: { cookie: host.cookie },
      payload,
    });
    assert.equal(categoryRefused.statusCode, 400, categoryRefused.body);
    assert.equal(categoryRefused.json().code, 'unknown_member');

    assert.equal((await getDb().select().from(channelOverwrites)).length, 0);
    assert.equal((await getDb().select().from(categoryOverwrites)).length, 0);

    const allowed = await app.inject({
      method: 'PUT',
      url: `/api/channels/${channel.id}/permissions/${friend.id}`,
      headers: { cookie: host.cookie },
      payload,
    });
    assert.equal(allowed.statusCode, 200, allowed.body);
  });

  it('returns profiles only for the caller and shared-server members', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/users/lookup',
      headers: { cookie: friend.cookie },
      payload: { ids: [friend.id, host.id, stranger.id] },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(
      new Set(response.json().users.map((user: { id: string }) => user.id)),
      new Set([friend.id, host.id]),
    );
  });

  it('hides avatars from users who do not share a server', async () => {
    const avatarId = 'route-avatar';
    await getDb().insert(avatars).values({
      id: avatarId,
      userId: host.id,
      storageKey: 'not-read-by-this-test',
      contentType: 'image/png',
      size: 1,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/avatars/${host.id}/${avatarId}`,
      headers: { cookie: stranger.cookie },
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().code, 'unknown_avatar');
  });
});

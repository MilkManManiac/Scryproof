/**
 * Only the host makes new servers (Wes, 2026-09-23: "Don't let other people
 * make new servers right now"). The host is whoever owns the first server the
 * box ever had; before there is one, anyone may start.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-server-create-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { canCreateServers } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

async function person(username: string) {
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

describe('making a server', () => {
  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('is open on an empty box, then only the host may', async () => {
    const host = await person('host');
    const friend = await person('friend');
    const app = await buildApp();
    try {
      assert.equal(await canCreateServers(friend.id), true, 'anyone may start an empty box');

      const first = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: host.cookie }, payload: { name: 'Home' } });
      assert.equal(first.statusCode, 200);

      // A friend's try becomes a request the host answers (Wes, 2026-10-20), not a refusal.
      const asked = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: friend.cookie }, payload: { name: 'Mine' } });
      assert.equal(asked.statusCode, 200);
      const { request } = asked.json() as { request: { id: string; name: string } };
      assert.equal(request.name, 'Mine');
      assert.equal(await canCreateServers(friend.id), false);

      const again = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: friend.cookie }, payload: { name: 'Mine 2' } });
      assert.equal((again.json() as { request: { id: string } }).request.id, request.id, 'one request per person; asking again renames it');

      const notHost = await app.inject({ method: 'GET', url: '/api/host/server-requests', headers: { cookie: friend.cookie } });
      assert.equal(notHost.statusCode, 403);
      const list = await app.inject({ method: 'GET', url: '/api/host/server-requests', headers: { cookie: host.cookie } });
      assert.deepEqual((list.json() as { requests: { name: string }[] }).requests.map((r) => r.name), ['Mine 2']);

      const yes = await app.inject({ method: 'POST', url: `/api/host/server-requests/${request.id}`, headers: { cookie: host.cookie }, payload: { approve: true } });
      assert.equal(yes.statusCode, 200);
      const mine = await app.inject({ method: 'GET', url: '/api/servers', headers: { cookie: friend.cookie } });
      const owned = (mine.json() as { servers: { name: string; ownerId: string }[] }).servers;
      assert.deepEqual(owned.map((s) => [s.name, s.ownerId === friend.id]), [['Mine 2', true]]);
      const twice = await app.inject({ method: 'POST', url: `/api/host/server-requests/${request.id}`, headers: { cookie: host.cookie }, payload: { approve: true } });
      assert.equal(twice.statusCode, 400, 'answered once');

      const second = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: host.cookie }, payload: { name: 'Another' } });
      assert.equal(second.statusCode, 200, 'the host still can');
      assert.equal(await canCreateServers(host.id), true);
    } finally {
      await app.close();
    }
  });
});

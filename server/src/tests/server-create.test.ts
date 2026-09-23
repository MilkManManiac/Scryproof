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

      const refused = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: friend.cookie }, payload: { name: 'Mine' } });
      assert.equal(refused.statusCode, 403);
      assert.equal(await canCreateServers(friend.id), false);

      const second = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: host.cookie }, payload: { name: 'Another' } });
      assert.equal(second.statusCode, 200, 'the host still can');
      assert.equal(await canCreateServers(host.id), true);
    } finally {
      await app.close();
    }
  });
});

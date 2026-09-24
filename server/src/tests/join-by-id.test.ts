/**
 * Two holes Alex found on 2026-09-24, kept closed:
 *
 * - Nobody walks into a server by its id. The only way in is an invite. A
 *   self-join route used to exist and let any signed-in account into any
 *   server.
 * - Only the host mints invites that create accounts. Any account used to be
 *   able to, which made "invite only" mean nothing.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-join-by-id-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
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

let host: { id: string; cookie: string };

describe('getting into places', () => {
  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('a server cannot be joined by id, only by invite', async () => {
    host = await person('host');
    const stranger = await person('stranger');
    const home = await createServer({ name: 'Find me', ownerId: host.id });
    const app = await buildApp();
    try {
      const walkIn = await app.inject({
        method: 'POST',
        url: `/api/servers/${home.id}/members/${stranger.id}`,
        headers: { cookie: stranger.cookie },
      });
      assert.equal(walkIn.statusCode, 404, 'there is no such route');

      const list = await app.inject({ method: 'GET', url: '/api/servers', headers: { cookie: stranger.cookie } });
      assert.deepEqual(list.json().servers, [], 'the stranger is in nothing');

      const invite = await app.inject({
        method: 'POST',
        url: `/api/servers/${home.id}/invites`,
        headers: { cookie: host.cookie },
        payload: {},
      });
      assert.equal(invite.statusCode, 200);
      const accepted = await app.inject({
        method: 'POST',
        url: `/api/invites/${invite.json().invite.code}/accept`,
        headers: { cookie: stranger.cookie },
      });
      assert.equal(accepted.statusCode, 200, 'the invite is the way in');
    } finally {
      await app.close();
    }
  });

  it('only the host mints invites that create accounts', async () => {
    const member = await person('member');
    const app = await buildApp();
    try {
      const refused = await app.inject({
        method: 'POST',
        url: '/api/instance-invites',
        headers: { cookie: member.cookie },
        payload: { maxUses: 5 },
      });
      assert.equal(refused.statusCode, 403, 'a plain account may not');

      const minted = await app.inject({
        method: 'POST',
        url: '/api/instance-invites',
        headers: { cookie: host.cookie },
        payload: { maxUses: 5 },
      });
      assert.equal(minted.statusCode, 200, 'the host may');
    } finally {
      await app.close();
    }
  });
});

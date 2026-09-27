/**
 * Wes, 2026-09-27: "add an ability to kick someone from the server and make
 * sure they cannot join again until they get a new invite. also make all
 * invites expire after 48 hours".
 *
 * - A kicked person is refused by every invite made before the kick, the one
 *   they came in on included, and let back in by one made after it. The old
 *   invites still work for everyone else.
 * - No invite outlives 48 hours: not a new one, whatever an old app asks
 *   for, and not one minted before the rule.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LIMITS } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-kicks-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { invites } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

type App = Awaited<ReturnType<typeof buildApp>>;

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

describe('kicks and invites', () => {
  let app: App;
  let host: Awaited<ReturnType<typeof person>>;
  let serverId: string;

  const mint = async (expiresIn?: string) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/servers/${serverId}/invites`,
      headers: { cookie: host.cookie },
      payload: expiresIn ? { expiresIn } : {},
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().invite as { code: string; expiresAt: string | null };
  };
  const accept = (code: string, cookie: string) =>
    app.inject({ method: 'POST', url: `/api/invites/${code}/accept`, headers: { cookie } });
  const kick = (userId: string) =>
    app.inject({ method: 'DELETE', url: `/api/servers/${serverId}/members/${userId}`, headers: { cookie: host.cookie } });

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    host = await person('kick-host');
    serverId = (await createServer({ name: 'Kicks', ownerId: host.id })).id;
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('a kicked person needs an invite made after the kick', async () => {
    const rowdy = await person('rowdy');
    const bystander = await person('bystander');
    const old = await mint();

    assert.equal((await accept(old.code, rowdy.cookie)).statusCode, 200);
    assert.equal((await kick(rowdy.id)).statusCode, 200);

    const back = await accept(old.code, rowdy.cookie);
    assert.equal(back.statusCode, 403, 'the link they already have is dead for them');
    assert.equal(back.json().code, 'kicked');

    const preview = await app.inject({ method: 'GET', url: `/api/invites/${old.code}`, headers: { cookie: rowdy.cookie } });
    assert.equal(preview.statusCode, 403, 'and the join screen says so before they click');

    assert.equal((await accept(old.code, bystander.cookie)).statusCode, 200, 'it still works for everyone else');

    const fresh = await mint();
    assert.equal((await accept(fresh.code, rowdy.cookie)).statusCode, 200, 'a new invite brings them back');
  });

  it('only someone with Kick members, above them, can kick', async () => {
    const one = await person('kick-one');
    const two = await person('kick-two');
    const invite = await mint();
    await accept(invite.code, one.cookie);
    await accept(invite.code, two.cookie);
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/servers/${serverId}/members/${two.id}`,
      headers: { cookie: one.cookie },
    });
    assert.equal(response.statusCode, 403, response.body);
    const hostKick = await app.inject({
      method: 'DELETE',
      url: `/api/servers/${serverId}/members/${host.id}`,
      headers: { cookie: one.cookie },
    });
    assert.equal(hostKick.statusCode, 403, 'nobody kicks the owner');
  });

  it('no invite lives past 48 hours, whatever is asked for', async () => {
    const ceiling = Date.now() + LIMITS.inviteLifetimeMs + 5_000;
    for (const asked of [undefined, '2d', '7d', 'never']) {
      const invite = await mint(asked);
      assert.ok(invite.expiresAt, `${asked ?? 'default'} has an end`);
      assert.ok(new Date(invite.expiresAt).getTime() <= ceiling, `${asked ?? 'default'} ends within 48 hours`);
    }
  });

  it('an invite minted before the rule, with no end, stops after 48 hours', async () => {
    const late = await person('late');
    await getDb().insert(invites).values({
      code: 'oldneverending',
      serverId,
      createdBy: host.id,
      expiresAt: null,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    const response = await accept('oldneverending', late.cookie);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, 'invalid_invite');
  });
});

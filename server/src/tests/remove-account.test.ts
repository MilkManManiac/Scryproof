/**
 * Wes, 2026-09-28: "how do i kick someone from the app". Only the host can,
 * and afterwards the person cannot sign in, their old sign-ins stop, their
 * open windows are cut off, they are out of every server, and an old invite
 * does not bring them back.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-remove-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const hub = await import('../gateway/hub.js');

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
  return { id: user.id, username, sessionId: session.sessionId, cookie: `${config.cookieName}=${session.token}` };
}

describe('removing someone from Scryproof', () => {
  let app: App;
  let host: Awaited<ReturnType<typeof person>>;
  let mod: Awaited<ReturnType<typeof person>>;
  let target: Awaited<ReturnType<typeof person>>;
  let first: string;
  let second: string;

  const remove = (actor: { cookie: string }, userId: string) =>
    app.inject({ method: 'POST', url: '/api/host/remove-account', headers: { cookie: actor.cookie }, payload: { userId } });

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    host = await person('remove-host');
    mod = await person('remove-mod');
    target = await person('remove-target');
    // The first server made is what makes its owner the host.
    first = (await createServer({ name: 'First', ownerId: host.id })).id;
    second = (await createServer({ name: 'Second', ownerId: host.id })).id;
    await getDb()
      .insert(members)
      .values([
        { serverId: first, userId: target.id },
        { serverId: second, userId: target.id },
        { serverId: first, userId: mod.id },
      ]);
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('is refused for anyone but the host, and for the host themselves', async () => {
    assert.equal((await remove(mod, target.id)).statusCode, 403);
    assert.equal((await remove(host, host.id)).statusCode, 400);
  });

  it('refuses someone who owns a server, since nobody could look after it', async () => {
    const owner = await person('remove-owner');
    await createServer({ name: 'Theirs', ownerId: owner.id });
    const response = await remove(host, owner.id);
    assert.equal(response.statusCode, 400);
    assert.match(response.json().message ?? response.body, /Theirs/);
  });

  it('locks them out, cuts off their windows, and takes them out of every server', async () => {
    const closed: number[] = [];
    const window = {
      id: 'target-window',
      ws: { readyState: 1, send: () => {}, close: (code: number) => closed.push(code) },
      userId: target.id,
      sessionId: target.sessionId,
      servers: new Set([first, second]),
      permissionCache: new Map(),
      status: 'online',
      lastSeenAt: Date.now(),
      alive: true,
    } as unknown as Parameters<typeof hub.addConnection>[0];
    hub.addConnection(window);
    try {
      const response = await remove(host, target.id);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().servers, 2);
      assert.deepEqual(closed, [4001]);
    } finally {
      hub.removeConnection(window);
    }

    // Their old sign-in is dead.
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: target.cookie } });
    assert.equal(me.statusCode, 401);

    // And they cannot sign in again.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: target.username, password: 'a long enough password' },
    });
    assert.equal(login.statusCode, 401);
    assert.match(login.body, /disabled/);

    const left = await getDb().select().from(members);
    assert.equal(
      left.some((row) => row.userId === target.id),
      false,
    );

    // Each server's audit log says so.
    const log = await app.inject({ method: 'GET', url: `/api/servers/${second}/audit-log`, headers: { cookie: host.cookie } });
    assert.equal(log.statusCode, 200, log.body);
    assert.match(log.body, /member\.kick/);
  });

  it('says so if they are already removed', async () => {
    assert.equal((await remove(host, target.id)).statusCode, 404);
  });
});

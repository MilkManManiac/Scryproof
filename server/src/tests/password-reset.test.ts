/**
 * The admin password reset (`resetPassword`) and the lock that follows it.
 *
 * What has to hold: the old password stops working and the temporary one
 * works; every old session dies; until a new password is chosen the account
 * can reach only me, password, logout and context; choosing one lifts the
 * lock. Driven through the real app with `inject`, because the lock lives in
 * an onRequest hook, not in any one route.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-reset-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession, resolveSession, resetPassword, login } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

describe('password reset', () => {
  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('swaps the password, ends every session, and locks the account until a new one is chosen', async () => {
    const user = await registerUser({
      username: 'forgetful',
      displayName: 'Forgetful',
      password: 'the old long password',
      inviteCode: null,
      skipInvite: true,
    });
    const old = await createSession(user, null);

    const { temporaryPassword } = await resetPassword('Forgetful');
    assert.match(temporaryPassword, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    assert.equal(await resolveSession(old.token), null, 'old session survived the reset');
    await assert.rejects(login({ username: 'forgetful', password: 'the old long password' }));
    const outcome = await login({ username: 'forgetful', password: temporaryPassword });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.user.mustChangePassword, true);

    const session = await createSession(outcome.user, null);
    const cookie = `${config.cookieName}=${session.token}`;
    const app = await buildApp();
    try {
      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal(me.statusCode, 200);
      assert.equal(me.json().user.mustChangePassword, true);

      const servers = await app.inject({ method: 'GET', url: '/api/servers', headers: { cookie } });
      assert.equal(servers.statusCode, 403);
      assert.equal(servers.json().code, 'password_change_required');

      const changed = await app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: { cookie },
        payload: { currentPassword: temporaryPassword, newPassword: 'a brand new sentence' },
      });
      assert.equal(changed.statusCode, 200);
      const fresh = new RegExp(`${config.cookieName}=([^;]+)`).exec(String(changed.headers['set-cookie']))?.[1];
      assert.ok(fresh, 'no new cookie after changing the password');

      const after = await app.inject({
        method: 'GET',
        url: '/api/servers',
        headers: { cookie: `${config.cookieName}=${fresh}` },
      });
      assert.equal(after.statusCode, 200);
    } finally {
      await app.close();
    }
  });

  it('turns two-factor off only when asked', async () => {
    await registerUser({ username: 'phoneless', displayName: 'Phoneless', password: 'another long password', inviteCode: null, skipInvite: true });
    const { user } = await resetPassword('phoneless', { clearTotp: true });
    assert.equal(user.username, 'phoneless');
    await assert.rejects(resetPassword('nobody-by-this-name'));
  });
});

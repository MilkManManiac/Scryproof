/**
 * Audit 2026-10-10, phase 11: the first-run account cannot be claimed twice,
 * the signed-out invite preview is rate limited, and a permission mask is a
 * bounded string.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ServerDetail } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-small-items-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

type App = Awaited<ReturnType<typeof buildApp>>;

describe('small server items', () => {
  let app: App;
  let hostCookie = '';

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const register = (username: string, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'x-forwarded-for': ip },
      payload: { username, password: 'a long enough password' },
    });

  it('two registrations racing on a fresh instance make one host, not two', async () => {
    assert.equal(config.registrationRequiresInvite, true, 'this test needs invite-only registration');
    const [first, second] = await Promise.all([register('race-one', '10.1.0.1'), register('race-two', '10.1.0.2')]);
    const statuses = [first.statusCode, second.statusCode].sort();
    assert.deepEqual(statuses, [200, 400], `${first.body} / ${second.body}`);
    const loser = first.statusCode === 400 ? first : second;
    assert.equal(loser.json().code, 'invite_required');
    const winner = first.statusCode === 200 ? first : second;
    hostCookie = winner.headers['set-cookie']!.toString().split(';')[0]!;
  });

  it('a stranger looking up invite codes is cut off after thirty in a minute', async () => {
    const peek = (ip: string) => app.inject({ method: 'GET', url: '/api/invites/not-a-real-code', headers: { 'x-forwarded-for': ip } });
    for (let at = 0; at < 30; at += 1) assert.equal((await peek('10.2.0.9')).statusCode, 400);
    assert.equal((await peek('10.2.0.9')).statusCode, 429);
    assert.equal((await peek('10.2.0.10')).statusCode, 400, 'another address has its own bucket');
  });

  it('a permission mask longer than 32 digits is refused', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: hostCookie }, payload: { name: 'Masks' } });
    assert.equal(made.statusCode, 200, made.body);
    const server = made.json().server as ServerDetail;
    const channelId = server.channels[0]!.id;
    const everyone = server.roles.find((role) => role.id === server.id) ?? server.roles[0]!;
    const put = (allow: string) =>
      app.inject({
        method: 'PUT',
        url: `/api/channels/${channelId}/permissions/${everyone.id}`,
        headers: { cookie: hostCookie },
        payload: { targetType: 'role', allow, deny: '0' },
      });
    assert.equal((await put('1')).statusCode, 200, (await put('1')).body);
    const huge = await put('9'.repeat(40));
    assert.equal(huge.statusCode, 400, huge.body);
  });
});

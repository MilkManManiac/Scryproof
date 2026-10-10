/**
 * Follow-up audit 2026-10-10, phase 7b: the server pings every gateway socket
 * on its own clock, a push topic never pairs two of one person's phones, and
 * the two signed-in password-shaped checks (current password, invite code)
 * are rate limited per person.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

import { GATEWAY_PATH } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-followup-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { attachGateway } = await import('../gateway/index.js');
const { topicFor } = await import('../lib/web-push.js');

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

describe('follow-up audit items', () => {
  let app: App;
  let detach: () => void;
  let port: number;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    // 30 s in production; short here so the test sees one.
    detach = attachGateway(app.server, { pingIntervalMs: 50 });
    port = (app.server.address() as { port: number }).port;
  });

  after(async () => {
    detach();
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('the server pings an open gateway socket on its own clock', async () => {
    const { cookie } = await person('pinged');
    const socket = new WebSocket(`ws://127.0.0.1:${port}${GATEWAY_PATH}`, { headers: { cookie } });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('ping', () => resolve());
        socket.once('error', reject);
        socket.once('close', () => reject(new Error('closed before a ping arrived')));
        setTimeout(() => reject(new Error('no ping within two seconds')), 2000).unref();
      });
    } finally {
      socket.close();
    }
  });

  it('two phones subscribed to the same conversation get different push topics', () => {
    const one = topicFor('conversation-1', 'subscription-a');
    const two = topicFor('conversation-1', 'subscription-b');
    assert.notEqual(one, two);
    for (const topic of [one, two]) {
      assert.equal(topic.length, 32, 'a topic is at most 32 characters');
      assert.match(topic, /^[A-Za-z0-9_-]+$/, 'URL-safe only');
    }
    assert.equal(one, topicFor('conversation-1', 'subscription-a'), 'stable for the same phone');
  });

  it('the eleventh wrong current password in a minute is 429', async () => {
    const { cookie } = await person('guesser');
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: { cookie },
        payload: { currentPassword: 'not it', newPassword: 'another long enough password' },
      });
    for (let at = 1; at <= 10; at += 1) assert.equal((await attempt()).statusCode, 401);
    const eleventh = await attempt();
    assert.equal(eleventh.statusCode, 429, eleventh.body);
  });

  it('the thirty-first invite accept in a minute is 429, and another person has their own bucket', async () => {
    const { cookie } = await person('joiner');
    const accept = (who: string) =>
      app.inject({ method: 'POST', url: '/api/invites/not-a-real-code/accept', headers: { cookie: who } });
    for (let at = 1; at <= 30; at += 1) assert.equal((await accept(cookie)).statusCode, 400);
    const extra = await accept(cookie);
    assert.equal(extra.statusCode, 429, extra.body);
    const other = await person('joiner-two');
    assert.equal((await accept(other.cookie)).statusCode, 400);
  });
});

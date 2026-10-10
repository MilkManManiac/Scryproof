/**
 * Audit 2026-10-10, phase 5: a revoked session loses its socket, the login
 * limiter cannot be dodged with padding, a socket cannot flood the gateway,
 * and uploads have a per-person ceiling.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

import { GATEWAY_PATH, type ServerDetail, type ServerEvent } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-revoke-limits-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { attachments } = await import('../db/schema.js');
const { registerUser, createSession, findUserById } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { attachGateway } = await import('../gateway/index.js');
const { uuidv7 } = await import('../lib/ids.js');
const { UPLOADS_PER_MINUTE } = await import('../routes/attachments.js');

type App = Awaited<ReturnType<typeof buildApp>>;

interface Person {
  id: string;
  cookie: string;
  sessionId: string;
}

const settle = (ms = 300) => new Promise((done) => setTimeout(done, ms));

describe('revoke closes sockets, limiters hold', () => {
  let app: App;
  let detach: () => void;
  let port: number;
  let wes: Person;
  let server: ServerDetail;
  let channelId: string;

  async function person(username: string): Promise<Person> {
    const user = await registerUser({
      username,
      displayName: username,
      password: 'a long enough password',
      inviteCode: null,
      skipInvite: true,
    });
    const session = await createSession(user, null);
    return { id: user.id, cookie: `${config.cookieName}=${session.token}`, sessionId: session.sessionId };
  }

  /** Open a socket and wait for its ready frame. */
  function connect(cookie: string): Promise<WebSocket> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${GATEWAY_PATH}`, { headers: { cookie } });
    return new Promise((resolve, reject) => {
      socket.once('message', () => resolve(socket));
      socket.once('error', reject);
      socket.once('close', () => reject(new Error('closed before ready')));
    });
  }

  function upload(cookie: string, url = `/api/channels/${channelId}/attachments`, name = 'pic.png') {
    const boundary = '----scryproof-limits';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`),
      randomBytes(64),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: 'POST',
      url,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
  }

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    detach = attachGateway(app.server);
    port = (app.server.address() as { port: number }).port;
    wes = await person('limits-wes');
    const created = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie: wes.cookie }, payload: { name: 'Limits' } });
    assert.equal(created.statusCode, 200, created.body);
    server = created.json().server as ServerDetail;
    channelId = server.channels.find((channel) => channel.type === 'text')!.id;
  });

  after(async () => {
    detach();
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('signing out closes that session\'s socket with 4001', async () => {
    const leaver = await person('limits-leaver');
    const socket = await connect(leaver.cookie);
    const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: leaver.cookie } });
    assert.equal(out.statusCode, 200, out.body);
    assert.equal(await closed, 4001);
  });

  it('changing the password closes every other socket and keeps this one', async () => {
    const changer = await person('limits-changer');
    const other = await createSession((await findUserById(changer.id))!, null);
    const mine = await connect(changer.cookie);
    const theirs = await connect(`${config.cookieName}=${other.token}`);
    const theirsClosed = new Promise<number>((resolve) => theirs.once('close', (code) => resolve(code)));
    let mineClosed = false;
    mine.once('close', () => { mineClosed = true; });
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: changer.cookie },
      payload: { currentPassword: 'a long enough password', newPassword: 'another long enough password' },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(await theirsClosed, 4001);
    await settle();
    assert.equal(mineClosed, false, 'the tab that changed the password stays signed in');
    const still = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: changer.cookie } });
    assert.equal(still.statusCode, 200);
    mine.close();
  });

  it('a padded username shares the login bucket with the plain one', async () => {
    await person('padded');
    const attempt = (username: string, ip: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': ip },
        payload: { username, password: 'wrong password entirely' },
      });
    // A different address each time, so only the per-account bucket can fire.
    for (let at = 1; at <= config.rateLimits.loginPerMinute; at += 1) {
      assert.equal((await attempt('padded', `10.9.0.${at}`)).statusCode, 401);
    }
    const dodged = await attempt('  PADDED  ', '10.9.1.1');
    assert.equal(dodged.statusCode, 429, dodged.body);
  });

  it('cuts a socket that floods typing frames', async () => {
    const sender = await connect(wes.cookie);
    const listener = await connect(wes.cookie);
    let heard = 0;
    listener.on('message', (raw) => {
      const event = JSON.parse(raw.toString()) as ServerEvent;
      if (event.t === 'typing_start') heard += 1;
    });
    for (let at = 0; at < 100; at += 1) sender.send(JSON.stringify({ t: 'typing', d: { channelId } }));
    await settle(1500);
    assert.ok(heard > 0, 'typing still works');
    assert.ok(heard <= 60, `only the first window gets through, heard ${heard}`);
    sender.close();
    listener.close();
  });

  it('the eleventh upload in a minute is 429, and a pile of unsent files is 413', async () => {
    for (let at = 1; at <= UPLOADS_PER_MINUTE; at += 1) {
      const ok = await upload(wes.cookie);
      assert.equal(ok.statusCode, 200, ok.body);
    }
    const eleventh = await upload(wes.cookie);
    assert.equal(eleventh.statusCode, 429, eleventh.body);

    const hoarder = await person('limits-hoarder');
    await getDb().insert(attachments).values({
      id: uuidv7(),
      messageId: null,
      uploaderId: hoarder.id,
      storageKey: 'nowhere/pile.bin',
      filename: 'pile.bin',
      contentType: 'application/octet-stream',
      size: 600 * 1024 * 1024,
    });
    // The avatar route shares the guard, and needs no server membership.
    const refused = await upload(hoarder.cookie, '/api/auth/avatar');
    assert.equal(refused.statusCode, 413, refused.body);
    assert.equal(refused.json().code, 'too_much_pending');
  });
});

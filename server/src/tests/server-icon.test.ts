/**
 * A server's picture: uploaded by someone who may manage the server, served to
 * members, and the old one dropped when a new one lands.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-icon-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

/** A 1x1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('server icon', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie = '';
  let serverId = '';

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    const user = await registerUser({
      username: 'painter',
      displayName: 'Painter',
      password: 'a long enough password',
      inviteCode: null,
      skipInvite: true,
    });
    const session = await createSession(user, null);
    cookie = `${config.cookieName}=${session.token}`;
    app = await buildApp();
    const made = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie }, payload: { name: 'Gallery' } });
    assert.equal(made.statusCode, 200, made.body);
    serverId = made.json().server.id as string;
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function upload(type: string, bytes: Buffer) {
    const boundary = '----scryproof-icon';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="icon"\r\nContent-Type: ${type}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: 'POST',
      url: `/api/servers/${serverId}/icon`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
  }

  it('takes a picture, serves it to a member, and drops the old one on the next', async () => {
    const first = await upload('image/png', PNG);
    assert.equal(first.statusCode, 200, first.body);
    const firstUrl = first.json().server.iconUrl as string;
    assert.match(firstUrl, new RegExp(`^/api/server-icons/${serverId}/`));

    const shown = await app.inject({ method: 'GET', url: firstUrl, headers: { cookie } });
    assert.equal(shown.statusCode, 200, shown.body);
    assert.equal(shown.headers['content-type'], 'image/png');
    assert.equal(shown.rawPayload.length, PNG.length);

    const second = await upload('image/gif', Buffer.from('GIF89a'));
    assert.equal(second.statusCode, 200, second.body);
    assert.notEqual(second.json().server.iconUrl, firstUrl);
    const gone = await app.inject({ method: 'GET', url: firstUrl, headers: { cookie } });
    assert.equal(gone.statusCode, 404);

    const removed = await app.inject({ method: 'DELETE', url: `/api/servers/${serverId}/icon`, headers: { cookie } });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(removed.json().server.iconUrl, null);
  });

  it('refuses a file that is not a picture', async () => {
    const bad = await upload('text/plain', Buffer.from('hello'));
    assert.equal(bad.statusCode, 400, bad.body);
    assert.equal(bad.json().code, 'not_an_image');
  });
});

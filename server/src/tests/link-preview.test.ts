/**
 * The YouTube card: this box asks YouTube, the member asks this box. What
 * YouTube "says" is stubbed, so the test has no network and cannot be flaky
 * on a video that gets taken down.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-link-preview-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { buildApp } = await import('../app.js');
const { upstream } = await import('../routes/link-preview.js');

type App = Awaited<ReturnType<typeof buildApp>>;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('/api/link-preview/youtube', () => {
  let app: App;
  let cookie = '';
  let asked: string[] = [];

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    const made = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'linker', password: 'a long enough password' },
    });
    assert.equal(made.statusCode, 200, made.body);
    cookie = made.headers['set-cookie']!.toString().split(';')[0]!;
    upstream.card = async (id) => {
      asked.push(`card:${id}`);
      return id === 'dQw4w9WgXcQ' ? { title: 'Never Gonna Give You Up', author: 'Rick Astley' } : null;
    };
    upstream.thumb = async (id) => {
      asked.push(`thumb:${id}`);
      return id === 'dQw4w9WgXcQ' ? JPEG : null;
    };
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('needs a signed-in member', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/link-preview/youtube/dQw4w9WgXcQ' });
    assert.equal(response.statusCode, 401);
  });

  it('refuses anything that is not an eleven-character id, before asking YouTube', async () => {
    asked = [];
    for (const bad of ['dQw4w9WgXc', 'dQw4w9WgXcQQ', 'dQw4w9Wg%25cQ', 'dQw4w9WgXc.']) {
      const response = await app.inject({ method: 'GET', url: `/api/link-preview/youtube/${bad}`, headers: { cookie } });
      assert.equal(response.statusCode, 400, bad);
    }
    assert.deepEqual(asked, []);
  });

  it('hands back the title, the author and a thumbnail on this box, and asks YouTube once', async () => {
    asked = [];
    const first = await app.inject({ method: 'GET', url: '/api/link-preview/youtube/dQw4w9WgXcQ', headers: { cookie } });
    assert.equal(first.statusCode, 200, first.body);
    assert.deepEqual(first.json(), {
      title: 'Never Gonna Give You Up',
      author: 'Rick Astley',
      thumbnail: '/api/link-preview/youtube/dQw4w9WgXcQ/thumb',
    });
    const second = await app.inject({ method: 'GET', url: '/api/link-preview/youtube/dQw4w9WgXcQ', headers: { cookie } });
    assert.equal(second.statusCode, 200);
    assert.deepEqual(asked, ['card:dQw4w9WgXcQ']);
  });

  it('serves the thumbnail as a sandboxed JPEG', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/link-preview/youtube/dQw4w9WgXcQ/thumb', headers: { cookie } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/jpeg');
    assert.equal(response.headers['content-security-policy'], "default-src 'none'; sandbox");
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.rawPayload.equals(JPEG));
  });

  it('a video YouTube does not know is a 404, not a card', async () => {
    const card = await app.inject({ method: 'GET', url: '/api/link-preview/youtube/AAAAAAAAAAA', headers: { cookie } });
    assert.equal(card.statusCode, 404);
    const thumb = await app.inject({ method: 'GET', url: '/api/link-preview/youtube/AAAAAAAAAAA/thumb', headers: { cookie } });
    assert.equal(thumb.statusCode, 404);
  });
});

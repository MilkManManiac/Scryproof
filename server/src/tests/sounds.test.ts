/**
 * The soundboard's uploads: each sound keeps the volume whoever added it
 * chose, within 0 to 200 percent, and an Ogg clip longer than a sound may be
 * is refused here, not only in the browser.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LIMITS, muxOggOpus } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-sounds-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

/** An Ogg Opus clip this many seconds long. The packets are not real Opus; only the pages are read. */
function oggClip(seconds: number): Buffer {
  const samples = Math.round(seconds * 48000);
  const count = Math.ceil((samples + 312) / 960);
  const packets = Array.from({ length: count }, () => ({ data: new Uint8Array(40), samples: 960 }));
  return Buffer.from(muxOggOpus({ channels: 2, preSkip: 312, inputRate: 48000, packets, totalSamples: samples }));
}

describe('sounds', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie = '';
  let serverId = '';

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    const user = await registerUser({
      username: 'boarder',
      displayName: 'Boarder',
      password: 'a long enough password',
      inviteCode: null,
      skipInvite: true,
    });
    const session = await createSession(user, null);
    cookie = `${config.cookieName}=${session.token}`;
    app = await buildApp();
    const made = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { cookie },
      payload: { name: 'Board' },
    });
    assert.equal(made.statusCode, 200, made.body);
    serverId = made.json().server.id as string;
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** A multipart upload the way `api.sounds.add` sends it: name, volume, then the file. */
  const upload = (file: Buffer, type: string, fields: Record<string, string>) => {
    const boundary = '----scryproof-sounds';
    const parts = Object.entries(fields).map(
      ([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    );
    const payload = Buffer.concat([
      Buffer.from(parts.join('')),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
      method: 'POST',
      url: `/api/servers/${serverId}/sounds`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
  };

  it('keeps the volume it was added at', async () => {
    const added = await upload(oggClip(10), 'audio/ogg', { name: 'Horn', volume: '150' });
    assert.equal(added.statusCode, 200, added.body);
    assert.equal(added.json().sound.volume, 150);

    const listed = await app.inject({ method: 'GET', url: `/api/servers/${serverId}/sounds`, headers: { cookie } });
    assert.equal(listed.json().sounds[0].volume, 150);
  });

  it('stores the bytes it was sent, unchanged by measuring them', async () => {
    const clip = oggClip(3);
    const added = await upload(clip, 'audio/ogg', { name: 'Exact', volume: '100' });
    assert.equal(added.statusCode, 200, added.body);
    const fetched = await app.inject({ method: 'GET', url: added.json().sound.url, headers: { cookie } });
    assert.equal(fetched.statusCode, 200);
    assert.ok(fetched.rawPayload.equals(clip), 'the stored clip differs from the upload');
  });

  it('plays at full volume when none is given', async () => {
    const added = await upload(Buffer.from('ID3 not really an mp3 but the server does not decode it'), 'audio/mpeg', {
      name: 'Old way',
    });
    assert.equal(added.statusCode, 200, added.body);
    assert.equal(added.json().sound.volume, LIMITS.soundVolume.default);
  });

  it('refuses a volume outside 0 to 200, or not a whole number', async () => {
    for (const volume of ['201', '-1', '50.5', 'loud']) {
      const refused = await upload(oggClip(2), 'audio/ogg', { name: 'Bad', volume });
      assert.equal(refused.statusCode, 400, `${volume}: ${refused.body}`);
      assert.equal(refused.json().code, 'invalid_sound_volume');
    }
  });

  it('refuses an Ogg clip longer than a sound may be, and one it cannot read', async () => {
    const long = await upload(oggClip(LIMITS.soundSeconds + 1), 'audio/ogg', { name: 'Song', volume: '100' });
    assert.equal(long.statusCode, 400);
    assert.equal(long.json().code, 'sound_too_long');

    const exact = await upload(oggClip(LIMITS.soundSeconds), 'audio/ogg', { name: 'Just fits', volume: '100' });
    assert.equal(exact.statusCode, 200, exact.body);

    const junk = await upload(Buffer.from('OggS but nothing after it'), 'audio/ogg', { name: 'Junk', volume: '100' });
    assert.equal(junk.statusCode, 400);
    assert.equal(junk.json().code, 'not_a_sound');
  });

  it('lets a manager change the volume later, within the same range', async () => {
    const listed = await app.inject({ method: 'GET', url: `/api/servers/${serverId}/sounds`, headers: { cookie } });
    const soundId = listed.json().sounds[0].id as string;
    const url = `/api/servers/${serverId}/sounds/${soundId}`;

    const quieter = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload: { volume: 40 } });
    assert.equal(quieter.statusCode, 200, quieter.body);
    assert.equal(quieter.json().sound.volume, 40);
    assert.equal(quieter.json().sound.name, 'Horn', 'a volume change leaves the name alone');

    const tooLoud = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload: { volume: 250 } });
    assert.equal(tooLoud.statusCode, 400);
    assert.equal(tooLoud.json().code, 'invalid_sound_volume');

    const nothing = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload: {} });
    assert.equal(nothing.statusCode, 400);

    const renamed = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload: { name: 'Big horn' } });
    assert.equal(renamed.json().sound.volume, 40, 'a rename leaves the volume alone');
  });
});

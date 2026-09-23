/**
 * The house rule is the sender's client's job, but the server applies it
 * again to what it can read, for an old client or a request made by hand:
 * channel text, sent and edited, and the names it hands out.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-house-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');

describe('house rule on the server', () => {
  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('holds for channel text sent and edited, and for names', async () => {
    const user = await registerUser({
      username: 'baller',
      displayName: 'Big Baller',
      password: 'a long enough password',
      inviteCode: null,
      skipInvite: true,
    });
    const session = await createSession(user, null);
    const cookie = `${config.cookieName}=${session.token}`;
    const app = await buildApp();
    try {
      const made = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie }, payload: { name: 'Room' } });
      const server = made.json().server as { id: string; channels: { id: string; type: string }[] };
      const channel = server.channels.find((entry) => entry.type === 'text')!;

      const sent = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/messages`,
        headers: { cookie },
        payload: { content: 'call me b1g b4ll3r' },
      });
      assert.equal(sent.statusCode, 200);
      const message = sent.json().message as { id: string; content: string };
      assert.equal(message.content, "call me I'm an idiot");

      const edited = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${message.id}`,
        headers: { cookie },
        payload: { content: 'no really, bigballa' },
      });
      assert.equal(edited.statusCode, 200);
      assert.equal((edited.json().message as { content: string }).content, "no really, I'm an idiot");

      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal((me.json().user as { displayName: string }).displayName, "I'm an idiot");
    } finally {
      await app.close();
    }
  });
});

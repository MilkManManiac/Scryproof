/**
 * "Again" on a character's jump plays it for everyone looking, not only the
 * one who clicked. What has to hold: a jump goes out to the channel as a
 * `spawn_replay` carrying its text; anything that is not a jump is refused;
 * and it stores nothing.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ServerEvent } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-replay-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { messages } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const hub = await import('../gateway/hub.js');

function listen(userId: string, serverId: string): ServerEvent[] {
  const inbox: ServerEvent[] = [];
  hub.addConnection({
    id: `listener-${userId}`,
    ws: { readyState: 1, send: (raw: string) => inbox.push(JSON.parse(raw) as ServerEvent) },
    userId,
    sessionId: 's',
    servers: new Set([serverId]),
    permissionCache: new Map(),
    status: 'online',
    lastSeenAt: Date.now(),
    alive: true,
  } as unknown as Parameters<typeof hub.addConnection>[0]);
  return inbox;
}

describe('jump again', () => {
  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('sends a jump to everyone in the channel, and refuses anything else', async () => {
    const user = await registerUser({
      username: 'jumper',
      displayName: 'Jumper',
      password: 'a long enough password',
      inviteCode: null,
      skipInvite: true,
    });
    const session = await createSession(user, null);
    const cookie = `${config.cookieName}=${session.token}`;
    const app = await buildApp();
    try {
      const made = await app.inject({ method: 'POST', url: '/api/servers', headers: { cookie }, payload: { name: 'Room' } });
      assert.equal(made.statusCode, 200);
      const server = made.json().server as { id: string; channels: { id: string; type: string }[] };
      const channel = server.channels.find((entry) => entry.type === 'text');
      assert.ok(channel, 'a new server has a text channel');

      const send = async (content: string) => {
        const sent = await app.inject({
          method: 'POST',
          url: `/api/channels/${channel.id}/messages`,
          headers: { cookie },
          payload: { content },
        });
        assert.equal(sent.statusCode, 200, sent.body);
        return sent.json().message.id as string;
      };
      const jump = await send('/tang-jump');
      const plain = await send('just talking');
      const before = (await getDb().select().from(messages)).length;

      const inbox = listen(user.id, server.id);
      const replay = await app.inject({ method: 'POST', url: `/api/messages/${jump}/replay`, headers: { cookie } });
      assert.equal(replay.statusCode, 200, replay.body);
      const event = inbox.find((entry) => entry.t === 'spawn_replay');
      assert.ok(event && event.t === 'spawn_replay', 'no spawn_replay went out');
      assert.deepEqual(event.d, { messageId: jump, channelId: channel.id, content: '/tang-jump' });

      const refused = await app.inject({ method: 'POST', url: `/api/messages/${plain}/replay`, headers: { cookie } });
      assert.equal(refused.statusCode, 400);
      assert.equal(refused.json().code, 'not_a_jump');

      assert.equal((await getDb().select().from(messages)).length, before, 'a replay stored a message');
    } finally {
      await app.close();
    }
  });
});

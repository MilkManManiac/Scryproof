/**
 * Channels whose messages do not last: the sweep in `services/message-expiry.ts`.
 * A real (PGlite) database, like the upload sweep's test, because what is
 * under test is a delete plus the file it takes with it.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-expiry-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { attachments, bookmarks, channels, messages, reactions, servers, users } = await import('../db/schema.js');
const { uuidv7 } = await import('../lib/ids.js');
const { buildStorageKey, ensureStorageReady, saveStream } = await import('../services/storage.js');
const { expireMessages } = await import('../services/message-expiry.js');
const { config } = await import('../config.js');
const { eq } = await import('drizzle-orm');

const NOW = new Date('2026-03-01T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe('expireMessages', () => {
  let userId: string;
  let serverId: string;

  async function channel(expireAfterSeconds: number): Promise<string> {
    const id = uuidv7();
    await getDb().insert(channels).values({ id, serverId, name: `c-${id.slice(-6)}`, expireAfterSeconds });
    return id;
  }

  async function message(channelId: string, age: number): Promise<string> {
    const id = uuidv7();
    await getDb().insert(messages).values({ id, channelId, authorId: userId, content: 'hi', createdAt: daysAgo(age) });
    return id;
  }

  const exists = async (id: string) =>
    (await getDb().select({ id: messages.id }).from(messages).where(eq(messages.id, id))).length === 1;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    await ensureStorageReady();
    userId = uuidv7();
    await getDb().insert(users).values({ id: userId, username: 'keeper', displayName: 'Keeper', passwordHash: 'x' });
    serverId = uuidv7();
    await getDb().insert(servers).values({ id: serverId, name: 'Test', ownerId: userId });
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('deletes what is past the lifetime, row and file, and keeps the rest', async () => {
    const db = getDb();
    const weekly = await channel(7 * 86_400);
    const old = await message(weekly, 8);
    const fresh = await message(weekly, 2);

    const key = buildStorageKey('map.png');
    await saveStream(key, Readable.from([Buffer.from('bytes')]));
    await db.insert(attachments).values({
      id: uuidv7(),
      messageId: old,
      uploaderId: userId,
      storageKey: key,
      filename: 'map.png',
      contentType: 'image/png',
      size: 5,
    });
    await db.insert(reactions).values({ messageId: old, userId, emoji: '👍' });
    await db.insert(bookmarks).values({ messageId: old, userId });
    await db.update(messages).set({ pinnedAt: NOW }).where(eq(messages.id, old));

    assert.equal(await expireMessages(NOW), 1);
    assert.equal(await exists(old), false, 'pinned or not, it goes');
    assert.equal(await exists(fresh), true);
    assert.equal(existsSync(join(config.storage.localPath, key)), false, 'the file goes with it');
    assert.equal((await db.select().from(attachments).where(eq(attachments.messageId, old))).length, 0);
    assert.equal((await db.select().from(reactions).where(eq(reactions.messageId, old))).length, 0);
    assert.equal((await db.select().from(bookmarks).where(eq(bookmarks.messageId, old))).length, 0);
  });

  it('leaves a channel that keeps everything alone', async () => {
    const forever = await channel(0);
    const ancient = await message(forever, 3650);
    await expireMessages(NOW);
    assert.equal(await exists(ancient), true);
  });

  it('forgets the newest message once it is gone, so the channel is not stuck unread', async () => {
    const db = getDb();
    const daily = await channel(86_400);
    const last = await message(daily, 2);
    await db.update(channels).set({ lastMessageId: last }).where(eq(channels.id, daily));

    await expireMessages(NOW);
    const [row] = await db.select().from(channels).where(eq(channels.id, daily));
    assert.equal(row?.lastMessageId, null);
  });
});

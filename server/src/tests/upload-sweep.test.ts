/**
 * The unclaimed-upload sweep.
 *
 * Needs a real database, unlike the rest of this directory, because the
 * thing under test is a query plus a storage side effect, not a pure
 * function. PGlite gives us that without a Postgres install: a fresh,
 * throwaway data directory per run, migrated the same way the real server
 * migrates itself, torn down afterwards.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

// The data directory has to exist before `config.ts` is first imported,
// because it resolves paths off DATA_DIR at module load time. Everything
// below is dynamic so this line runs first.
const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-upload-sweep-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { getDb } = await import('../db/index.js');
const { attachments, channels, messages, servers, users } = await import('../db/schema.js');
const { uuidv7 } = await import('../lib/ids.js');
const { buildStorageKey, ensureStorageReady, saveStream } = await import('../services/storage.js');
const { sweepUnclaimedUploads } = await import('../services/upload-sweep.js');
const { config } = await import('../config.js');
const { eq } = await import('drizzle-orm');

const NOW = new Date('2026-01-10T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

async function putFile(name: string): Promise<string> {
  const key = buildStorageKey(name);
  await saveStream(key, Readable.from([Buffer.from('test bytes')]));
  return key;
}

function pathFor(key: string): string {
  return join(config.storage.localPath, key);
}

describe('sweepUnclaimedUploads', () => {
  let userId: string;
  let serverId: string;
  let channelId: string;
  let claimedMessageId: string;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    await ensureStorageReady();

    const db = getDb();

    userId = uuidv7();
    await db.insert(users).values({
      id: userId,
      username: 'sweeper',
      displayName: 'Sweeper',
      passwordHash: 'not-a-real-hash',
    });

    serverId = uuidv7();
    await db.insert(servers).values({ id: serverId, name: 'Test server', ownerId: userId });

    channelId = uuidv7();
    await db.insert(channels).values({ id: channelId, serverId, name: 'general' });

    claimedMessageId = uuidv7();
    await db.insert(messages).values({
      id: claimedMessageId,
      channelId,
      authorId: userId,
      content: 'a message with an attachment',
    });
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('removes only the unclaimed attachment past the grace period', async () => {
    const db = getDb();

    const oldUnclaimedKey = await putFile('old-unclaimed.txt');
    const oldUnclaimedId = uuidv7();
    await db.insert(attachments).values({
      id: oldUnclaimedId,
      messageId: null,
      uploaderId: userId,
      storageKey: oldUnclaimedKey,
      filename: 'old-unclaimed.txt',
      contentType: 'text/plain',
      size: 10,
      createdAt: hoursAgo(25),
    });

    const freshUnclaimedKey = await putFile('fresh-unclaimed.txt');
    const freshUnclaimedId = uuidv7();
    await db.insert(attachments).values({
      id: freshUnclaimedId,
      messageId: null,
      uploaderId: userId,
      storageKey: freshUnclaimedKey,
      filename: 'fresh-unclaimed.txt',
      contentType: 'text/plain',
      size: 10,
      createdAt: hoursAgo(1),
    });

    const oldClaimedKey = await putFile('old-claimed.txt');
    const oldClaimedId = uuidv7();
    await db.insert(attachments).values({
      id: oldClaimedId,
      messageId: claimedMessageId,
      uploaderId: userId,
      storageKey: oldClaimedKey,
      filename: 'old-claimed.txt',
      contentType: 'text/plain',
      size: 10,
      createdAt: hoursAgo(25),
    });

    const removed = await sweepUnclaimedUploads(NOW);
    assert.equal(removed, 1);

    const remaining = await db.select({ id: attachments.id }).from(attachments);
    const remainingIds = remaining.map((row) => row.id).sort();
    assert.deepEqual(remainingIds, [freshUnclaimedId, oldClaimedId].sort());

    const [deletedRow] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, oldUnclaimedId));
    assert.equal(deletedRow, undefined);

    assert.equal(existsSync(pathFor(oldUnclaimedKey)), false);
    assert.equal(existsSync(pathFor(freshUnclaimedKey)), true);
    assert.equal(existsSync(pathFor(oldClaimedKey)), true);
  });

  it('is a no-op, and returns 0, when nothing is stale', async () => {
    const removed = await sweepUnclaimedUploads(NOW);
    assert.equal(removed, 0);
  });
});

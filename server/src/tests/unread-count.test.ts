/**
 * The number beside a channel in the sidebar: messages from other people after
 * the last one read, stopped at the cap, never counting the reader's own words
 * or anyone they have blocked, and never given for a channel not yet opened.
 * Needs a real database, like bookmarks.test.ts.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-unread-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { blocks, channels, messages, servers, users } = await import('../db/schema.js');
const { uuidv7 } = await import('../lib/ids.js');
const { bumpMentions, markRead, readStatesFor } = await import('../services/read-state.js');
const { UNREAD_COUNT_CAP } = await import('@scryproof/shared');

describe('unread counts', () => {
  let readerId: string;
  let friendId: string;
  let pestId: string;
  let busyChannelId: string;
  let quietChannelId: string;
  let neverOpenedChannelId: string;
  let firstQuietId: string;
  const visible = () => new Set([busyChannelId, quietChannelId, neverOpenedChannelId]);

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    const db = getDb();

    readerId = uuidv7();
    friendId = uuidv7();
    pestId = uuidv7();
    await db.insert(users).values([
      { id: readerId, username: 'reader', displayName: 'Reader', passwordHash: 'x' },
      { id: friendId, username: 'friend', displayName: 'Friend', passwordHash: 'x' },
      { id: pestId, username: 'pest', displayName: 'Pest', passwordHash: 'x' },
    ]);
    await db.insert(blocks).values({ userId: readerId, blockedId: pestId });

    const serverId = uuidv7();
    await db.insert(servers).values({ id: serverId, name: 'Home', ownerId: friendId });
    busyChannelId = uuidv7();
    quietChannelId = uuidv7();
    neverOpenedChannelId = uuidv7();
    await db.insert(channels).values([
      { id: busyChannelId, serverId, name: 'busy' },
      { id: quietChannelId, serverId, name: 'quiet' },
      { id: neverOpenedChannelId, serverId, name: 'never' },
    ]);

    // Quiet: read up to the first message, then two from a friend, one from
    // the reader on another device, and one from somebody blocked.
    firstQuietId = uuidv7();
    await db.insert(messages).values({ id: firstQuietId, channelId: quietChannelId, authorId: friendId, content: 'hi' });
    await markRead(readerId, quietChannelId, firstQuietId);
    for (const authorId of [friendId, friendId, readerId, pestId]) {
      await db.insert(messages).values({ id: uuidv7(), channelId: quietChannelId, authorId, content: 'more' });
    }

    // Busy: read the first, then far more than the cap.
    const firstBusyId = uuidv7();
    await db.insert(messages).values({ id: firstBusyId, channelId: busyChannelId, authorId: friendId, content: 'hi' });
    await markRead(readerId, busyChannelId, firstBusyId);
    const flood = Array.from({ length: UNREAD_COUNT_CAP + 20 }, () => ({
      id: uuidv7(),
      channelId: busyChannelId,
      authorId: friendId,
      content: 'spam',
    }));
    await db.insert(messages).values(flood);

    // Never opened, but mentioned once: a badge, no number.
    await db.insert(messages).values({ id: uuidv7(), channelId: neverOpenedChannelId, authorId: friendId, content: 'hey' });
    await bumpMentions([readerId], neverOpenedChannelId, friendId);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('counts other people, not the reader and not anyone they blocked', async () => {
    const states = await readStatesFor(readerId, visible());
    assert.equal(states.find((state) => state.channelId === quietChannelId)?.unreadCount, 2);
  });

  it('stops counting at the cap', async () => {
    const states = await readStatesFor(readerId, visible());
    assert.equal(states.find((state) => state.channelId === busyChannelId)?.unreadCount, UNREAD_COUNT_CAP);
  });

  it('gives no number for a channel never opened', async () => {
    const states = await readStatesFor(readerId, visible());
    const never = states.find((state) => state.channelId === neverOpenedChannelId);
    assert.ok(never);
    assert.equal(never.unreadCount, undefined);
    assert.equal(never.mentionCount, 1);
  });

  it('gives nothing at all for a channel the reader can no longer see', async () => {
    const states = await readStatesFor(readerId, new Set([quietChannelId]));
    assert.deepEqual(states.map((state) => state.channelId), [quietChannelId]);
    assert.deepEqual(await readStatesFor(readerId, new Set()), []);
  });

  it('does not count a message that was deleted', async () => {
    const db = getDb();
    const { eq } = await import('drizzle-orm');
    const goneId = uuidv7();
    await db.insert(messages).values({ id: goneId, channelId: quietChannelId, authorId: friendId, content: 'oops' });
    const count = async () =>
      (await readStatesFor(readerId, visible())).find((state) => state.channelId === quietChannelId)?.unreadCount;
    assert.equal(await count(), 3);
    await db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, goneId));
    assert.equal(await count(), 2);
  });

  it('reading to the end brings the count to zero', async () => {
    const db = getDb();
    const last = uuidv7();
    await db.insert(messages).values({ id: last, channelId: quietChannelId, authorId: friendId, content: 'last' });
    const state = await markRead(readerId, quietChannelId, last);
    assert.equal(state.unreadCount, 0);
  });

  it('reading from a device that is behind keeps the count of what is still below', async () => {
    // The quiet channel is read to its end above; a stale device asking to
    // mark the first message read neither moves the line back nor invents
    // unread messages.
    const state = await markRead(readerId, quietChannelId, firstQuietId);
    assert.equal(state.unreadCount, 0);
  });
});

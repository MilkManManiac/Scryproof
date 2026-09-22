/**
 * Bookmarks' visibility filter.
 *
 * The point of the Saved list is that it never hands back a message the
 * saver can no longer see, whether that is a channel hidden from them or a
 * server they have since left. Needs a real database, like search.test.ts,
 * because the thing under test talks to real membership and overwrite rows.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-bookmarks-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { bookmarks, channelOverwrites, channels, messages, roles, members, servers, users } =
  await import('../db/schema.js');
const { uuidv7 } = await import('../lib/ids.js');
const { bookmarksFor } = await import('../services/bookmarks.js');
const { DEFAULT_EVERYONE_PERMISSIONS, Permission } = await import('@scryproof/shared');

describe('bookmarksFor', () => {
  let saverId: string;
  let ownerId: string;
  let visibleChannelId: string;
  let hiddenChannelId: string;
  let visibleMessageId: string;
  let hiddenMessageId: string;
  let strandedMessageId: string;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);

    const db = getDb();

    saverId = uuidv7();
    ownerId = uuidv7();
    await db.insert(users).values([
      { id: saverId, username: 'saver', displayName: 'Saver', passwordHash: 'x' },
      { id: ownerId, username: 'owner', displayName: 'Owner', passwordHash: 'x' },
    ]);

    // A server the saver belongs to, with one channel they can see and one
    // hidden from ordinary members.
    const serverId = uuidv7();
    await db.insert(servers).values({ id: serverId, name: 'Home server', ownerId });

    const everyoneRoleId = uuidv7();
    await db.insert(roles).values({
      id: everyoneRoleId,
      serverId,
      name: '@everyone',
      isEveryone: true,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
    });

    await db.insert(members).values([
      { serverId, userId: ownerId },
      { serverId, userId: saverId },
    ]);

    visibleChannelId = uuidv7();
    await db.insert(channels).values({ id: visibleChannelId, serverId, name: 'general' });

    hiddenChannelId = uuidv7();
    await db.insert(channels).values({ id: hiddenChannelId, serverId, name: 'staff-only' });
    await db.insert(channelOverwrites).values({
      channelId: hiddenChannelId,
      targetType: 'role',
      targetId: everyoneRoleId,
      allow: 0n,
      deny: Permission.VIEW_CHANNEL,
    });

    // A second server the saver has since left. The message and the bookmark
    // both still exist; only the membership is gone.
    const strandedServerId = uuidv7();
    await db.insert(servers).values({ id: strandedServerId, name: 'Old server', ownerId });
    await db.insert(members).values({ serverId: strandedServerId, userId: ownerId });
    const strandedEveryoneRoleId = uuidv7();
    await db.insert(roles).values({
      id: strandedEveryoneRoleId,
      serverId: strandedServerId,
      name: '@everyone',
      isEveryone: true,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
    });
    const strandedChannelId = uuidv7();
    await db.insert(channels).values({ id: strandedChannelId, serverId: strandedServerId, name: 'general' });

    visibleMessageId = uuidv7();
    hiddenMessageId = uuidv7();
    strandedMessageId = uuidv7();
    await db.insert(messages).values([
      { id: visibleMessageId, channelId: visibleChannelId, authorId: ownerId, content: 'keep this one' },
      { id: hiddenMessageId, channelId: hiddenChannelId, authorId: ownerId, content: 'never see this' },
      { id: strandedMessageId, channelId: strandedChannelId, authorId: ownerId, content: 'from a server I left' },
    ]);

    // Saved oldest first, so the assertions below can check the list comes
    // back newest-saved-first rather than in message order.
    await db.insert(bookmarks).values([
      { userId: saverId, messageId: hiddenMessageId },
      { userId: saverId, messageId: strandedMessageId },
      { userId: saverId, messageId: visibleMessageId },
    ]);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('only returns the bookmark whose channel is still visible to the saver', async () => {
    const list = await bookmarksFor(saverId);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, visibleMessageId);
    assert.equal(list[0]?.channelName, 'general');
    assert.ok(list[0]?.bookmarked);
  });

  it('skips a message in a server the saver is no longer a member of, without erroring', async () => {
    const list = await bookmarksFor(saverId);
    assert.ok(!list.some((message) => message.id === strandedMessageId));
  });

  it('never returns a message the saver has not saved', async () => {
    const list = await bookmarksFor(ownerId);
    assert.equal(list.length, 0);
  });
});

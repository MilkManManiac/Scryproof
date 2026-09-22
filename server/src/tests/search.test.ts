/**
 * Message search's channel filter.
 *
 * This is the whole point of search: a result must never come from a channel
 * the caller cannot open. Needs a real database, like upload-sweep.test.ts,
 * because the thing under test is `computePermissionsForServerChannels`
 * talking to real overwrite rows, not a pure function.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-search-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { channelOverwrites, channels, messages, roles, members, servers, users } = await import(
  '../db/schema.js'
);
const { uuidv7 } = await import('../lib/ids.js');
const { loadMemberContext } = await import('../services/permissions.js');
const { searchMessages } = await import('../services/search.js');
const { DEFAULT_EVERYONE_PERMISSIONS, Permission } = await import('@scryproof/shared');

describe('searchMessages', () => {
  let ownerId: string;
  let searcherId: string;
  let serverId: string;
  let everyoneRoleId: string;
  let openChannelId: string;
  let hiddenChannelId: string;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);

    const db = getDb();

    ownerId = uuidv7();
    searcherId = uuidv7();
    await db.insert(users).values([
      { id: ownerId, username: 'owner', displayName: 'Owner', passwordHash: 'x' },
      { id: searcherId, username: 'searcher', displayName: 'Searcher', passwordHash: 'x' },
    ]);

    serverId = uuidv7();
    await db.insert(servers).values({ id: serverId, name: 'Test server', ownerId });

    everyoneRoleId = uuidv7();
    await db.insert(roles).values({
      id: everyoneRoleId,
      serverId,
      name: '@everyone',
      isEveryone: true,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
    });

    // The owner is already a member by convention elsewhere in the app; add
    // both rows directly since this test only exercises search.
    await db.insert(members).values([
      { serverId, userId: ownerId },
      { serverId, userId: searcherId },
    ]);

    openChannelId = uuidv7();
    await db.insert(channels).values({ id: openChannelId, serverId, name: 'general' });

    hiddenChannelId = uuidv7();
    await db.insert(channels).values({ id: hiddenChannelId, serverId, name: 'secret' });
    // @everyone cannot even see this channel, so an ordinary member's view
    // never includes it, no matter what its messages say.
    await db.insert(channelOverwrites).values({
      channelId: hiddenChannelId,
      targetType: 'role',
      targetId: everyoneRoleId,
      allow: 0n,
      deny: Permission.VIEW_CHANNEL,
    });

    await db.insert(messages).values([
      { id: uuidv7(), channelId: openChannelId, authorId: ownerId, content: 'the launch codes are hidden here' },
      { id: uuidv7(), channelId: hiddenChannelId, authorId: ownerId, content: 'the launch codes are also here' },
    ]);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('never returns a message from a channel the searcher cannot view', async () => {
    const ctx = await loadMemberContext(serverId, searcherId);
    assert.ok(ctx);

    const rows = await searchMessages(ctx, 'launch codes');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.channelId, openChannelId);
  });

  it('returns the same message from both channels for the owner, who can see everything', async () => {
    const ctx = await loadMemberContext(serverId, ownerId);
    assert.ok(ctx);

    const rows = await searchMessages(ctx, 'launch codes');
    const channelIds = rows.map((row) => row.channelId).sort();
    assert.deepEqual(channelIds, [openChannelId, hiddenChannelId].sort());
  });

  it('requires every word to match', async () => {
    const ctx = await loadMemberContext(serverId, ownerId);
    assert.ok(ctx);

    const rows = await searchMessages(ctx, 'launch nonexistentword');
    assert.equal(rows.length, 0);
  });
});

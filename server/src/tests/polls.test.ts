/**
 * `/poll` parsing, plus a vote round-trip.
 *
 * Parsing is pure, like dice.test.ts. The vote round-trip needs a real
 * database, like search.test.ts and upload-sweep.test.ts, because the thing
 * under test is `poll_votes` rows and the primary key that makes voting
 * twice harmless, not a pure function.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parsePollCommand } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-polls-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { channels, messages, servers, users } = await import('../db/schema.js');
const { uuidv7 } = await import('../lib/ids.js');
const { setVotes, tallyForMessages } = await import('../services/polls.js');
type PollBody = import('../db/schema.js').PollBody;

describe('parsePollCommand', () => {
  it('reads a question and its choices', () => {
    const result = parsePollCommand('/poll Which night? | Friday | Saturday | Sunday');
    assert.equal(result?.ok, true);
    if (!result || !result.ok) return;
    assert.equal(result.poll.question, 'Which night?');
    assert.deepEqual(result.poll.options, ['Friday', 'Saturday', 'Sunday']);
    assert.equal(result.poll.multiple, false);
  });

  it('reads the star as multiple choice', () => {
    const result = parsePollCommand('/poll* Which snacks? | Chips | Pretzels');
    assert.equal(result?.ok, true);
    if (!result || !result.ok) return;
    assert.equal(result.poll.multiple, true);
    assert.equal(result.poll.secret, false);
  });

  it('reads the tilde as secret, alone or with the star in either order', () => {
    for (const [line, multiple] of [
      ['/poll~ Who wins? | Red | Blue', false],
      ['/poll*~ Who wins? | Red | Blue', true],
      ['/poll~* Who wins? | Red | Blue', true],
    ] as const) {
      const result = parsePollCommand(line);
      assert.equal(result?.ok, true, line);
      if (!result || !result.ok) return;
      assert.equal(result.poll.secret, true, line);
      assert.equal(result.poll.multiple, multiple, line);
    }
    const plain = parsePollCommand('/poll Who wins? | Red | Blue');
    assert.equal(plain?.ok && plain.poll.secret, false);
  });

  it('is null for anything that is not a /poll line', () => {
    assert.equal(parsePollCommand('just talking about a poll'), null);
    assert.equal(parsePollCommand('/pollute the water'), null);
  });

  it('refuses fewer than two choices', () => {
    const result = parsePollCommand('/poll Which night? | Friday');
    assert.deepEqual(result, {
      ok: false,
      error: 'A poll needs a question and at least two choices, separated by |.',
    });
  });

  it('refuses more than ten choices', () => {
    const options = Array.from({ length: 11 }, (_, index) => `Option ${index}`).join(' | ');
    const result = parsePollCommand(`/poll Pick one | ${options}`);
    assert.equal(result?.ok, false);
  });

  it('refuses an empty question', () => {
    const result = parsePollCommand('/poll  | Friday | Saturday');
    assert.equal(result?.ok, false);
  });

  it('refuses a choice over 80 characters', () => {
    const long = 'x'.repeat(81);
    const result = parsePollCommand(`/poll Pick one | ${long} | Saturday`);
    assert.equal(result?.ok, false);
  });
});

/** Made before `visibility` existed: no field stored, so anonymous for good. */
const legacyPoll: PollBody = { question: 'Which night?', options: ['Friday', 'Saturday', 'Sunday'], multiple: false, closedAt: null };

describe('poll votes', () => {
  let userId: string;
  let otherId: string;
  let channelId: string;
  let messageId: string;

  /** A fresh poll message with this body, so each case starts from no votes. */
  async function makePoll(poll: PollBody): Promise<string> {
    const id = uuidv7();
    await getDb().insert(messages).values({ id, channelId, authorId: userId, content: poll.question, kind: 'poll', poll });
    return id;
  }

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);

    const db = getDb();

    userId = uuidv7();
    otherId = uuidv7();
    await db.insert(users).values([
      { id: userId, username: 'voter', displayName: 'Voter', passwordHash: 'x' },
      { id: otherId, username: 'other', displayName: 'Other', passwordHash: 'x' },
    ]);

    const serverId = uuidv7();
    await db.insert(servers).values({ id: serverId, name: 'Test server', ownerId: userId });

    channelId = uuidv7();
    await db.insert(channels).values({ id: channelId, serverId, name: 'general' });

    messageId = await makePoll(legacyPoll);
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('counts a vote and reports it back as the voter\'s own pick', async () => {
    await setVotes(messageId, userId, [1]);

    const tallies = await tallyForMessages([{ messageId, poll: legacyPoll }], userId);
    const tally = tallies.get(messageId);
    assert.deepEqual(tally?.counts, [0, 1, 0]);
    assert.deepEqual(tally?.mine, [1]);
  });

  it('does not show one voter\'s pick as another voter\'s', async () => {
    await setVotes(messageId, otherId, [0]);

    const tallies = await tallyForMessages([{ messageId, poll: legacyPoll }], userId);
    const tally = tallies.get(messageId);
    assert.deepEqual(tally?.counts, [1, 1, 0]);
    assert.deepEqual(tally?.mine, [1]);
  });

  it('replaces rather than adds when voting again', async () => {
    await setVotes(messageId, userId, [2]);

    const tallies = await tallyForMessages([{ messageId, poll: legacyPoll }], userId);
    const tally = tallies.get(messageId);
    assert.deepEqual(tally?.counts, [1, 0, 1]);
    assert.deepEqual(tally?.mine, [2]);
  });

  it('clears a vote with an empty list', async () => {
    await setVotes(messageId, userId, []);

    const tallies = await tallyForMessages([{ messageId, poll: legacyPoll }], userId);
    const tally = tallies.get(messageId);
    assert.deepEqual(tally?.counts, [1, 0, 0]);
    assert.deepEqual(tally?.mine, []);
  });

  it('keeps a poll made before voters were shown anonymous', async () => {
    const tally = (await tallyForMessages([{ messageId, poll: legacyPoll }], userId)).get(messageId);
    assert.equal(tally?.visibility, 'anonymous');
    assert.equal(tally?.voters, undefined);
  });

  it('says who picked what on a shown poll', async () => {
    const poll: PollBody = { ...legacyPoll, visibility: 'shown' };
    const id = await makePoll(poll);
    await setVotes(id, userId, [1]);
    await setVotes(id, otherId, [0]);

    const tally = (await tallyForMessages([{ messageId: id, poll }], userId)).get(id);
    assert.equal(tally?.visibility, 'shown');
    assert.deepEqual(tally?.counts, [1, 1, 0]);
    assert.deepEqual(tally?.voters, [[otherId], [userId], []]);
    assert.deepEqual(tally?.mine, [1]);
  });

  it('hides a secret poll until it closes, then gives counts but never names', async () => {
    const open: PollBody = { ...legacyPoll, visibility: 'secret' };
    const id = await makePoll(open);
    await setVotes(id, userId, [2]);
    await setVotes(id, otherId, [0]);

    const during = (await tallyForMessages([{ messageId: id, poll: open }], userId)).get(id);
    assert.equal(during?.counts, null);
    assert.equal(during?.voters, undefined);
    // The voter still sees their own pick.
    assert.deepEqual(during?.mine, [2]);

    const closed: PollBody = { ...open, closedAt: new Date().toISOString() };
    const after = (await tallyForMessages([{ messageId: id, poll: closed }], userId)).get(id);
    assert.deepEqual(after?.counts, [1, 0, 1]);
    assert.equal(after?.voters, undefined);
  });
});

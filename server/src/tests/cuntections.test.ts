/**
 * Cuntections (Wes, 2026-09-28: "make a connections thing too"). The server
 * as referee: it keeps the groups back until they are found or the day is
 * over, says "one away", refuses the same four twice, stops you at four
 * mistakes, keeps a day's puzzle once chosen, and tells a server who
 * finished without a single word of it. Also Purdle's all-time board, and
 * the jump limit on typed jumps.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cuntectionsDay, cuntectionsShare, cuntectionsStanding, cuntectionsStats } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-cuntections-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { channels, members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { dealFor, puzzleId } = await import('../cuntections/cuntections.js');
const { PUZZLES } = await import('../cuntections/puzzles.js');

describe('cuntections rules', () => {
  it('turns over at the same midnight as Purdle', () => {
    assert.equal(cuntectionsDay(new Date('2026-09-29T04:00:00Z')), 1);
    assert.equal(cuntectionsDay(new Date('2026-09-29T03:59:00Z')), 0);
    assert.equal(cuntectionsDay(new Date('2026-09-30T04:00:00Z')), 2);
  });

  it('counts streaks, perfect days and average misses', () => {
    const days = new Map([
      [1, { solved: true, mistakes: 0 }],
      [2, { solved: false, mistakes: 4 }],
      [3, { solved: true, mistakes: 2 }],
      [4, { solved: true, mistakes: 0 }],
    ]);
    const stats = cuntectionsStats(days, 5);
    assert.equal(stats.streak, 2);
    assert.equal(stats.best, 2);
    assert.equal(stats.perfect, 2);
    assert.deepEqual(stats.spread, [2, 0, 1, 0]);
    const standing = cuntectionsStanding('u', days, 5);
    assert.equal(standing.averageMistakes, 1.5);
    assert.equal(standing.wins, 3);
  });

  it('shares colours only', () => {
    assert.equal(cuntectionsShare(4, [[0, 0, 1, 0], [0, 0, 0, 0]]), 'Conniptions #4\n🟨🟨🟩🟨\n🟨🟨🟨🟨');
  });

  it('every puzzle is four groups of four, sixteen different words, easiest first', () => {
    assert.ok(PUZZLES.length >= 100, `only ${PUZZLES.length} puzzles`);
    const ids = new Set<string>();
    for (const puzzle of PUZZLES) {
      assert.deepEqual(puzzle.map((group) => group.level), [0, 1, 2, 3], puzzle[0].name);
      const words = puzzle.flatMap((group) => group.words.map((word) => word.trim().toUpperCase()));
      assert.equal(words.length, 16);
      assert.equal(new Set(words).size, 16, `a word twice in "${puzzle[0].name}"`);
      ids.add(puzzleId(puzzle));
    }
    assert.equal(ids.size, PUZZLES.length, 'no puzzle twice');
  });
});

describe('cuntections on the server', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const people: Record<string, { id: string; cookie: string }> = {};
  let serverId: string;

  async function person(username: string) {
    const user = await registerUser({ username, displayName: username, password: 'a long enough password', inviteCode: null, skipInvite: true });
    const session = await createSession(user, null);
    people[username] = { id: user.id, cookie: `${config.cookieName}=${session.token}` };
  }
  const guess = (who: string, words: readonly string[]) =>
    app.inject({ method: 'POST', url: '/api/cuntections/guess', headers: { cookie: people[who]!.cookie }, payload: { words } });
  const today = (who: string) => app.inject({ method: 'GET', url: '/api/cuntections/today', headers: { cookie: people[who]!.cookie } });

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    await person('ace');
    await person('flop');
    await person('outsider');
    serverId = (await createServer({ name: 'Word nerds', ownerId: people.ace!.id })).id;
    await getDb().insert(members).values({ serverId, userId: people.flop!.id });
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('deals the day once and keeps it', async () => {
    const day = cuntectionsDay();
    const first = await dealFor(day);
    const again = await dealFor(day);
    assert.equal(puzzleId(first.puzzle), puzzleId(again.puzzle));
    assert.deepEqual(first.words, again.words);
    const next = await dealFor(day + 1);
    assert.notEqual(puzzleId(next.puzzle), puzzleId(first.puzzle), 'a new day gets a puzzle not used yet');
  });

  it('shows nothing of the groups until found, and a found group then', async () => {
    const response = await today('ace');
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.words.length, 16);
    assert.equal(body.groups, null);
    assert.equal(body.grid, null);
    const { puzzle } = await dealFor(cuntectionsDay());
    for (const group of puzzle) assert.ok(!response.body.includes(group.name), 'no group names while playing');

    const right = await guess('ace', puzzle[0].words);
    assert.equal(right.statusCode, 200, right.body);
    assert.equal(right.json().outcome, 'right');
    assert.equal(right.json().found[0].name, puzzle[0].name);
    assert.equal(right.json().groups, null, 'the rest stay hidden');
  });

  it('says one away, refuses the same four twice, and a found word', async () => {
    const { puzzle } = await dealFor(cuntectionsDay());
    const close = [...puzzle[1].words.slice(0, 3), puzzle[2].words[0]];
    const miss = await guess('ace', close);
    assert.equal(miss.json().outcome, 'one_away');
    assert.equal(miss.json().mistakes, 1);

    const twice = await guess('ace', [...close].reverse());
    assert.equal(twice.statusCode, 400);
    assert.equal(twice.json().code, 'already_tried');

    const taken = await guess('ace', [puzzle[0].words[0], ...puzzle[1].words.slice(0, 3)]);
    assert.equal(taken.json().code, 'already_found');

    const stranger = await guess('ace', ['NOT', 'ON', 'THE', 'BOARD']);
    assert.equal(stranger.json().code, 'not_on_board');
  });

  it('finishing shows everything, and a guess after is refused', async () => {
    const { puzzle } = await dealFor(cuntectionsDay());
    await guess('ace', puzzle[1].words);
    await guess('ace', puzzle[2].words);
    const won = await guess('ace', puzzle[3].words);
    assert.equal(won.json().state, 'won');
    assert.equal(won.json().groups.length, 4);
    assert.equal(won.json().grid.length, 5, 'four right and one miss');
    assert.equal(won.json().stats.streak, 1);
    assert.equal((await guess('ace', puzzle[3].words)).statusCode, 409);
  });

  it('four mistakes is a loss', async () => {
    const { puzzle } = await dealFor(cuntectionsDay());
    // Four different wrong fours: one from each group, rotated.
    let last;
    for (let at = 0; at < 4; at += 1) {
      last = await guess('flop', puzzle.map((group) => group.words[at]!));
      if (at < 3) {
        assert.equal(last.json().state, 'playing', last.body);
      }
    }
    assert.equal(last!.json().state, 'lost');
    assert.equal(last!.json().groups.length, 4);
  });

  it('a server sees who finished and everyone’s record, never a word', async () => {
    const board = await app.inject({ method: 'GET', url: `/api/cuntections/servers/${serverId}`, headers: { cookie: people.flop!.cookie } });
    assert.equal(board.statusCode, 200, board.body);
    const { finishes, standings } = board.json() as {
      finishes: { userId: string; mistakes: number; solved: boolean }[];
      standings: { userId: string; wins: number; played: number }[];
    };
    assert.deepEqual(
      finishes.map((entry) => [entry.userId, entry.mistakes, entry.solved]).sort(),
      [
        [people.ace!.id, 1, true],
        [people.flop!.id, 4, false],
      ].sort(),
    );
    assert.equal(standings.find((entry) => entry.userId === people.ace!.id)?.wins, 1);
    const { puzzle } = await dealFor(cuntectionsDay());
    for (const group of puzzle) {
      assert.ok(!board.body.includes(group.name));
      for (const word of group.words) assert.ok(!board.body.includes(`"${word}"`));
    }

    const stranger = await app.inject({ method: 'GET', url: `/api/cuntections/servers/${serverId}`, headers: { cookie: people.outsider!.cookie } });
    assert.ok(stranger.statusCode === 403 || stranger.statusCode === 404, 'members only');
  });

  it('Purdle’s board carries everyone’s record too', async () => {
    const board = await app.inject({ method: 'GET', url: `/api/purdle/servers/${serverId}`, headers: { cookie: people.ace!.cookie } });
    assert.equal(board.statusCode, 200, board.body);
    assert.ok(Array.isArray(board.json().standings));
  });

  it('a pasted jump counts against the same limit as "again"', async () => {
    const general = (await getDb().select().from(channels)).find((channel) => channel.type === 'text');
    const send = (content: string) =>
      app.inject({
        method: 'POST',
        url: `/api/channels/${general!.id}/messages`,
        headers: { cookie: people.ace!.cookie },
        payload: { content },
      });
    for (let at = 0; at < 10; at += 1) assert.equal((await send('/tang-jump')).statusCode, 200);
    const eleventh = await send('/tang-jump');
    assert.equal(eleventh.statusCode, 429);
    assert.equal((await send('just words')).statusCode, 200, 'ordinary messages are not held up');
  });
});

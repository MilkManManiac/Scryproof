/**
 * Queefs, Travhole and Threeway (Wes, 2026-09-29). The server as referee of
 * each: Queefs keeps the clock and checks the queens itself; Travhole
 * counts every guess once; Threeway gives out a clue only when the one
 * before has been paid for, and an answer only when the question is closed.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  QUEENS,
  TRAVLE,
  TRAVLE_COUNTRIES,
  queensClashes,
  queensClock,
  queensDay,
  queensShare,
  queensSolved,
  thriceDay,
  thriceRight,
  thriceShare,
  travleAllowed,
  travleCountry,
  travleDay,
  travleDistances,
  travleJoined,
  travleMark,
  travleRoute,
  travleShare,
} from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-games-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { members, queensPlays, travleDays } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { answersTo, boardFor, makeBoard } = await import('../queens/queens.js');
const { choose } = await import('../routes/travle.js');
const { SETS } = await import('../thrice/questions.js');
const { isRight, setFor, setId } = await import('../thrice/thrice.js');
const { and, eq } = await import('drizzle-orm');

describe('queefs rules', () => {
  it('makes boards with one answer, every region in one piece', () => {
    for (let at = 0; at < 30; at += 1) {
      const regions = makeBoard();
      assert.equal(regions.length, QUEENS.size);
      assert.equal(new Set(regions.flat()).size, QUEENS.size, 'a region for every row');
      assert.equal(answersTo(regions).length, 1);
      for (let region = 0; region < QUEENS.size; region += 1) {
        const cells = regions.flatMap((row, r) => row.flatMap((value, c) => (value === region ? [[r, c] as const] : [])));
        const seen = new Set([`${cells[0]![0]},${cells[0]![1]}`]);
        const queue = [cells[0]!];
        while (queue.length > 0) {
          const [r, c] = queue.pop()!;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (regions[r + dr]?.[c + dc] !== region || seen.has(`${r + dr},${c + dc}`)) continue;
            seen.add(`${r + dr},${c + dc}`);
            queue.push([r + dr, c + dc]);
          }
        }
        assert.equal(seen.size, cells.length, 'a region in two pieces');
      }
    }
  });

  it('knows a clash and a solved board', () => {
    const regions = makeBoard();
    const queens = answersTo(regions)[0]!.map((column, row) => row * QUEENS.size + column);
    assert.ok(queensSolved(regions, queens));
    assert.equal(queensClashes(regions, queens).size, 0);
    assert.ok(!queensSolved(regions, queens.slice(1)));
    assert.ok(!queensSolved(regions, [queens[0]!, ...queens.slice(0, -1)]), 'the same cell twice');
    assert.deepEqual([...queensClashes(regions, [0, 1])].sort(), [0, 1]);
    assert.deepEqual([...queensClashes(regions, [0, QUEENS.size + 1])].sort((a, b) => a - b), [0, QUEENS.size + 1], 'touching at a corner');
  });

  it('tells the time', () => {
    assert.equal(queensClock(67), '1:07');
    assert.equal(queensClock(3727), '1:02:07');
    assert.equal(queensShare(2, 67), 'Queefs #2\n👑 1:07');
    assert.equal(queensDay(new Date('2026-09-30T04:00:00Z')), 2);
  });
});

describe('travhole rules', () => {
  it('has a map where every border goes both ways', () => {
    for (const country of TRAVLE_COUNTRIES) {
      for (const border of country.borders) {
        assert.ok(travleCountry(border)?.borders.includes(country.code), `${country.code} to ${border} only`);
      }
    }
    assert.ok(TRAVLE_COUNTRIES.length > 190);
  });

  it('marks a guess by how far out of the way it is', () => {
    // Portugal to Germany: Spain, France.
    assert.equal(travleDistances('PRT').get('DEU'), 3);
    assert.deepEqual(travleRoute('PRT', 'DEU'), ['PRT', 'ESP', 'FRA', 'DEU']);
    assert.equal(travleMark('PRT', 'DEU', 'FRA'), 'good');
    assert.equal(travleMark('PRT', 'DEU', 'AND'), 'near');
    assert.equal(travleMark('PRT', 'DEU', 'JPN'), 'off');
    assert.equal(travleMark('PRT', 'DEU', 'BRA'), 'off');
  });

  it('knows when the two ends are joined', () => {
    assert.ok(!travleJoined('PRT', 'DEU', ['ESP']));
    assert.ok(travleJoined('PRT', 'DEU', ['FRA', 'ESP']));
    assert.ok(travleJoined('PRT', 'DEU', ['ESP', 'AND', 'FRA']), 'a way round counts');
    assert.ok(!travleJoined('PRT', 'DEU', ['FRA', 'ITA', 'CHE']));
  });

  it('chooses two countries a fair way apart', () => {
    for (let at = 0; at < 40; at += 1) {
      const { from, to } = choose(new Set());
      const between = travleDistances(from).get(to)! - 1;
      assert.ok(between >= TRAVLE.fewest && between <= TRAVLE.most, `${from} to ${to}: ${between}`);
      assert.ok(travleAllowed(between) > between);
    }
  });

  it('shares squares only', () => {
    const guesses = [
      { code: 'ESP', mark: 'good' as const },
      { code: 'AND', mark: 'near' as const },
      { code: 'FRA', mark: 'good' as const },
    ];
    assert.equal(travleShare({ day: 1, guesses, between: 2, allowed: 6, state: 'won' }), 'Travhole #1\n🟩🟧🟩 +1');
    assert.equal(travleDay(new Date('2026-09-29T04:00:00Z')), 1);
  });
});

describe('threeway rules', () => {
  it('has sets of five, three clues each, no answer twice, no answer in its own clues', () => {
    assert.ok(SETS.length >= 100, `only ${SETS.length} sets`);
    const answers = new Set<string>();
    for (const set of SETS) {
      assert.equal(set.length, 5);
      for (const question of set) {
        assert.equal(question.clues.length, 3);
        assert.ok(!answers.has(question.answer), `${question.answer} twice`);
        answers.add(question.answer);
        const bare = question.answer.replace(/^the /i, '').toLowerCase();
        for (const clue of question.clues) assert.ok(!clue.toLowerCase().includes(bare), `"${question.answer}" is in its own clue`);
        assert.ok(isRight(question, question.answer));
        for (const other of question.accept ?? []) assert.ok(isRight(question, other), other);
      }
    }
    assert.equal(new Set(SETS.map(setId)).size, SETS.length);
  });

  it('forgives case, a leading the, and a slip in a long answer, and no more', () => {
    assert.ok(thriceRight('  the BERLIN wall ', ['The Berlin Wall']));
    assert.ok(thriceRight('Bohemian Rapsody', ['Bohemian Rhapsody']));
    assert.ok(thriceRight('pacman', ['Pac-Man']));
    assert.ok(thriceRight('d&d', ['d and d']));
    assert.ok(!thriceRight('doo', ['Doom']));
    assert.ok(!thriceRight('', ['Doom']));
    assert.ok(!thriceRight('gta 4', ['gta 5']));
    assert.ok(!thriceRight('Wario', ['Mario']));
    assert.ok(!thriceRight('Plato', ['Pluto']));
    assert.ok(thriceRight('Octopis', ['Octopus']));
  });

  it('shares what each question came to', () => {
    assert.equal(thriceShare(3, [3, 0, 1, 2, 3]), 'Threeway #3\n3️⃣❌1️⃣2️⃣3️⃣ 9/15');
    assert.equal(thriceDay(new Date('2026-09-29T04:00:00Z')), 1);
  });
});

describe('the three on the server', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const people: Record<string, { id: string; cookie: string }> = {};
  let serverId: string;

  async function person(username: string) {
    const user = await registerUser({ username, displayName: username, password: 'a long enough password', inviteCode: null, skipInvite: true });
    const session = await createSession(user, null);
    people[username] = { id: user.id, cookie: `${config.cookieName}=${session.token}` };
  }
  const get = (who: string, url: string) => app.inject({ method: 'GET', url, headers: { cookie: people[who]!.cookie } });
  const post = (who: string, url: string, payload: object = {}) =>
    app.inject({ method: 'POST', url, headers: { cookie: people[who]!.cookie }, payload });

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    await person('ace');
    await person('flop');
    await person('outsider');
    serverId = (await createServer({ name: 'Game night', ownerId: people.ace!.id })).id;
    await getDb().insert(members).values({ serverId, userId: people.flop!.id });
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('wants a session for every one of them', async () => {
    for (const game of ['queens', 'travle', 'thrice']) {
      assert.equal((await app.inject({ method: 'GET', url: `/api/${game}/today` })).statusCode, 401);
      assert.equal((await get('outsider', `/api/${game}/servers/${serverId}`)).statusCode, 404);
    }
  });

  it('queefs: no board before the clock, and the server keeps the time', async () => {
    const waiting = (await get('ace', '/api/queens/today')).json();
    assert.equal(waiting.state, 'waiting');
    assert.equal(waiting.regions, null);
    assert.equal((await post('ace', '/api/queens/solve', { queens: [] })).json().code, 'not_started');

    const started = (await post('ace', '/api/queens/start')).json();
    assert.equal(started.state, 'playing');
    assert.deepEqual(started.regions, await boardFor(queensDay()));
    assert.equal((await post('ace', '/api/queens/start')).json().startedAt, started.startedAt, 'starting twice does not restart');

    const wrong = await post('ace', '/api/queens/solve', { queens: [0, 1, 2, 3, 4, 5, 6, 7] });
    assert.equal(wrong.json().code, 'not_solved');

    // Ninety seconds ago.
    await getDb()
      .update(queensPlays)
      .set({ startedAt: new Date(Date.now() - 90_000) })
      .where(and(eq(queensPlays.userId, people.ace!.id), eq(queensPlays.day, queensDay())));
    const queens = answersTo(started.regions)[0]!.map((column: number, row: number) => row * QUEENS.size + column);
    const done = (await post('ace', '/api/queens/solve', { queens })).json();
    assert.equal(done.state, 'done');
    assert.ok(done.seconds >= 90 && done.seconds <= 92, String(done.seconds));
    assert.equal((await post('ace', '/api/queens/solve', { queens })).json().code, 'finished');

    const board = (await get('flop', `/api/queens/servers/${serverId}`)).json();
    assert.deepEqual(board.finishes, [{ userId: people.ace!.id, seconds: done.seconds }]);
    assert.deepEqual(board.standings, [{ userId: people.ace!.id, firsts: 1, played: 1, best: done.seconds, average: done.seconds }]);
  });

  it('travhole: counts guesses, wins when the ends are joined, loses when they run out', async () => {
    const day = travleDay();
    await getDb().insert(travleDays).values({ day, from: 'PRT', to: 'DEU' });
    const open = (await get('ace', '/api/travle/today')).json();
    assert.deepEqual([open.from, open.to, open.between, open.allowed, open.route], ['PRT', 'DEU', 2, 6, null]);

    assert.equal((await post('ace', '/api/travle/guess', { code: 'XXX' })).json().code, 'not_a_country');
    assert.equal((await post('ace', '/api/travle/guess', { code: 'PRT' })).json().code, 'an_end');
    const first = (await post('ace', '/api/travle/guess', { code: 'and' })).json();
    assert.deepEqual(first.guesses, [{ code: 'AND', mark: 'near' }]);
    assert.equal((await post('ace', '/api/travle/guess', { code: 'AND' })).json().code, 'already_said');
    await post('ace', '/api/travle/guess', { code: 'ESP' });
    const won = (await post('ace', '/api/travle/guess', { code: 'FRA' })).json();
    assert.equal(won.state, 'won');
    assert.deepEqual(won.route, ['PRT', 'ESP', 'FRA', 'DEU']);
    assert.equal(won.stats.wins, 1);
    assert.equal(won.stats.averageExtra, 1);
    assert.equal((await post('ace', '/api/travle/guess', { code: 'ITA' })).json().code, 'finished');

    for (const code of ['JPN', 'BRA', 'CHN', 'IND', 'USA']) await post('flop', '/api/travle/guess', { code });
    const lost = (await post('flop', '/api/travle/guess', { code: 'CAN' })).json();
    assert.equal(lost.state, 'lost');
    assert.ok(lost.route.length > 0);

    const board = (await get('ace', `/api/travle/servers/${serverId}`)).json();
    assert.equal(board.finishes.length, 2);
    assert.deepEqual(board.finishes.find((entry: { userId: string }) => entry.userId === people.ace!.id), {
      userId: people.ace!.id,
      solved: true,
      extra: 1,
    });
  });

  it('threeway: a clue at a time, an answer only when the question is closed', async () => {
    const day = thriceDay();
    const set = await setFor(day);
    assert.equal(setId(await setFor(day)), setId(set), 'the day keeps its set');

    const open = await get('ace', '/api/thrice/today');
    const body = open.json();
    assert.equal(body.questions.length, 1);
    assert.deepEqual(body.questions[0].clues, [set[0].clues[0]]);
    assert.equal(body.questions[0].answer, null);
    assert.ok(!open.body.includes(set[0].clues[1]), 'the second clue is not sent yet');
    assert.ok(!open.body.includes(set[1].clues[0]), 'nor the second question');

    // Wrong, pass, right on the third clue: one point.
    let now = (await post('ace', '/api/thrice/answer', { said: 'no idea at all' })).json();
    assert.equal(now.questions[0].clues.length, 2);
    now = (await post('ace', '/api/thrice/answer', { said: '' })).json();
    assert.equal(now.questions[0].clues.length, 3);
    assert.equal(now.questions.length, 1);
    now = (await post('ace', '/api/thrice/answer', { said: set[0].answer.toUpperCase() })).json();
    assert.equal(now.questions[0].points, 1);
    assert.equal(now.questions[0].answer, set[0].answer);
    assert.equal(now.questions.length, 2, 'the next question opens');
    assert.equal(now.score, 1);

    // Right first time: three. Then three wrong: none. Then two more right.
    now = (await post('ace', '/api/thrice/answer', { said: set[1].answer })).json();
    assert.equal(now.questions[1].points, 3);
    for (let at = 0; at < 3; at += 1) now = (await post('ace', '/api/thrice/answer', { said: 'zzzzzz' })).json();
    assert.equal(now.questions[2].points, 0);
    assert.equal(now.questions[2].answer, set[2].answer);
    await post('ace', '/api/thrice/answer', { said: set[3].answer });
    now = (await post('ace', '/api/thrice/answer', { said: set[4].answer })).json();
    assert.equal(now.state, 'done');
    assert.equal(now.score, 10);
    assert.deepEqual(now.stats, { played: 1, best: 10, average: 10, perfect: 0 });
    assert.equal((await post('ace', '/api/thrice/answer', { said: 'more' })).json().code, 'finished');

    const board = (await get('flop', `/api/thrice/servers/${serverId}`)).json();
    assert.deepEqual(board.finishes, [{ userId: people.ace!.id, score: 10, points: [1, 3, 0, 3, 3] }]);
    assert.equal(board.standings[0].total, 10);
  });
});

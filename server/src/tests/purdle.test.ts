/**
 * Purdle (Wes, 2026-09-27: "Make a game called purdle that acts like
 * wordle"). The rules in `shared/src/purdle.ts`, and the server as referee:
 * it marks guesses, keeps the answer to itself until you finish, stops you at
 * six, and tells a server who finished without saying the word.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { markGuess, nextPurdleAt, purdleDay, purdleShare, purdleStats } from '@scryproof/shared';
import { purdleWords } from '@scryproof/shared/purdle-words';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-purdle-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { answerFor } = await import('../purdle/purdle.js');
const { ANSWERS } = await import('../purdle/answers.js');

describe('purdle rules', () => {
  it('marks like Wordle, repeated letters included', () => {
    assert.deepEqual(markGuess('crane', 'crane'), ['hit', 'hit', 'hit', 'hit', 'hit']);
    assert.deepEqual(markGuess('speed', 'abide'), ['miss', 'miss', 'near', 'miss', 'near']);
    // Two e's guessed, one in the answer and in the right place: only that one lights.
    assert.deepEqual(markGuess('geese', 'those'), ['miss', 'miss', 'miss', 'hit', 'hit']);
    // "eagle" has two e's: one is hit in place, the other is still there to find.
    assert.deepEqual(markGuess('allee', 'eagle'), ['near', 'near', 'miss', 'near', 'hit']);
  });

  it('turns over at midnight Eastern', () => {
    assert.equal(purdleDay(new Date('2026-09-27T04:00:00Z')), 1, 'midnight EDT is day one');
    assert.equal(purdleDay(new Date('2026-09-27T03:59:00Z')), 0, 'a minute before is not');
    assert.equal(purdleDay(new Date('2026-09-28T03:59:00Z')), 1);
    assert.equal(purdleDay(new Date('2026-09-28T04:00:00Z')), 2);
  });

  it('knows when the next word starts, on either side of the clock change', () => {
    assert.equal(nextPurdleAt(new Date('2026-09-27T15:00:00Z')).toISOString(), '2026-09-28T04:00:00.000Z');
    assert.equal(nextPurdleAt(new Date('2026-10-31T12:00:00Z')).toISOString(), '2026-11-01T04:00:00.000Z');
    // 1:30 in the morning on the night clocks go back: the next midnight is EST.
    assert.equal(nextPurdleAt(new Date('2026-11-01T05:30:00Z')).toISOString(), '2026-11-02T05:00:00.000Z');
  });

  it('counts streaks: a loss or a missed day breaks one, today not played yet does not', () => {
    const days = new Map([
      [1, { solved: true, tries: 3 }],
      [2, { solved: true, tries: 4 }],
      [3, { solved: false, tries: 6 }],
      [4, { solved: true, tries: 2 }],
      [5, { solved: true, tries: 4 }],
    ]);
    const stats = purdleStats(days, 6);
    assert.equal(stats.streak, 2);
    assert.equal(stats.best, 2);
    assert.equal(stats.played, 5);
    assert.equal(stats.wins, 4);
    assert.deepEqual(stats.spread, [0, 1, 1, 2, 0, 0]);
    assert.equal(purdleStats(days, 7).streak, 0, 'a missed day ends it');
  });

  it('shares colours only', () => {
    const text = purdleShare(3, [markGuess('crane', 'those'), markGuess('those', 'those')], true);
    assert.equal(text, 'Purdle 3 2/6\n\n⬛⬛⬛⬛🟩\n🟩🟩🟩🟩🟩');
  });

  it('every answer is a word you could guess, and the order is not alphabetical', () => {
    const words = purdleWords();
    assert.ok(ANSWERS.every((word) => words.has(word)));
    assert.ok(ANSWERS.length > 1000);
    const first = Array.from({ length: 10 }, (_, at) => answerFor(at + 1));
    assert.notDeepEqual(first, ANSWERS.slice(0, 10));
    assert.equal(new Set(Array.from({ length: ANSWERS.length }, (_, at) => answerFor(at + 1))).size, ANSWERS.length, 'no repeats in a cycle');
  });
});

describe('purdle on the server', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const people: Record<string, { id: string; cookie: string }> = {};
  let serverId: string;

  async function person(username: string) {
    const user = await registerUser({ username, displayName: username, password: 'a long enough password', inviteCode: null, skipInvite: true });
    const session = await createSession(user, null);
    people[username] = { id: user.id, cookie: `${config.cookieName}=${session.token}` };
  }
  const guess = (who: string, word: string) =>
    app.inject({ method: 'POST', url: '/api/purdle/guess', headers: { cookie: people[who]!.cookie }, payload: { word } });
  const wrong = (answer: string) => [...purdleWords()].filter((word) => word !== answer).slice(0, 6);

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

  it('marks a guess and keeps the answer back until the day is done', async () => {
    const answer = answerFor(purdleDay());
    const first = await guess('ace', wrong(answer)[0]!);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().state, 'playing');
    assert.equal(first.json().answer, null, 'no peeking');
    assert.equal(first.json().guesses.length, 1);

    const nonsense = await guess('ace', 'qzxqz');
    assert.equal(nonsense.statusCode, 400);
    assert.equal(nonsense.json().code, 'not_a_word');

    const won = await guess('ace', answer);
    assert.equal(won.json().state, 'won');
    assert.equal(won.json().answer, answer);
    assert.equal(won.json().stats.streak, 1);

    const again = await guess('ace', answer);
    assert.equal(again.statusCode, 409, 'once a day');
  });

  it('six wrong is a loss, and a seventh is refused', async () => {
    const answer = answerFor(purdleDay());
    let last;
    for (const word of wrong(answer)) last = await guess('flop', word);
    assert.equal(last!.json().state, 'lost');
    assert.equal(last!.json().answer, answer, 'shown once it is over');
    assert.equal((await guess('flop', answer)).statusCode, 409);
  });

  it('a server sees who finished and in how many, never the words', async () => {
    const board = await app.inject({ method: 'GET', url: `/api/purdle/servers/${serverId}`, headers: { cookie: people.flop!.cookie } });
    assert.equal(board.statusCode, 200, board.body);
    const finishes = board.json().finishes as { userId: string; tries: number; solved: boolean }[];
    assert.deepEqual(
      finishes.map((entry) => [entry.userId, entry.tries, entry.solved]).sort(),
      [
        [people.ace!.id, 2, true],
        [people.flop!.id, 6, false],
      ].sort(),
    );
    assert.ok(!board.body.includes(answerFor(purdleDay())));

    const stranger = await app.inject({ method: 'GET', url: `/api/purdle/servers/${serverId}`, headers: { cookie: people.outsider!.cookie } });
    assert.ok(stranger.statusCode === 403 || stranger.statusCode === 404, 'members only');
  });
});

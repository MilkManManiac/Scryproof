/**
 * The bee (Wes, 2026-09-29). The server as referee: it picks a board that is
 * neither thin nor endless and keeps it, takes a word only if the word list
 * has it and the letters allow it, never takes one twice, says nothing of
 * the answers until the day is over, and tells a server where someone has
 * got to without the word.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BEE_GENIUS, beeDay, beePoints, beeRank, beeRefusal, beeShare, beeStanding } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-bee-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { beeDays, beePlays, members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { answersFor, boardFor, choose, lookUp, pointsOf } = await import('../bee/bee.js');

describe('bee rules', () => {
  it('turns over at the same midnight as Purdle', () => {
    assert.equal(beeDay(new Date('2026-09-29T04:00:00Z')), 1);
    assert.equal(beeDay(new Date('2026-09-29T03:59:00Z')), 0);
  });

  it('scores a word by its length, and all seven letters more', () => {
    assert.equal(beePoints('noon'), 1);
    assert.equal(beePoints('round'), 5);
    assert.equal(beePoints('aground'), 14);
  });

  it('ranks by the share of the day', () => {
    assert.equal(beeRank(0, 100), 0);
    assert.equal(beeRank(2, 100), 1);
    assert.equal(beeRank(69, 100), BEE_GENIUS - 1);
    assert.equal(beeRank(70, 100), BEE_GENIUS);
    assert.equal(beeRank(140, 100), BEE_GENIUS + 1, 'uncommon words can pass the top');
  });

  it('says what it can of a word without the list', () => {
    const letters = ['n', 'a', 'g', 'r', 'o', 'u', 'd'];
    assert.equal(beeRefusal('nun', letters, []), 'too_short');
    assert.equal(beeRefusal('nest', letters, []), 'bad_letters');
    assert.equal(beeRefusal('road', letters, []), 'no_centre');
    assert.equal(beeRefusal('noon', letters, ['noon']), 'already_found');
    assert.equal(beeRefusal('noon', letters, []), null);
  });

  it('keeps a record', () => {
    const standing = beeStanding('u', [
      { score: 70, max: 100 },
      { score: 10, max: 100 },
    ]);
    assert.deepEqual(standing, { userId: 'u', played: 2, genius: 1, best: 70, total: 80, average: 40 });
  });

  it('shares where you got to and no word', () => {
    assert.equal(
      beeShare({ day: 3, score: 20, rank: 4, words: ['aground', 'noon', 'round'] }),
      'Spelling Pea #3\nSolid: 20 points\n3 words, 1 with all seven',
    );
  });

  it('chooses boards with a word of all seven and a fair number of words', () => {
    for (let at = 0; at < 25; at += 1) {
      const board = choose(new Set());
      assert.equal(new Set(board.letters).size, 7);
      assert.ok(!board.letters.includes('s'));
      const answers = answersFor(board.letters);
      assert.ok(answers.length >= 20 && answers.length <= 50, `${board.letters.join('')}: ${answers.length} words`);
      assert.ok(answers.some((word) => new Set(word).size === 7), 'a word of all seven');
      assert.ok(answers.every((word) => word.includes(board.letters[0]!)));
      assert.equal(board.max, pointsOf(answers));
    }
  });

  it('knows our words', () => {
    assert.equal(lookUp('dickhead'), 'common');
    assert.equal(lookUp('round'), 'common');
    assert.equal(lookUp('xxxx'), null);
  });
});

describe('bee on the server', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const people: Record<string, { id: string; cookie: string }> = {};
  let serverId: string;

  async function person(username: string) {
    const user = await registerUser({ username, displayName: username, password: 'a long enough password', inviteCode: null, skipInvite: true });
    const session = await createSession(user, null);
    people[username] = { id: user.id, cookie: `${config.cookieName}=${session.token}` };
  }
  const word = (who: string, text: string) =>
    app.inject({ method: 'POST', url: '/api/bee/word', headers: { cookie: people[who]!.cookie }, payload: { word: text } });
  const today = (who: string) => app.inject({ method: 'GET', url: '/api/bee/today', headers: { cookie: people[who]!.cookie } });
  const board = (who: string) =>
    app.inject({ method: 'GET', url: `/api/bee/servers/${serverId}`, headers: { cookie: people[who]!.cookie } });

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

  it('wants a session', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/bee/today' })).statusCode, 401);
  });

  it('picks the day once and keeps it, and never the same letters again', async () => {
    const day = beeDay();
    const first = await boardFor(day);
    assert.deepEqual(await boardFor(day), first);
    const next = await boardFor(day + 1);
    assert.notEqual([...next.letters].sort().join(''), [...first.letters].sort().join(''));
  });

  it('shows the board and how much is in it, not what', async () => {
    const response = await today('ace');
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    const answers = answersFor(body.letters);
    assert.equal(body.letters.length, 7);
    assert.equal(body.answers, answers.length);
    assert.equal(body.max, pointsOf(answers));
    assert.deepEqual(body.words, []);
    assert.equal(body.yesterday, null);
    const all = answers.find((entry) => new Set(entry).size === 7)!;
    assert.ok(!response.body.includes(`"${all}"`), 'no answers while the day is on');
  });

  it('takes a word once, scores it, and refuses what is not one', async () => {
    const { letters } = await boardFor(beeDay());
    const answers = answersFor(letters);
    const long = answers.find((entry) => new Set(entry).size === 7)!;

    const taken = await word('ace', long.toUpperCase());
    assert.equal(taken.statusCode, 200, taken.body);
    assert.deepEqual(taken.json().taken, { word: long, points: beePoints(long), pangram: true, extra: false });
    assert.equal(taken.json().score, beePoints(long));
    assert.deepEqual(taken.json().words, [long]);

    const twice = await word('ace', long);
    assert.equal(twice.statusCode, 400);
    assert.equal(twice.json().code, 'already_found');

    const centre = letters[0]!;
    const junk = await word('ace', centre.repeat(5));
    assert.equal(junk.json().code, lookUp(centre.repeat(5)) ? undefined : 'not_a_word');
    assert.equal((await word('ace', centre.repeat(3))).json().code, 'too_short');
    assert.equal((await word('ace', `${centre}sss`)).json().code, 'bad_letters');
    assert.equal((await word('ace', letters[1]!.repeat(4))).json().code, 'no_centre');

    assert.equal((await today('ace')).json().score, beePoints(long), 'a refusal costs nothing');
  });

  it('shows a server where everyone is, to members only', async () => {
    const { letters } = await boardFor(beeDay());
    const short = answersFor(letters).find((entry) => entry.length === 4) ?? answersFor(letters)[0]!;
    assert.equal((await word('flop', short)).statusCode, 200);

    const response = await board('flop');
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.scores.length, 2);
    const flop = body.scores.find((entry: { userId: string }) => entry.userId === people.flop!.id);
    assert.deepEqual(flop, { userId: people.flop!.id, score: beePoints(short), words: 1, rank: beeRank(beePoints(short), body.scores.length ? (await boardFor(beeDay())).max : 0) });
    assert.equal(body.standings.length, 2);
    assert.ok(!response.body.includes(short), 'no words on the board');

    assert.equal((await board('outsider')).statusCode, 404);
  });

  it('shows yesterday whole once it is yesterday', async () => {
    const day = beeDay();
    const old = choose(new Set());
    await getDb().insert(beeDays).values({ day: day - 1, letters: old.letters.join(''), max: old.max });
    const found = answersFor(old.letters).slice(0, 2);
    await getDb().insert(beePlays).values({ userId: people.ace!.id, day: day - 1, words: found, score: pointsOf(found) });

    const body = (await today('ace')).json();
    assert.equal(body.yesterday.day, day - 1);
    assert.deepEqual(body.yesterday.answers, answersFor(old.letters));
    assert.deepEqual(body.yesterday.found, found);
    assert.equal(body.stats.played, 2);
  });
});

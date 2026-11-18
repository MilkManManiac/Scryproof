/**
 * Conveyor (Wes, 2026-11-17): the bank, the matcher, the daily pick, and the
 * server as referee of the clock and the score.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONVEYOR, CONVEYOR_DEADLINE_MS, conveyorDay, conveyorFound, conveyorShare, conveyorStats, namesMatch, plainName } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-conveyor-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { conveyorPlays, members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { BANK } = await import('../conveyor/bank.js');
const { itemsFor, lookalike, pick } = await import('../conveyor/conveyor.js');
const { and, eq } = await import('drizzle-orm');

const here = dirname(fileURLToPath(import.meta.url));
const pictures = join(here, '..', '..', '..', 'web', 'public', 'conveyor');

describe('conveyor bank', () => {
  it('has a picture for every thing, unique ids, and no name or alias on two things', () => {
    assert.ok(BANK.length >= 300, `only ${BANK.length} things`);
    assert.equal(new Set(BANK.map((item) => item.id)).size, BANK.length, 'an id twice');
    const owner = new Map<string, string>();
    for (const item of BANK) {
      assert.ok(existsSync(join(pictures, item.file)), `${item.file} is missing`);
      for (const name of new Set([item.name, ...item.aliases].map(plainName))) {
        assert.ok(!owner.has(name), `"${name}" is both ${owner.get(name)} and ${item.id}`);
        owner.set(name, item.id);
      }
    }
    assert.ok(existsSync(join(pictures, 'LICENSE.txt')), 'the licence sits beside the pictures');
  });
});

describe('the matcher', () => {
  it('forgives case, spaces, hyphens, a plural and one slip in a longer name', () => {
    assert.ok(namesMatch('HOT DOG', ['Hot dog']));
    assert.ok(namesMatch('hot-dogs', ['Hot dog']));
    assert.ok(namesMatch('hotdog', ['Hot dog']));
    assert.ok(namesMatch('pineapples', ['Pineapple']));
    assert.ok(namesMatch('pinapple', ['Pineapple']), 'one letter missing');
    assert.ok(namesMatch('sofa', ['Couch', 'sofa']));
    assert.ok(namesMatch('the giraffe', ['Giraffe']));
    assert.ok(!namesMatch('cat', ['Car']), 'no slip in a short name');
    assert.ok(!namesMatch('pinaple', ['Pineapple']), 'two slips is too many');
    assert.ok(!namesMatch('', ['Egg']));
  });
});

describe('the daily pick', () => {
  it('takes twenty, four of a kind at most, no lookalikes, the same for the same day', () => {
    for (let day = 1; day <= 40; day += 1) {
      const items = pick(day, new Set());
      assert.equal(items.length, CONVEYOR.items);
      const kinds = new Map<string, number>();
      for (const item of items) {
        const kind = BANK.find((entry) => entry.id === item.id)!.category;
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
      assert.ok(Math.max(...kinds.values()) <= CONVEYOR.perCategory);
      for (const a of items) for (const b of items) if (a !== b) assert.ok(!lookalike(a, b), `${a.name} and ${b.name}`);
    }
    assert.deepEqual(pick(7, new Set()), pick(7, new Set()));
  });

  it('skips what was used lately', () => {
    const first = pick(3, new Set());
    const next = pick(4, new Set(first.map((item) => item.id)));
    assert.ok(next.every((item) => !first.some((other) => other.id === item.id)));
  });

  it('scores, streaks and shares', () => {
    const items = pick(9, new Set());
    assert.deepEqual(conveyorFound(items, [items[3]!.name, 'nonsense', items[3]!.name, items[0]!.name.toUpperCase()]), [items[3]!.id, items[0]!.id]);
    assert.deepEqual(conveyorStats(new Map([[5, 10], [6, 12], [8, 14]]), 8), { played: 3, best: 14, average: 12, streak: 1 });
    assert.equal(conveyorStats(new Map([[7, 10], [8, 12]]), 9).streak, 2, 'today not played yet does not break it');
    const share = conveyorShare(2, items.map((_, at) => at < 3));
    assert.ok(share.startsWith(`${CONVEYOR.name} #2\n3/20\n`));
    assert.ok(!items.some((item) => share.includes(item.name)), 'no names in the share');
  });
});

describe('conveyor on the server', () => {
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
  /** Moves someone's start back, as if `ms` had gone by. */
  const wind = (who: string, ms: number) =>
    getDb()
      .update(conveyorPlays)
      .set({ startedAt: new Date(Date.now() - ms) })
      .where(and(eq(conveyorPlays.userId, people[who]!.id), eq(conveyorPlays.day, conveyorDay())));

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

  it('wants a session, and a member for the board', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/conveyor/today' })).statusCode, 401);
    assert.equal((await get('outsider', `/api/conveyor/servers/${serverId}`)).statusCode, 404);
  });

  it('sends nothing of the belt before start, and the same twenty to everyone', async () => {
    const day = conveyorDay();
    const items = await itemsFor(day);
    const fresh = await get('ace', '/api/conveyor/today');
    assert.equal(fresh.json().state, 'fresh');
    assert.deepEqual(fresh.json().items, []);
    assert.ok(!items.some((item) => fresh.body.includes(`"${item.file}"`)), 'no picture before start');

    const ace = (await post('ace', '/api/conveyor/start')).json();
    const flop = (await post('flop', '/api/conveyor/start')).json();
    assert.equal(ace.state, 'playing');
    assert.equal(ace.items.length, CONVEYOR.items);
    assert.deepEqual(ace.items, flop.items);
    assert.deepEqual(ace.items, items);
  });

  it('keeps the clock: no guess during the belt, a reload resumes, late guesses refused', async () => {
    const items = await itemsFor(conveyorDay());
    const early = await post('ace', '/api/conveyor/guess', { said: items[0]!.name });
    assert.equal(early.json().code, 'too_soon');

    await wind('ace', CONVEYOR.beltMs + 1000);
    const startedAt = (await get('ace', '/api/conveyor/today')).json().startedAt;
    const again = (await post('ace', '/api/conveyor/start')).json();
    assert.equal(again.startedAt, startedAt, 'starting again does not reset the clock');

    let now = (await post('ace', '/api/conveyor/guess', { said: items[0]!.name })).json();
    assert.equal(now.score, 1);
    now = (await post('ace', '/api/conveyor/guess', { said: 'definitely not on it' })).json();
    assert.equal(now.score, 1, 'a miss costs nothing and is not kept');
    now = (await post('ace', '/api/conveyor/guess', { said: items[0]!.name.toLowerCase() })).json();
    assert.equal(now.score, 1, 'a repeat counts once');
    now = (await post('ace', '/api/conveyor/guess', { said: ` ${items[5]!.name.toUpperCase()} ` })).json();
    assert.equal(now.score, 2);
    const reload = (await get('ace', '/api/conveyor/today')).json();
    assert.equal(reload.state, 'playing');
    assert.deepEqual(reload.guesses, [items[0]!.name, items[5]!.name.toUpperCase()]);

    // Flop runs out of time: the guess is refused and the day closes itself.
    await wind('flop', CONVEYOR_DEADLINE_MS + 1000);
    const late = await post('flop', '/api/conveyor/guess', { said: items[1]!.name });
    assert.equal(late.json().code, 'too_late');
    const flopDay = (await get('flop', '/api/conveyor/today')).json();
    assert.equal(flopDay.state, 'done');
    assert.equal(flopDay.score, 0);
  });

  it('works the score out from the guesses, and one play a day', async () => {
    // A tampered score is put right at the finish.
    await getDb()
      .update(conveyorPlays)
      .set({ score: 20 })
      .where(and(eq(conveyorPlays.userId, people.ace!.id), eq(conveyorPlays.day, conveyorDay())));
    const done = (await post('ace', '/api/conveyor/finish')).json();
    assert.equal(done.state, 'done');
    assert.equal(done.score, 2);
    assert.equal(done.stats.played, 1);
    assert.equal(done.stats.streak, 1);
    assert.equal((await post('ace', '/api/conveyor/start')).json().code, 'finished');
    assert.equal((await post('ace', '/api/conveyor/guess', { said: 'anything' })).json().code, 'finished');

    const board = (await get('flop', `/api/conveyor/servers/${serverId}`)).json();
    const mine = board.finishes.find((entry: { userId: string }) => entry.userId === people.ace!.id);
    assert.equal(mine.score, 2);
    assert.equal(mine.marks.filter(Boolean).length, 2);
    assert.equal(mine.marks.length, CONVEYOR.items);
    assert.equal(board.finishes.length, 2);
    assert.equal(board.standings.length, 2);
  });
});

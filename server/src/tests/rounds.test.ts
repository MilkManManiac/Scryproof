/**
 * Whereabouts and Lowball (Wes, 2026-09-29). The server as referee: a round
 * at a time, the answer only with the guess, the day finished after five,
 * and a photo only for a round that has been reached.
 *
 * Played with a made-up stock put into the lists in place of the real one,
 * so the test does not depend on what the photo scripts downloaded.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { kmBetween, lowballPoints, parsePrice, priceText, ROUNDS_OPEN, roundsDay, roundsShare, wherePoints } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-rounds-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { members } = await import('../db/schema.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { createServer } = await import('../services/servers.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { HOMES, PLACES } = await import('../rounds/stock.js');
const { itemsFor, readGuess } = await import('../rounds/rounds.js');

const hex = (n: number) => n.toString(16).padStart(12, '0');

// Six places a degree of latitude apart along the prime meridian, and six homes at round prices.
PLACES.clear();
HOMES.clear();
for (let at = 0; at < 6; at += 1) {
  PLACES.set(`g_${hex(at)}`, {
    id: `g_${hex(at)}`,
    lat: 40 + at,
    lng: 0,
    country: 'FRA',
    width: 1600,
    height: 1200,
    credit: 'someone',
    license: 'CC-BY-SA-4.0',
    source: `https://example.invalid/items/${at}`,
    captured: null,
  });
  HOMES.set(`h_${hex(at)}`, {
    id: `h_${hex(at)}`,
    price: 100_000 * (at + 1),
    priceKind: 'sold',
    soldDate: '2026-08-01',
    city: 'Chattanooga',
    state: 'TN',
    beds: 3,
    baths: 2,
    sqft: 1500,
    lotSqft: null,
    yearBuilt: 1990,
    propertyType: 'Single Family Residential',
    photos: 2,
    source: `https://example.invalid/home/${at}`,
  });
}

describe('rounds rules', () => {
  it('scores a place like GeoGuessr: full on the spot, about half at a thousand km, little on another continent', () => {
    assert.equal(wherePoints(0.4), 5000);
    assert.ok(Math.abs(wherePoints(1000) - 2559) <= 1, String(wherePoints(1000)));
    assert.ok(wherePoints(8000) < 30);
    assert.ok(Math.abs(kmBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.2) < 0.1);
  });

  it('scores a price by the ratio, the same above and below', () => {
    assert.equal(lowballPoints(101_000, 100_000), 5000);
    assert.equal(lowballPoints(200_000, 100_000), lowballPoints(50_000, 100_000));
    assert.equal(lowballPoints(2_000_000, 1_000_000), lowballPoints(200_000, 100_000));
    assert.ok(lowballPoints(110_000, 100_000) > 3600 && lowballPoints(110_000, 100_000) < 3800);
    assert.equal(lowballPoints(0, 100_000), 0);
  });

  it('reads prices the way people type them', () => {
    assert.equal(parsePrice('450000'), 450_000);
    assert.equal(parsePrice('$450,000'), 450_000);
    assert.equal(parsePrice('450k'), 450_000);
    assert.equal(parsePrice('1.2m'), 1_200_000);
    assert.equal(parsePrice('1.25 mil'), 1_250_000);
    assert.equal(parsePrice('cheap'), null);
    assert.equal(parsePrice('12'), null, 'twelve dollars is not a house');
    assert.equal(priceText(475_000), '$475,000');
    assert.equal(priceText(1_250_000), '$1.25M');
    assert.equal(priceText(2_000_000), '$2M');
  });

  it('shares squares and a score, never a place or a price', () => {
    assert.equal(roundsShare('whereabouts', 4, [5000, 3100, 1200, 10, 4600]), 'Whereabouts #4\n🟩🟨🟧🟥🟩 13,910/25,000');
  });

  it('only takes a guess that is one', () => {
    assert.deepEqual(readGuess('whereabouts', { lat: 10, lng: 190 }), { lat: 10, lng: -170 });
    assert.equal(readGuess('whereabouts', { lat: 95, lng: 0 }), null);
    assert.equal(readGuess('whereabouts', 'Paris'), null);
    assert.equal(readGuess('lowball', 250_000.4), 250_000);
    assert.equal(readGuess('lowball', -5), null);
    assert.equal(readGuess('lowball', { price: 5 }), null);
  });
});

describe('rounds routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const people: Record<string, { id: string; cookie: string }> = {};
  let serverId = '';

  async function person(username: string) {
    const user = await registerUser({ username, displayName: username, password: 'a long enough password', inviteCode: null, skipInvite: true });
    const session = await createSession(user, null);
    people[username] = { id: user.id, cookie: `${config.cookieName}=${session.token}` };
  }
  const get = (who: string, url: string) => app.inject({ method: 'GET', url, headers: { cookie: people[who]!.cookie } });
  const post = (who: string, url: string, payload: object = {}) =>
    app.inject({ method: 'POST', url, headers: { cookie: people[who]!.cookie }, payload });

  before(async () => {
    // Played here whether or not it is out yet; one test below closes it on purpose.
    ROUNDS_OPEN.lowball = true;
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    await person('ace');
    await person('flop');
    await person('outsider');
    serverId = (await createServer({ name: 'Game night', ownerId: people.ace!.id })).id;
    await getDb().insert(members).values({ serverId, userId: people.flop!.id });

    // Every photo in the made-up stock, as a file.
    for (const [folder, names] of [
      ['geo', [...PLACES.keys()].map((id) => `${id}.jpg`)],
      ['homes', [...HOMES.keys()].flatMap((id) => [`${id}_1.jpg`, `${id}_2.jpg`])],
    ] as const) {
      mkdirSync(join(config.gamePhotosDir, folder), { recursive: true });
      for (const name of names) writeFileSync(join(config.gamePhotosDir, folder, name), `jpeg ${name}`);
    }
  });

  after(async () => {
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('wants a session, and a server of your own for its board', async () => {
    for (const game of ['whereabouts', 'lowball']) {
      assert.equal((await app.inject({ method: 'GET', url: `/api/rounds/${game}/today` })).statusCode, 401);
      assert.equal((await get('outsider', `/api/rounds/${game}/servers/${serverId}`)).statusCode, 404);
    }
    assert.equal((await get('ace', '/api/rounds/chess/today')).statusCode, 400);
  });

  it('whereabouts: a round at a time, where it was only with the guess, and no photo ahead of time', async () => {
    const day = roundsDay('whereabouts');
    const items = await itemsFor('whereabouts', day);
    assert.equal(items.length, 5);
    assert.equal(new Set(items).size, 5, 'five different places');
    assert.deepEqual(await itemsFor('whereabouts', day), items, 'the day keeps its places');

    const open = await get('ace', '/api/rounds/whereabouts/today');
    const body = open.json();
    assert.equal(body.rounds.length, 1);
    assert.equal(body.rounds[0].answer, null);
    assert.equal(body.rounds[0].photo, `/api/rounds/photo/${items[0]}.jpg`);
    const first = PLACES.get(items[0]!)!;
    assert.ok(!open.body.includes(String(first.lat)) && !open.body.includes(first.source), 'nothing gives the place away');
    assert.ok(!open.body.includes(items[1]!), 'nor the next photo');

    // Today's first photo, yes. The second, not until the first is guessed.
    assert.equal((await get('ace', `/api/rounds/photo/${items[0]}.jpg`)).statusCode, 200);
    assert.equal((await get('ace', `/api/rounds/photo/${items[1]}.jpg`)).statusCode, 404);
    // One that no day has had is not there at all.
    const unused = [...PLACES.keys()].find((id) => !items.includes(id))!;
    assert.equal((await get('ace', `/api/rounds/photo/${unused}.jpg`)).statusCode, 404);
    assert.equal((await get('ace', '/api/rounds/photo/..%2F..%2Fsecret.jpg')).statusCode, 404);

    assert.equal((await post('ace', '/api/rounds/whereabouts/guess', { guess: { lat: 200, lng: 0 } })).statusCode, 400);
    // Spot on, then a degree north every time after.
    let now = (await post('ace', '/api/rounds/whereabouts/guess', { guess: { lat: first.lat, lng: first.lng } })).json();
    assert.equal(now.rounds[0].points, 5000);
    assert.equal(now.rounds[0].answer.lat, first.lat);
    assert.equal(now.rounds.length, 2, 'the next round opens');
    assert.equal((await get('ace', `/api/rounds/photo/${items[1]}.jpg`)).statusCode, 200);
    for (const id of items.slice(1)) {
      const place = PLACES.get(id)!;
      now = (await post('ace', '/api/rounds/whereabouts/guess', { guess: { lat: place.lat + 1, lng: place.lng } })).json();
    }
    const degree = wherePoints(kmBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }));
    assert.equal(now.state, 'done');
    assert.equal(now.score, 5000 + 4 * degree);
    assert.equal(now.stats.played, 1);
    assert.equal((await post('ace', '/api/rounds/whereabouts/guess', { guess: { lat: 0, lng: 0 } })).json().code, 'finished');

    const board = (await get('flop', `/api/rounds/whereabouts/servers/${serverId}`)).json();
    assert.deepEqual(board.finishes, [{ userId: people.ace!.id, score: 5000 + 4 * degree, points: [5000, degree, degree, degree, degree] }]);
    assert.equal(board.standings[0].total, 5000 + 4 * degree);
  });

  it('a game that is not out is not there: no day, no board, no photos', async () => {
    const was = ROUNDS_OPEN.lowball;
    ROUNDS_OPEN.lowball = false;
    try {
      assert.equal((await get('flop', '/api/rounds/lowball/today')).statusCode, 400);
      assert.equal((await post('flop', '/api/rounds/lowball/guess', { guess: 100_000 })).statusCode, 400);
      assert.equal((await get('flop', `/api/rounds/lowball/servers/${serverId}`)).statusCode, 400);
      assert.equal((await get('flop', `/api/rounds/photo/h_${hex(0)}_1.jpg`)).statusCode, 404);
    } finally {
      ROUNDS_OPEN.lowball = was;
    }
  });

  it('lowball: the price only with the guess, and the photos only of homes reached', async () => {
    const items = await itemsFor('lowball', roundsDay('lowball'));
    const open = await get('flop', '/api/rounds/lowball/today');
    const body = open.json();
    const first = HOMES.get(items[0]!)!;
    assert.equal(body.rounds[0].answer, null);
    assert.deepEqual(body.rounds[0].photos, [`/api/rounds/photo/${items[0]}_1.jpg`, `/api/rounds/photo/${items[0]}_2.jpg`]);
    assert.equal(body.rounds[0].city, 'Chattanooga');
    assert.ok(!open.body.includes(String(first.price)), 'no price before the guess');
    assert.equal((await get('flop', `/api/rounds/photo/${items[1]}_1.jpg`)).statusCode, 404);

    assert.equal((await post('flop', '/api/rounds/lowball/guess', { guess: 'lots' })).statusCode, 400);
    const now = (await post('flop', '/api/rounds/lowball/guess', { guess: first.price * 2 })).json();
    assert.equal(now.rounds[0].answer.price, first.price);
    assert.equal(now.rounds[0].points, lowballPoints(first.price * 2, first.price));
    assert.equal(now.state, 'playing');
    // Someone else's progress does not open photos for you.
    assert.equal((await get('ace', `/api/rounds/photo/${items[1]}_2.jpg`)).statusCode, 404);
    assert.equal((await get('flop', `/api/rounds/photo/${items[1]}_2.jpg`)).statusCode, 200);
  });
});

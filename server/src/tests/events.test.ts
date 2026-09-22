/**
 * Events: the reminder query, and who may plan one.
 *
 * Needs a real database, like the upload sweep test, because both things
 * under test are queries: which events a pass claims, and whether the create
 * route refuses a member without Manage events. PGlite, migrated the way the
 * real server migrates itself, in a throwaway directory.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// config.ts resolves paths off DATA_DIR when it is first imported, so this
// has to happen before anything below is loaded.
const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-events-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations, getDb } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { eventRsvps, events, memberRoles, members, roles, servers, users } = await import('../db/schema.js');
const { uuidv7 } = await import('../lib/ids.js');
const { claimDueReminders } = await import('../services/events.js');
const { createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { Permission, DEFAULT_EVERYONE_PERMISSIONS } = await import('@scryproof/shared');
const { eq } = await import('drizzle-orm');

const NOW = new Date('2026-03-06T18:00:00Z');
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

async function makeUser(name: string) {
  const [user] = await getDb()
    .insert(users)
    .values({ id: uuidv7(), username: name, displayName: name, passwordHash: 'not-a-real-hash' })
    .returning();
  if (!user) throw new Error('could not make a user');
  return user;
}

describe('events', () => {
  let ownerId: string;
  let serverId: string;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);

    const owner = await makeUser('owner');
    ownerId = owner.id;
    serverId = uuidv7();
    const db = getDb();
    await db.insert(servers).values({ id: serverId, name: 'The table', ownerId });
    await db.insert(roles).values({
      id: uuidv7(),
      serverId,
      name: '@everyone',
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
      isEveryone: true,
    });
    await db.insert(members).values({ serverId, userId: ownerId });
  });

  after(async () => {
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe('claimDueReminders', () => {
    it('claims only events starting within the hour, once, for Going and Maybe', async () => {
      const db = getDb();

      const going = await makeUser('going');
      const maybe = await makeUser('maybe');
      const cannot = await makeUser('cannot');
      const departed = await makeUser('departed');
      for (const user of [going, maybe, cannot]) {
        await db.insert(members).values({ serverId, userId: user.id });
      }
      // `departed` answered and then left: no member row.

      const plan = async (title: string, startsAt: Date, remindedAt: Date | null = null) => {
        const id = uuidv7();
        await db.insert(events).values({ id, serverId, title, startsAt, createdBy: ownerId, remindedAt });
        return id;
      };

      const soon = await plan('Session 12', minutesFromNow(30));
      const later = await plan('Session 13', minutesFromNow(90));
      const started = await plan('Already on', minutesFromNow(-10));
      const done = await plan('Reminded already', minutesFromNow(20), minutesFromNow(-40));
      const edge = await plan('Exactly an hour', minutesFromNow(60));

      await db.insert(eventRsvps).values([
        { eventId: soon, userId: going.id, answer: 'going' },
        { eventId: soon, userId: maybe.id, answer: 'maybe' },
        { eventId: soon, userId: cannot.id, answer: 'no' },
        { eventId: soon, userId: departed.id, answer: 'going' },
        { eventId: later, userId: going.id, answer: 'going' },
        { eventId: started, userId: going.id, answer: 'going' },
        { eventId: done, userId: going.id, answer: 'going' },
      ]);

      const due = await claimDueReminders(NOW);
      const byId = new Map(due.map((entry) => [entry.event.id, entry]));

      assert.deepEqual([...byId.keys()].sort(), [soon, edge].sort());
      assert.deepEqual(byId.get(soon)?.userIds.sort(), [going.id, maybe.id].sort());
      assert.deepEqual(byId.get(edge)?.userIds, []);

      const [claimed] = await db.select().from(events).where(eq(events.id, soon));
      assert.equal(claimed?.remindedAt?.getTime(), NOW.getTime());

      // The next pass a minute later finds nothing: each reminder goes out once.
      assert.deepEqual(await claimDueReminders(minutesFromNow(1)), []);

      // An hour on, the later event comes into range and is claimed in its turn.
      const next = await claimDueReminders(minutesFromNow(31));
      assert.deepEqual(
        next.map((entry) => entry.event.id),
        [later],
      );
    });
  });

  describe('creating an event', () => {
    const body = () => ({ title: 'Session 14', startsAt: new Date(Date.now() + 86_400_000).toISOString() });

    it('refuses a member without Manage events, and stores nothing', async () => {
      const app = await buildApp();
      const member = await makeUser('plain');
      await getDb().insert(members).values({ serverId, userId: member.id });
      const session = await createSession(member, null);

      const before = await getDb().select().from(events).where(eq(events.serverId, serverId));
      const response = await app.inject({
        method: 'POST',
        url: `/api/servers/${serverId}/events`,
        headers: { cookie: `${config.cookieName}=${session.token}` },
        payload: body(),
      });
      assert.equal(response.statusCode, 403);

      const after = await getDb().select().from(events).where(eq(events.serverId, serverId));
      assert.equal(after.length, before.length);
      await app.close();
    });

    it('lets a member whose role grants it, and the owner, create one', async () => {
      const app = await buildApp();
      const db = getDb();

      const planner = await makeUser('planner');
      await db.insert(members).values({ serverId, userId: planner.id });
      const roleId = uuidv7();
      await db.insert(roles).values({
        id: roleId,
        serverId,
        name: 'Game master',
        position: 1,
        permissions: Permission.MANAGE_EVENTS,
      });
      await db.insert(memberRoles).values({ serverId, userId: planner.id, roleId });

      const owner = (await db.select().from(users).where(eq(users.id, ownerId)))[0];
      if (!owner) throw new Error('owner went missing');

      for (const user of [planner, owner]) {
        const session = await createSession(user, null);
        const response = await app.inject({
          method: 'POST',
          url: `/api/servers/${serverId}/events`,
          headers: { cookie: `${config.cookieName}=${session.token}` },
          payload: body(),
        });
        assert.equal(response.statusCode, 200, response.body);
        const created = response.json() as { event: { title: string; myAnswer: unknown } };
        assert.equal(created.event.title, 'Session 14');
        assert.equal(created.event.myAnswer, null);
      }
      await app.close();
    });

    it('refuses a time that has already passed', async () => {
      const app = await buildApp();
      const owner = (await getDb().select().from(users).where(eq(users.id, ownerId)))[0];
      if (!owner) throw new Error('owner went missing');
      const session = await createSession(owner, null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/servers/${serverId}/events`,
        headers: { cookie: `${config.cookieName}=${session.token}` },
        payload: { title: 'Last week', startsAt: new Date(Date.now() - 60_000).toISOString() },
      });
      assert.equal(response.statusCode, 400);
      await app.close();
    });
  });
});

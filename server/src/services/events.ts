/**
 * Events: the "Coming up" list, and the reminder an hour before.
 *
 * Database only. Nothing here talks to a socket, so the reminder query can be
 * tested against a real database with a fixed clock, and so the file that
 * builds the ready frame can use it without pulling in the gateway.
 */

import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import type { RsvpAnswer, ScheduledEvent, ScheduledEventBase } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { eventRsvps, events, members, type EventRow } from '../db/schema.js';

/** How far ahead of the start a reminder goes out. */
export const REMINDER_LEAD_MS = 60 * 60 * 1000;

const emptyCounts = (): Record<RsvpAnswer, number> => ({ going: 0, maybe: 0, no: 0 });

function isAnswer(value: string): value is RsvpAnswer {
  return value === 'going' || value === 'maybe' || value === 'no';
}

/**
 * The wire shape everyone in the server shares.
 *
 * `canSeeChannel` decides whether the channel id is included. An event can
 * name a channel some members cannot see, and the rule everywhere else in
 * this server is that a member is never told a hidden channel's id; so the
 * event still reaches them, without saying where.
 */
export function toWire(
  row: EventRow,
  counts: Record<RsvpAnswer, number>,
  canSeeChannel: (channelId: string) => boolean,
): ScheduledEventBase {
  return {
    id: row.id,
    serverId: row.serverId,
    channelId: row.channelId && canSeeChannel(row.channelId) ? row.channelId : null,
    title: row.title,
    note: row.note,
    startsAt: new Date(row.startsAt).toISOString(),
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    counts,
  };
}

/** Going, Maybe and Can't, counted, for each of a set of events. */
export async function countAnswers(eventIds: readonly string[]): Promise<Map<string, Record<RsvpAnswer, number>>> {
  const result = new Map<string, Record<RsvpAnswer, number>>();
  for (const id of eventIds) result.set(id, emptyCounts());
  if (eventIds.length === 0) return result;

  const rows = await getDb()
    .select({
      eventId: eventRsvps.eventId,
      answer: eventRsvps.answer,
      count: sql<number>`count(*)::int`,
    })
    .from(eventRsvps)
    .where(inArray(eventRsvps.eventId, [...eventIds]))
    .groupBy(eventRsvps.eventId, eventRsvps.answer);

  for (const row of rows) {
    const counts = result.get(row.eventId);
    if (counts && isAnswer(row.answer)) counts[row.answer] = Number(row.count);
  }
  return result;
}

/**
 * The events a member is shown: those that have not started yet, soonest
 * first, each with its counts and this member's own answer.
 */
export async function listUpcoming(
  serverId: string,
  userId: string,
  canSeeChannel: (channelId: string) => boolean,
  now = new Date(),
): Promise<ScheduledEvent[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.serverId, serverId), gte(events.startsAt, now)))
    .orderBy(asc(events.startsAt));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [counts, mine] = await Promise.all([
    countAnswers(ids),
    db
      .select({ eventId: eventRsvps.eventId, answer: eventRsvps.answer })
      .from(eventRsvps)
      .where(and(eq(eventRsvps.userId, userId), inArray(eventRsvps.eventId, ids))),
  ]);
  const myAnswers = new Map(mine.map((row) => [row.eventId, row.answer]));

  return rows.map((row) => {
    const answer = myAnswers.get(row.id);
    return {
      ...toWire(row, counts.get(row.id) ?? emptyCounts(), canSeeChannel),
      myAnswer: answer && isAnswer(answer) ? answer : null,
    };
  });
}

/** How many events in a server are still to come. The cap on creating counts these. */
export async function countUpcoming(serverId: string, now = new Date()): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.serverId, serverId), gte(events.startsAt, now)));
  return Number(row?.count ?? 0);
}

export interface DueReminder {
  event: EventRow;
  /** Current members who answered Going or Maybe. */
  userIds: string[];
}

/**
 * Claim every event that starts within the next hour and has not been
 * reminded about, and say who to remind.
 *
 * The claim is one UPDATE ... RETURNING, so an event is marked in the same
 * statement that finds it and can never be handed out twice. An event whose
 * start has already passed is not claimed: a reminder that arrives after the
 * thing began is noise, which is what a restart across the start time would
 * otherwise produce.
 *
 * Only people still in the server are reminded. An answer outlives leaving,
 * since nothing deletes it, but the reminder should not.
 */
export async function claimDueReminders(now = new Date()): Promise<DueReminder[]> {
  const db = getDb();
  const horizon = new Date(now.getTime() + REMINDER_LEAD_MS);

  const claimed = await db
    .update(events)
    .set({ remindedAt: now })
    .where(and(isNull(events.remindedAt), gt(events.startsAt, now), lte(events.startsAt, horizon)))
    .returning();
  if (claimed.length === 0) return [];

  const answers = await db
    .select({ eventId: eventRsvps.eventId, userId: eventRsvps.userId })
    .from(eventRsvps)
    .innerJoin(events, eq(events.id, eventRsvps.eventId))
    .innerJoin(members, and(eq(members.serverId, events.serverId), eq(members.userId, eventRsvps.userId)))
    .where(
      and(
        inArray(
          eventRsvps.eventId,
          claimed.map((row) => row.id),
        ),
        inArray(eventRsvps.answer, ['going', 'maybe']),
      ),
    );

  return claimed.map((event) => ({
    event,
    userIds: answers.filter((row) => row.eventId === event.id).map((row) => row.userId),
  }));
}

/**
 * Events: "Session 12, Friday 7pm, #voice-table", and who is coming.
 *
 * Planning, editing and cancelling need MANAGE_EVENTS. Seeing the list and
 * answering Going, Maybe or Can't need only membership. Both are decided
 * here; the client merely hides the "+" from people who would be refused.
 *
 * The reminder an hour before is not a route. It is the pass in
 * `services/event-reminders.ts`.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission, has } from '@scryproof/shared';
import type { ScheduledEvent, ServerEvent } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { channels, eventRsvps, events, type EventRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as audit from '../services/audit.js';
import { countAnswers, countUpcoming, listUpcoming, toWire } from '../services/events.js';
import {
  computePermissionsInChannel,
  requireMember,
  requireServerPermission,
  type MemberContext,
} from '../services/permissions.js';
import { visibleChannelIds } from '../services/server-detail.js';

const params = z.object({ serverId: z.string() });
const eventParams = z.object({ serverId: z.string(), eventId: z.string() });

/**
 * A moment, as the client sends it: an ISO string in UTC, made from the
 * viewer's own clock and zone by the browser. Anything Date cannot read is
 * refused here rather than stored as an invalid date.
 */
const moment = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), 'That is not a date and time.');

const eventBody = z.object({
  title: z.string(),
  note: z.string().max(LIMITS.eventNote.max).optional(),
  startsAt: moment,
  channelId: z.string().nullable().optional(),
});

const answerBody = z.object({
  /** Null takes an answer back. */
  answer: z.enum(['going', 'maybe', 'no']).nullable(),
});

function cleanTitle(value: string): string {
  const title = value.trim();
  if (title.length < LIMITS.eventTitle.min) throw badRequest('An event needs a title.', 'invalid_event_title');
  if (title.length > LIMITS.eventTitle.max) {
    throw badRequest(`A title can be at most ${LIMITS.eventTitle.max} characters.`, 'invalid_event_title');
  }
  return title;
}

/** Planning something for a time that has already gone is a mistake worth saying out loud. */
function futureStart(value: string, now = new Date()): Date {
  const startsAt = new Date(value);
  if (startsAt.getTime() <= now.getTime()) {
    throw badRequest('That time has already passed. Pick one still to come.', 'event_in_past');
  }
  return startsAt;
}

/**
 * The channel an event is held in has to be one of this server's, and one the
 * person planning it can see: naming a channel you cannot see would tell the
 * people who can that you know it exists, and "does not exist" is the answer
 * this server gives for a hidden channel everywhere else.
 */
async function checkChannel(ctx: MemberContext, channelId: string): Promise<string> {
  const [channel] = await getDb()
    .select({ id: channels.id, serverId: channels.serverId, categoryId: channels.categoryId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel || channel.serverId !== ctx.serverId) {
    throw notFound('That channel does not exist.', 'unknown_channel');
  }
  const permissions = await computePermissionsInChannel(ctx, channel.id, channel.categoryId);
  if (!has(permissions, Permission.VIEW_CHANNEL)) {
    throw notFound('That channel does not exist.', 'unknown_channel');
  }
  return channel.id;
}

async function findEvent(serverId: string, eventId: string): Promise<EventRow> {
  const [row] = await getDb()
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.serverId, serverId)))
    .limit(1);
  if (!row) throw notFound('That event does not exist.', 'unknown_event');
  return row;
}

/** The event as the caller should see it, with their own answer. */
async function viewFor(ctx: MemberContext, row: EventRow): Promise<ScheduledEvent> {
  const db = getDb();
  const [counts, visible, [mine]] = await Promise.all([
    countAnswers([row.id]),
    visibleChannelIds(ctx),
    db
      .select({ answer: eventRsvps.answer })
      .from(eventRsvps)
      .where(and(eq(eventRsvps.eventId, row.id), eq(eventRsvps.userId, ctx.userId)))
      .limit(1),
  ]);
  const answer = mine?.answer;
  return {
    ...toWire(row, counts.get(row.id) ?? { going: 0, maybe: 0, no: 0 }, (id) => visible.has(id)),
    myAnswer: answer === 'going' || answer === 'maybe' || answer === 'no' ? answer : null,
  };
}

/**
 * Tell everyone in the server. Those who can see the event's channel get its
 * id; everyone else gets the same event without it.
 */
async function announce(row: EventRow, kind: 'event_create' | 'event_update'): Promise<void> {
  const counts = (await countAnswers([row.id])).get(row.id) ?? { going: 0, maybe: 0, no: 0 };
  const build = (canSee: boolean): ServerEvent => {
    const base = toWire(row, counts, () => canSee);
    // A new event has no answers yet, so nobody's own answer is anything but none.
    return kind === 'event_create' ? { t: kind, d: { ...base, myAnswer: null } } : { t: kind, d: base };
  };

  if (row.channelId) {
    await hub.broadcastToServerSplitByChannel(row.serverId, row.channelId, build(true), build(false));
  } else {
    hub.broadcastToServer(row.serverId, build(false));
  }
}

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/servers/:serverId/events', async (request) => {
    const user = requireUser(request);
    const { serverId } = params.parse(request.params);

    const ctx = await requireMember(serverId, user.id);
    const visible = await visibleChannelIds(ctx);

    return { events: await listUpcoming(serverId, user.id, (id) => visible.has(id)) };
  });

  app.post('/api/servers/:serverId/events', async (request) => {
    const user = requireUser(request);
    const { serverId } = params.parse(request.params);
    const body = eventBody.parse(request.body);

    const ctx = await requireServerPermission(serverId, user.id, Permission.MANAGE_EVENTS);

    const title = cleanTitle(body.title);
    const startsAt = futureStart(body.startsAt);
    const channelId = body.channelId ? await checkChannel(ctx, body.channelId) : null;

    if ((await countUpcoming(serverId)) >= LIMITS.eventsPerServer) {
      throw badRequest(
        `A server can have ${LIMITS.eventsPerServer} events coming up at once. Cancel one first.`,
        'too_many_events',
      );
    }

    const [created] = await getDb()
      .insert(events)
      .values({
        id: uuidv7(),
        serverId,
        channelId,
        title,
        note: (body.note ?? '').trim(),
        startsAt,
        createdBy: user.id,
      })
      .returning();
    if (!created) throw badRequest('Could not create the event.', 'create_failed');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'event.create',
      targetType: 'event',
      targetId: created.id,
      changes: { title, startsAt: startsAt.toISOString() },
    });

    await announce(created, 'event_create');

    return { event: await viewFor(ctx, created) };
  });

  app.patch('/api/servers/:serverId/events/:eventId', async (request) => {
    const user = requireUser(request);
    const { serverId, eventId } = eventParams.parse(request.params);
    const body = eventBody.partial().parse(request.body);

    const ctx = await requireServerPermission(serverId, user.id, Permission.MANAGE_EVENTS);
    const existing = await findEvent(serverId, eventId);

    const title = body.title === undefined ? undefined : cleanTitle(body.title);
    const startsAt = body.startsAt === undefined ? undefined : futureStart(body.startsAt);
    const channelId =
      body.channelId === undefined ? undefined : body.channelId ? await checkChannel(ctx, body.channelId) : null;
    // A moved event gets a reminder for its new time, even if the old one went out.
    const moved = startsAt !== undefined && startsAt.getTime() !== existing.startsAt.getTime();

    const [updated] = await getDb()
      .update(events)
      .set({
        ...(title !== undefined ? { title } : {}),
        ...(body.note !== undefined ? { note: body.note.trim() } : {}),
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(channelId !== undefined ? { channelId } : {}),
        ...(moved ? { remindedAt: null } : {}),
      })
      .where(eq(events.id, eventId))
      .returning();
    if (!updated) throw notFound('That event does not exist.', 'unknown_event');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'event.update',
      targetType: 'event',
      targetId: eventId,
      changes: { title: updated.title, ...(moved ? { startsAt: updated.startsAt.toISOString() } : {}) },
    });

    await announce(updated, 'event_update');

    return { event: await viewFor(ctx, updated) };
  });

  app.delete('/api/servers/:serverId/events/:eventId', async (request) => {
    const user = requireUser(request);
    const { serverId, eventId } = eventParams.parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_EVENTS);
    const existing = await findEvent(serverId, eventId);

    // The answers go with it, by the foreign key's cascade.
    await getDb().delete(events).where(eq(events.id, eventId));

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'event.delete',
      targetType: 'event',
      targetId: eventId,
      changes: { title: existing.title },
    });

    hub.broadcastToServer(serverId, { t: 'event_delete', d: { id: eventId, serverId } });

    return { ok: true };
  });

  app.put('/api/servers/:serverId/events/:eventId/rsvp', async (request) => {
    const user = requireUser(request);
    const { serverId, eventId } = eventParams.parse(request.params);
    const { answer } = answerBody.parse(request.body);

    await requireMember(serverId, user.id);
    await findEvent(serverId, eventId);

    const db = getDb();
    if (answer === null) {
      await db.delete(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, user.id)));
    } else {
      // The primary key on the pair makes a second answer a change of mind.
      await db
        .insert(eventRsvps)
        .values({ eventId, userId: user.id, answer })
        .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { answer } });
    }

    const counts = (await countAnswers([eventId])).get(eventId) ?? { going: 0, maybe: 0, no: 0 };

    // The whole count goes out rather than a plus-one, so a missed event
    // cannot leave anyone's numbers wrong for good.
    hub.broadcastToServer(serverId, {
      t: 'event_rsvp',
      d: { eventId, serverId, userId: user.id, answer, counts },
    });

    return { answer, counts };
  });
}

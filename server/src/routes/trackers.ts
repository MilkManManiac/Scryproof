/**
 * The initiative tracker: `/init` in a text channel, and a turn order the
 * whole channel sees.
 *
 * Who may do what is decided here, never by the client:
 *
 *   - Seeing it takes what reading the channel takes.
 *   - Starting one, and adding yourself, takes what posting a message takes.
 *   - Everything else (adding someone else, removing, reordering, the next
 *     turn, ending it) is for whoever started it, or anyone with Manage
 *     messages in the channel. The same rule closes a poll.
 *
 * Every change sends the whole tracker to everyone reading the channel as
 * `tracker_update`. Whole, not a delta, so a client that missed one event is
 * right again at the next.
 *
 * The turn arithmetic lives in `shared/src/initiative.ts`, where it is tested
 * without a database. This file only loads, checks, stores and announces.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  INITIATIVE_LIMITS,
  Permission,
  endedLine,
  formatRoll,
  has,
  insertByInitiative,
  nextTurn,
  parseRoll,
  removeEntry,
  reorderEntries,
  roll as rollDice,
} from '@scryproof/shared';
import type { Tracker, TrackerEntry } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { channels, members, messages, trackers, type TrackerRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import { rollDie } from '../lib/crypto.js';
import { uuidv7 } from '../lib/ids.js';
import { assertNotTimedOut, requireChannelPermission, type ChannelContext } from '../services/permissions.js';
import { hydrate } from './messages.js';

/** Reading the tracker needs the same as reading the messages beside it. */
const READ = Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY;

const params = z.object({ channelId: z.string() });
const entryParams = z.object({ channelId: z.string(), entryId: z.string() });

const addBody = z.object({
  name: z.string().max(200),
  /** A number typed in. Exactly one of this and `roll`. */
  initiative: z
    .number()
    .int()
    .min(INITIATIVE_LIMITS.initiative.min)
    .max(INITIATIVE_LIMITS.initiative.max)
    .optional(),
  /** `d20+3`, rolled here the way `/roll` is. */
  roll: z.string().max(100).optional(),
  /**
   * Left out: the caller, adding themselves. Null: nobody in particular, a
   * monster. An id: that member. Only the last two need control.
   */
  userId: z.string().nullable().optional(),
});

const orderBody = z.object({ order: z.array(z.string()).max(INITIATIVE_LIMITS.maxEntries) });

function toWire(row: TrackerRow): Tracker {
  return {
    channelId: row.channelId,
    startedBy: row.startedBy,
    round: row.round,
    turn: row.turn,
    entries: row.entries,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function announce(ctx: ChannelContext, channelId: string, tracker: Tracker | null): Promise<void> {
  await hub.broadcastToChannel(ctx.serverId, channelId, { t: 'tracker_update', d: { channelId, tracker } }, READ);
}

/**
 * A tracker belongs in a readable text channel. An encrypted channel is
 * refused rather than served: the tracker is plaintext the server keeps, and
 * putting it beside messages the server cannot read would make the channel
 * less private than its lock says it is.
 */
async function requireTrackableChannel(channelId: string): Promise<void> {
  const [channel] = await getDb()
    .select({ type: channels.type, encrypted: channels.encrypted })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');
  if (channel.type !== 'text') throw badRequest('Initiative runs in a text channel.', 'not_text_channel');
  if (channel.encrypted) {
    throw badRequest('Initiative is not available in an encrypted channel.', 'encryption_required');
  }
}

/** The caller may post here: the bar for starting a fight and for joining one. */
async function requirePoster(channelId: string, userId: string): Promise<ChannelContext> {
  const ctx = await requireChannelPermission(channelId, userId, Permission.SEND_MESSAGES);
  assertNotTimedOut(ctx);
  return ctx;
}

/** Whoever started it, or anyone who could moderate the channel's messages. */
function controls(ctx: ChannelContext, row: TrackerRow): boolean {
  return row.startedBy === ctx.userId || has(ctx.channelPermissions, Permission.MANAGE_MESSAGES);
}

function requireControl(ctx: ChannelContext, row: TrackerRow): void {
  if (!controls(ctx, row)) {
    throw forbidden('Only whoever started initiative, or someone who can manage messages, can do that.');
  }
}

const noTracker = () => notFound('There is no initiative running in this channel.', 'no_tracker');

/**
 * Change one tracker under a row lock, so two people pressing Next at the
 * same moment move the turn twice rather than once with one click lost.
 * `change` sees the row as it is now and returns the columns to write.
 */
async function update(
  channelId: string,
  change: (row: TrackerRow) => Partial<Pick<TrackerRow, 'round' | 'turn' | 'entries'>>,
): Promise<TrackerRow> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(trackers).where(eq(trackers.channelId, channelId)).limit(1).for('update');
    if (!row) throw noTracker();
    const patch = change(row);
    const [updated] = await tx
      .update(trackers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(trackers.channelId, channelId))
      .returning();
    if (!updated) throw noTracker();
    return updated;
  });
}

/**
 * The line history keeps: "Initiative started", in the name of whoever
 * started it. A plain message like any other, so it can be replied to,
 * searched for and deleted; it pings nobody.
 */
async function postLine(ctx: ChannelContext, channelId: string, content: string): Promise<void> {
  const db = getDb();
  const id = uuidv7();
  const [created] = await db
    .insert(messages)
    .values({ id, channelId, authorId: ctx.userId, content, kind: 'text' })
    .returning();
  if (!created) return;
  await db.update(channels).set({ lastMessageId: id }).where(eq(channels.id, channelId));

  const [hydrated] = await hydrate([created]);
  if (!hydrated) return;
  await hub.broadcastToChannel(ctx.serverId, channelId, { t: 'message_create', d: hydrated }, READ);
}

function cleanName(value: string): string {
  const name = value.trim();
  if (name.length < INITIATIVE_LIMITS.name.min) throw badRequest('A combatant needs a name.', 'invalid_name');
  if (name.length > INITIATIVE_LIMITS.name.max) {
    throw badRequest(`A name can be at most ${INITIATIVE_LIMITS.name.max} characters.`, 'invalid_name');
  }
  return name;
}

export async function registerTrackerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/channels/:channelId/tracker', async (request) => {
    const user = requireUser(request);
    const { channelId } = params.parse(request.params);

    await requireChannelPermission(channelId, user.id, READ);

    const [row] = await getDb().select().from(trackers).where(eq(trackers.channelId, channelId)).limit(1);
    return { tracker: row ? toWire(row) : null };
  });

  /**
   * Start one. If one is already running, that one comes back unchanged and
   * nothing is posted: `/init` in a channel mid-fight means "show me the
   * fight", not "start a second one".
   */
  app.post('/api/channels/:channelId/tracker', async (request) => {
    const user = requireUser(request);
    const { channelId } = params.parse(request.params);

    const ctx = await requirePoster(channelId, user.id);
    await requireTrackableChannel(channelId);

    const db = getDb();
    const [created] = await db
      .insert(trackers)
      .values({ channelId, startedBy: user.id })
      .onConflictDoNothing({ target: trackers.channelId })
      .returning();

    if (!created) {
      const [existing] = await db.select().from(trackers).where(eq(trackers.channelId, channelId)).limit(1);
      if (!existing) throw noTracker();
      return { tracker: toWire(existing) };
    }

    const tracker = toWire(created);
    await announce(ctx, channelId, tracker);
    await postLine(ctx, channelId, 'Initiative started.');
    return { tracker };
  });

  app.post('/api/channels/:channelId/tracker/entries', async (request) => {
    const user = requireUser(request);
    const { channelId } = params.parse(request.params);
    const body = addBody.parse(request.body);

    const ctx = await requirePoster(channelId, user.id);

    const name = cleanName(body.name);
    if ((body.initiative === undefined) === (body.roll === undefined)) {
      throw badRequest('Give a number or a roll, like 15 or d20+3.', 'invalid_initiative');
    }

    // Rolled before the lock is taken: the dice do not need the row, and a
    // bad expression should be refused without touching anything.
    let initiative = body.initiative ?? 0;
    let note = '';
    if (body.roll !== undefined) {
      const parsed = parseRoll(body.roll);
      if (!parsed.ok) throw badRequest(parsed.error, 'bad_roll');
      const result = rollDice(parsed.roll, rollDie);
      initiative = result.total;
      note = formatRoll(parsed.roll, result);
    }

    const self = body.userId === undefined || body.userId === user.id;
    const userId = body.userId === undefined ? user.id : body.userId;

    // Someone else has to be a member of this server, or their avatar would
    // be a way to put a stranger's face in the fight.
    if (userId && userId !== user.id) {
      const [member] = await getDb()
        .select({ userId: members.userId })
        .from(members)
        .where(and(eq(members.serverId, ctx.serverId), eq(members.userId, userId)))
        .limit(1);
      if (!member) throw badRequest('That person is not in this server.', 'unknown_member');
    }

    const updated = await update(channelId, (row) => {
      if (!self) requireControl(ctx, row);
      if (row.entries.length >= INITIATIVE_LIMITS.maxEntries) {
        throw badRequest(`A fight can have at most ${INITIATIVE_LIMITS.maxEntries} combatants.`, 'too_many_entries');
      }
      if (userId && row.entries.some((entry) => entry.userId === userId)) {
        throw badRequest(
          self ? 'You are already in the order.' : 'That person is already in the order.',
          'already_in_order',
        );
      }
      const entry: TrackerEntry = { id: uuidv7(), name, userId, initiative, note };
      return insertByInitiative(row, entry);
    });

    const tracker = toWire(updated);
    await announce(ctx, channelId, tracker);
    return { tracker };
  });

  app.delete('/api/channels/:channelId/tracker/entries/:entryId', async (request) => {
    const user = requireUser(request);
    const { channelId, entryId } = entryParams.parse(request.params);

    const ctx = await requirePoster(channelId, user.id);

    const updated = await update(channelId, (row) => {
      requireControl(ctx, row);
      const next = removeEntry(row, entryId);
      if (!next) throw notFound('That combatant is not in the order.', 'unknown_entry');
      return next;
    });

    const tracker = toWire(updated);
    await announce(ctx, channelId, tracker);
    return { tracker };
  });

  /** A new order for the same people, by id. For ties, surprise rounds and the DM's word. */
  app.put('/api/channels/:channelId/tracker/entries', async (request) => {
    const user = requireUser(request);
    const { channelId } = params.parse(request.params);
    const { order } = orderBody.parse(request.body);

    const ctx = await requirePoster(channelId, user.id);

    const updated = await update(channelId, (row) => {
      requireControl(ctx, row);
      const next = reorderEntries(row, order);
      if (!next) {
        throw badRequest('That order has to name everyone in the fight exactly once.', 'invalid_order');
      }
      return next;
    });

    const tracker = toWire(updated);
    await announce(ctx, channelId, tracker);
    return { tracker };
  });

  app.post('/api/channels/:channelId/tracker/next', async (request) => {
    const user = requireUser(request);
    const { channelId } = params.parse(request.params);

    const ctx = await requirePoster(channelId, user.id);

    const updated = await update(channelId, (row) => {
      requireControl(ctx, row);
      if (row.entries.length === 0) throw badRequest('Nobody is in the order yet.', 'empty_order');
      return nextTurn(row);
    });

    const tracker = toWire(updated);
    await announce(ctx, channelId, tracker);
    return { tracker };
  });

  app.delete('/api/channels/:channelId/tracker', async (request) => {
    const user = requireUser(request);
    const { channelId } = params.parse(request.params);

    const ctx = await requirePoster(channelId, user.id);

    const ended = await getDb().transaction(async (tx) => {
      const [row] = await tx.select().from(trackers).where(eq(trackers.channelId, channelId)).limit(1).for('update');
      if (!row) throw noTracker();
      requireControl(ctx, row);
      await tx.delete(trackers).where(eq(trackers.channelId, channelId));
      return row;
    });

    await announce(ctx, channelId, null);
    await postLine(ctx, channelId, endedLine(ended.round));
    return { ok: true };
  });
}

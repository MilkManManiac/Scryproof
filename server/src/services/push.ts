/**
 * Waking a phone when something happens that its person asked to hear about:
 * a direct message, a mention, or (if the phone's own settings say so) any
 * message in a channel they can see. (Wes, 2026-09-26: "a noise or a number
 * next to the app that shows if you have a message".)
 *
 * The ping itself is empty (`lib/web-push.ts`). When it lands, the phone's
 * service worker asks us what it was about (`pendingFor`), over its own
 * connection with its own session, and draws the notification from the
 * answer. So Apple and Google see that a phone was woken and when; who wrote,
 * where, and what never leave this box except to that phone.
 *
 * And even that phone's lock screen names nobody and no place: "Someone
 * messaged you", "Someone mentioned you", "New message in a channel". (Wes,
 * 2026-09-26: "It shouldn't show any bit of the message... someone messaged
 * you. or someone mentioned you.") A locked phone is read by whoever is
 * holding it. Tapping it still opens the right conversation.
 *
 * What the phone is told is kept in memory for an hour and then forgotten. A
 * restart loses it, and the phone falls back to "Something new for you".
 * Nothing about who pinged whom is written to the database (GAMEPLAN 1b: no
 * record of who talks to whom that we did not decide to keep).
 *
 * A phone is never woken while it is itself the window being looked at. While
 * its person is at another window (a computer), it is still woken unless that
 * phone switched it off: plenty of computers sit open all day while their
 * people are out (Wes, 2026-09-27).
 */

import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { pushSubscriptions, sessions } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { logger } from '../lib/logger.js';
import { type PingResult, lastPingFailure, sendPing, topicFor } from '../lib/web-push.js';
import { pingTargets } from './mentions.js';

export type PingKind = 'dm' | 'mention' | 'message';

/** Everything the lock screen says. Nothing in it comes from the message. */
export const WORDS: Record<PingKind, string> = {
  dm: 'Someone messaged you',
  mention: 'Someone mentioned you',
  message: 'New message in a channel',
};

export interface PingNotice {
  kind: PingKind;
  /** Where a tap goes. Handed only to the phone, never shown on it. */
  serverId: string | null;
  channelId: string | null;
  dmId: string | null;
  messageId: string;
}

interface Ping extends PingNotice {
  at: number;
  /** Subscriptions that have already drawn this one. */
  shownTo: Set<string>;
}

const KEEP_MS = 60 * 60 * 1000;
const KEEP_COUNT = 50;

/** userId -> pings since they last opened the app, newest first. */
const recent = new Map<string, Ping[]>();

type Sender = (endpoint: string, topic: string) => Promise<PingResult>;
let sender: Sender = (endpoint, topic) =>
  config.push ? sendPing(endpoint, config.push, topic) : Promise.resolve('failed');

/** For tests: catch the pings instead of sending them. */
export function setPingSender(next: Sender | null): void {
  sender = next ?? ((endpoint, topic) => (config.push ? sendPing(endpoint, config.push, topic) : Promise.resolve('failed')));
}

export function pushPublicKey(): string | null {
  return config.push?.publicKey ?? null;
}

interface DeviceSettings {
  mutedServers: string[];
  mutedChannels: string[];
  mentions: boolean;
  messages: boolean;
}

/** The device's own settings say this one stays quiet, as its in-app sound would. */
function quiet(row: DeviceSettings, ping: PingNotice): boolean {
  if (ping.serverId !== null && row.mutedServers.includes(ping.serverId)) return true;
  if (ping.channelId !== null && row.mutedChannels.includes(ping.channelId)) return true;
  return ping.kind === 'message' ? !row.messages : !row.mentions;
}

function fresh(userId: string, now = Date.now()): Ping[] {
  const list = (recent.get(userId) ?? []).filter((ping) => now - ping.at < KEEP_MS);
  if (list.length > 0) recent.set(userId, list);
  else recent.delete(userId);
  return list;
}

/** Live subscriptions only: a revoked or expired session wakes nobody. */
async function subscriptionsOf(userIds: string[]) {
  return getDb()
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      mutedServers: pushSubscriptions.mutedServers,
      mutedChannels: pushSubscriptions.mutedChannels,
      mentions: pushSubscriptions.mentions,
      messages: pushSubscriptions.messages,
      evenWhileAttending: pushSubscriptions.evenWhileAttending,
      sessionId: pushSubscriptions.sessionId,
    })
    .from(pushSubscriptions)
    .innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
    .where(
      and(
        inArray(pushSubscriptions.userId, userIds),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    );
}

/**
 * Wake these people's phones about one message. Never throws and is never
 * awaited by the route that sent the message: a slow relay must not hold up
 * the conversation.
 */
export async function pushTo(userIds: readonly string[], notice: PingNotice): Promise<void> {
  if (!config.push || userIds.length === 0) return;
  try {
    const all = await subscriptionsOf([...userIds]);
    // Not the phone in their hand, and not while they are at another window
    // unless this phone asked for that too.
    const looking = new Map<string, Set<string>>();
    const rows = all.filter((row) => {
      let sessions = looking.get(row.userId);
      if (!sessions) looking.set(row.userId, (sessions = hub.attendingSessions(row.userId)));
      if (sessions.has(row.sessionId)) return false;
      return sessions.size === 0 || row.evenWhileAttending;
    });
    if (rows.length === 0) return;

    const now = Date.now();
    for (const userId of new Set(rows.map((row) => row.userId))) {
      const list = [{ ...notice, at: now, shownTo: new Set<string>() }, ...fresh(userId, now)].slice(0, KEEP_COUNT);
      recent.set(userId, list);
    }

    const topic = topicFor(notice.dmId ?? notice.channelId ?? notice.messageId);
    const gone: string[] = [];
    await Promise.all(
      rows
        .filter((row) => !quiet(row, notice))
        .map(async (row) => {
          const result = await sender(row.endpoint, topic);
          if (result === 'gone') gone.push(row.id);
          if (result === 'failed') logger.warn({ reason: lastPingFailure() }, 'push ping failed');
        }),
    );
    if (gone.length > 0) await getDb().delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  } catch (error) {
    logger.error({ error }, 'push failed');
  }
}

/**
 * "New message in a channel", for the phones whose settings ask for every
 * message. Only people who can see the channel, and never anyone the message
 * already pinged (they got "Someone mentioned you"). Asks which people want
 * this before working out who can see the channel, so a busy server with no
 * such phone costs one query.
 */
export async function pushToReaders(input: {
  serverId: string;
  channelId: string;
  categoryId: string | null;
  senderId: string;
  memberIds: ReadonlySet<string>;
  alreadyPinged: readonly string[];
  messageId: string;
}): Promise<void> {
  if (!config.push) return;
  try {
    const skip = new Set([...input.alreadyPinged, input.senderId]);
    const candidates = [...input.memberIds].filter((userId) => !skip.has(userId));
    if (candidates.length === 0) return;

    const listening = await getDb()
      .selectDistinct({ userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(and(inArray(pushSubscriptions.userId, candidates), eq(pushSubscriptions.messages, true)));
    if (listening.length === 0) return;

    // The same test a mention of everyone gets: can see the channel, and has
    // not blocked the sender.
    const readers = await pingTargets({
      serverId: input.serverId,
      channelId: input.channelId,
      categoryId: input.categoryId,
      senderId: input.senderId,
      mentions: { userIds: [], roleIds: [], everyone: true },
      memberIds: new Set(listening.map((row) => row.userId)),
    });
    await pushTo(readers, {
      kind: 'message',
      serverId: input.serverId,
      channelId: input.channelId,
      dmId: null,
      messageId: input.messageId,
    });
  } catch (error) {
    logger.error({ error }, 'push failed');
  }
}

/**
 * What a woken phone should show: what arrived since it last drew anything,
 * and how many are waiting in all, for the number on the icon. Each ping is
 * handed to a device once, so a second wake does not bring back a
 * notification the person already swiped away.
 */
export async function pendingFor(
  userId: string,
  endpoint: string,
): Promise<{ show: (PingNotice & { title: string })[]; unread: number }> {
  const [row] = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .limit(1);
  if (!row) return { show: [], unread: 0 };

  const waiting = fresh(userId).filter((ping) => !quiet(row, ping));
  const show: (PingNotice & { title: string })[] = [];
  for (const ping of waiting) {
    if (ping.shownTo.has(row.id)) continue;
    ping.shownTo.add(row.id);
    if (show.length < 4) {
      const { at: _at, shownTo: _shown, ...notice } = ping;
      show.push({ ...notice, title: WORDS[notice.kind] });
    }
  }
  return { show, unread: waiting.length };
}

/** They opened the app: the icon's number starts again from nothing. */
export function markSeen(userId: string): void {
  recent.delete(userId);
}

/** For tests. */
export function resetPush(): void {
  recent.clear();
}

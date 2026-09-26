/**
 * Waking a phone when something is addressed to its person: a direct message,
 * or a mention in a channel they can see. (Wes, 2026-09-26: "a noise or a
 * number next to the app that shows if you have a message".)
 *
 * The ping itself is empty (`lib/web-push.ts`). When it lands, the phone's
 * service worker asks us what it was about (`pendingFor`), over its own
 * connection with its own session, and draws the notification from the
 * answer. So Apple and Google see that a phone was woken and when; who wrote,
 * where, and what never leave this box except to that phone.
 *
 * What the phone is told is kept in memory for an hour and then forgotten. A
 * restart loses it, and the phone falls back to "New message in Scryproof".
 * Nothing about who pinged whom is written to the database (GAMEPLAN 1b: no
 * record of who talks to whom that we did not decide to keep).
 *
 * Nobody is woken while they are sitting at another of their windows
 * (`hub.isAttending`): the in-app sound and pop-up are already telling them.
 */

import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { pushSubscriptions, sessions } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { logger } from '../lib/logger.js';
import { type PingResult, lastPingFailure, sendPing, topicFor } from '../lib/web-push.js';

export interface PingNotice {
  kind: 'dm' | 'mention';
  /** "milky", "milky in #general", "milky in Friday crew". */
  title: string;
  /** "Sent you a message.", "Mentioned you in The Table." */
  body: string;
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

function mutes(row: { mutedServers: string[]; mutedChannels: string[] }, ping: PingNotice): boolean {
  return (
    (ping.serverId !== null && row.mutedServers.includes(ping.serverId)) ||
    (ping.channelId !== null && row.mutedChannels.includes(ping.channelId))
  );
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
    const away = userIds.filter((userId) => !hub.isAttending(userId));
    if (away.length === 0) return;

    const rows = await subscriptionsOf(away);
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
        .filter((row) => !mutes(row, notice))
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
 * What a woken phone should show: what arrived since it last drew anything,
 * and how many are waiting in all, for the number on the icon. Each ping is
 * handed to a device once, so a second wake does not bring back a
 * notification the person already swiped away.
 */
export async function pendingFor(
  userId: string,
  endpoint: string,
): Promise<{ show: PingNotice[]; unread: number }> {
  const [row] = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .limit(1);
  if (!row) return { show: [], unread: 0 };

  const waiting = fresh(userId).filter((ping) => !mutes(row, ping));
  const show: PingNotice[] = [];
  for (const ping of waiting) {
    if (ping.shownTo.has(row.id)) continue;
    ping.shownTo.add(row.id);
    if (show.length < 4) {
      const { at: _at, shownTo: _shown, ...notice } = ping;
      show.push(notice);
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

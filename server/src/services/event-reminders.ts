/**
 * The reminder an hour before an event.
 *
 * A plain interval in this process, once a minute. That is enough because
 * there is exactly one server process (bonesdeploy runs one systemd unit), so
 * there is nobody else to race for the same reminder, and the claim in
 * `claimDueReminders` would stop a second process sending one twice anyway.
 * No job table, no queue: if the process is down for the hour before an
 * event, that reminder is simply not sent, which is the right failure.
 */

import * as hub from '../gateway/hub.js';
import { logger } from '../lib/logger.js';
import { claimDueReminders } from './events.js';

const INTERVAL_MS = 60 * 1000;

/** One pass: claim what is due and tell each person who said they might come. */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const due = await claimDueReminders(now);
  let sent = 0;
  for (const { event, userIds } of due) {
    for (const userId of userIds) {
      hub.sendToUser(userId, {
        t: 'event_reminder',
        d: {
          eventId: event.id,
          serverId: event.serverId,
          title: event.title,
          startsAt: new Date(event.startsAt).toISOString(),
        },
      });
      sent += 1;
    }
  }
  if (due.length > 0) logger.info({ events: due.length, people: sent }, 'sent event reminders');
  return sent;
}

/** Start the minute-by-minute pass. Returns a function that stops it cleanly. */
export function startEventReminders(): () => void {
  const interval = setInterval(() => {
    void sendDueReminders().catch((error: unknown) => {
      logger.error({ error }, 'event reminders failed');
    });
  }, INTERVAL_MS);
  interval.unref();
  return () => clearInterval(interval);
}

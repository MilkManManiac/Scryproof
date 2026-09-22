/**
 * Events on the client: dates in and out, and keeping the list current.
 *
 * Times travel as ISO strings in UTC and are only ever turned into a zone at
 * the moment they are drawn, in the viewer's own zone. A game at 7pm in New
 * York is 4pm in California, and each of them should read the time they
 * actually have to be there.
 */

import type { RsvpAnswer, ScheduledEvent, ScheduledEventBase } from '@scryproof/shared';

/**
 * What `<input type="datetime-local">` gives back ("2026-09-25T19:00") is a
 * wall-clock time with no zone. The browser's Date reads a string of that
 * shape as local time, which is exactly what the person typing meant.
 */
export function toUtcIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const date = new Date(local);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** The other way, to fill the same input when editing. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const soonFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const laterFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const fullFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * "Fri 7:00 PM" for anything inside the coming week, where the weekday alone
 * cannot be mistaken for another one; the date as well beyond that.
 */
export function whenLabel(iso: string, now = Date.now()): string {
  const at = new Date(iso);
  return at.getTime() - now < SIX_DAYS_MS ? soonFormat.format(at) : laterFormat.format(at);
}

/** Written out in full, for the event's own dialog and for the reminder. */
export function fullWhen(iso: string): string {
  return fullFormat.format(new Date(iso));
}

/**
 * The list as it should be drawn: still to come, soonest first. The server
 * only sends upcoming events, but a list that arrived an hour ago may now hold
 * one that has started, and nothing on the wire says so.
 */
export function upcoming(events: readonly ScheduledEvent[], now = Date.now()): ScheduledEvent[] {
  return events
    .filter((event) => new Date(event.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

/**
 * Add or replace one event. An update arrives without anybody's own answer
 * (the same copy went to everyone), so the answer already held is kept.
 */
export function withEvent(
  events: readonly ScheduledEvent[],
  event: ScheduledEventBase & { myAnswer?: RsvpAnswer | null },
): ScheduledEvent[] {
  const existing = events.find((entry) => entry.id === event.id);
  const myAnswer = event.myAnswer !== undefined ? event.myAnswer : (existing?.myAnswer ?? null);
  const merged: ScheduledEvent = { ...event, myAnswer };
  return existing
    ? events.map((entry) => (entry.id === event.id ? merged : entry))
    : [...events, merged];
}

/** New counts for everyone; a new answer for this person only if it was theirs. */
export function withAnswer(
  events: readonly ScheduledEvent[],
  change: { eventId: string; userId: string; answer: RsvpAnswer | null; counts: Record<RsvpAnswer, number> },
  selfId: string | null,
): ScheduledEvent[] {
  return events.map((entry) =>
    entry.id === change.eventId
      ? {
          ...entry,
          counts: change.counts,
          myAnswer: change.userId === selfId ? change.answer : entry.myAnswer,
        }
      : entry,
  );
}

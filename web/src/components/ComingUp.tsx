/**
 * "Coming up": the next few events, at the top of the channel sidebar, with
 * Going, Maybe and Can't under each.
 *
 * Everyone sees the list and can answer. The "+" and the Edit and Cancel
 * buttons show only for people with Manage events, which is a courtesy: the
 * server refuses anyone else whatever this file draws.
 */

import { useEffect, useState } from 'react';
import { LIMITS, Permission } from '@scryproof/shared';
import type { RsvpAnswer, ScheduledEvent, ServerDetail } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { fullWhen, toLocalInput, toUtcIso, upcoming, whenLabel } from '../lib/events';
import { canOnServer } from '../lib/usePermissions';
import { Modal } from './Modal';

/** The sidebar is narrow; more than this and the channels start below the fold. */
const SHOWN = 3;

const ANSWERS: { answer: RsvpAnswer; label: string }[] = [
  { answer: 'going', label: 'Going' },
  { answer: 'maybe', label: 'Maybe' },
  { answer: 'no', label: 'Can’t' },
];

/**
 * Redraw once a minute, so an event drops off the list when it starts rather
 * than whenever something else happens to redraw the sidebar.
 */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ComingUp({ server }: { server: ServerDetail }) {
  const now = useMinute();
  const canPlan = canOnServer(server, Permission.MANAGE_EVENTS);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'edit'; event: ScheduledEvent } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = upcoming(server.events ?? [], now);
  const opened = list.find((event) => event.id === openId) ?? null;

  // Nothing planned, and nobody here who could plan something: the heading
  // would only be a label over nothing.
  if (list.length === 0 && !canPlan) return null;

  const channelName = (channelId: string | null) => {
    const channel = channelId ? server.channels.find((entry) => entry.id === channelId) : undefined;
    if (!channel) return null;
    return channel.type === 'voice' ? `♫ ${channel.name}` : `#${channel.name}`;
  };

  const answer = (event: ScheduledEvent, choice: RsvpAnswer) => {
    setError(null);
    // Pressing the answer already given takes it back.
    const next = event.myAnswer === choice ? null : choice;
    api.events.answer(server.id, event.id, next).catch((problem) => {
      setError(problem instanceof ApiError ? problem.message : 'Could not send your answer.');
    });
  };

  return (
    <div className="category coming-up">
      <div className="category-row">
        <span className="category-label coming-up-label">Coming up</span>
        {canPlan ? (
          <span className="category-actions coming-up-actions">
            <button
              type="button"
              className="icon-button"
              title="Plan an event"
              onClick={() => setDialog({ kind: 'new' })}
            >
              +
            </button>
          </span>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="category-empty">Nothing planned. Use the + to add a session and everyone can say if they are coming.</p>
      ) : null}

      {error ? <p className="coming-up-error">{error}</p> : null}

      {list.slice(0, SHOWN).map((event) => {
        const where = channelName(event.channelId);
        return (
          <div className="coming-up-event" key={event.id}>
            <button type="button" className="coming-up-title" title="Show the details" onClick={() => setOpenId(event.id)}>
              {event.title}
            </button>
            <div className="coming-up-when" title={fullWhen(event.startsAt)}>
              {whenLabel(event.startsAt, now)}
              {where ? <span className="coming-up-where"> · {where}</span> : null}
            </div>
            <div className="coming-up-answers" role="group" aria-label={`Are you coming to ${event.title}?`}>
              {ANSWERS.map(({ answer: choice, label }) => (
                <button
                  type="button"
                  key={choice}
                  className={event.myAnswer === choice ? 'coming-up-answer chosen' : 'coming-up-answer'}
                  aria-pressed={event.myAnswer === choice}
                  onClick={() => answer(event, choice)}
                >
                  {label} <span className="coming-up-count">{event.counts[choice]}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {list.length > SHOWN ? (
        <p className="coming-up-more">
          And {list.length - SHOWN} more after{' '}
          {list.length - SHOWN === 1 ? 'that' : 'those'}.
        </p>
      ) : null}

      {opened ? (
        <EventDetails
          server={server}
          event={opened}
          where={channelName(opened.channelId)}
          canPlan={canPlan}
          onEdit={() => {
            setOpenId(null);
            setDialog({ kind: 'edit', event: opened });
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {dialog ? (
        <EventDialog
          server={server}
          event={dialog.kind === 'edit' ? dialog.event : null}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function EventDetails({
  server,
  event,
  where,
  canPlan,
  onEdit,
  onClose,
}: {
  server: ServerDetail;
  event: ScheduledEvent;
  where: string | null;
  canPlan: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    api.events
      .remove(server.id, event.id)
      .then(onClose)
      .catch((problem) => setError(problem instanceof ApiError ? problem.message : 'Could not cancel it.'));
  };

  return (
    <Modal
      title={event.title}
      onClose={onClose}
      footer={
        <>
          {canPlan && !confirming ? (
            <button type="button" className="button secondary inline" onClick={() => setConfirming(true)}>
              Cancel event
            </button>
          ) : null}
          {canPlan && confirming ? (
            <button type="button" className="button danger inline" onClick={cancel}>
              Yes, cancel it for everyone
            </button>
          ) : null}
          {canPlan ? (
            <button type="button" className="button secondary inline" onClick={onEdit}>
              Edit
            </button>
          ) : null}
          <button type="button" className="button inline" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      <p className="coming-up-detail-when">
        {fullWhen(event.startsAt)}
        {where ? ` · ${where}` : ''}
      </p>
      {event.note ? <p className="coming-up-note">{event.note}</p> : null}
      <p className="field-note">
        Going {event.counts.going}, maybe {event.counts.maybe}, can&rsquo;t {event.counts.no}. Everyone who says Going or
        Maybe gets a reminder an hour before.
      </p>
    </Modal>
  );
}

/** Plan a new event, or change one. The same form for both. */
function EventDialog({
  server,
  event,
  onClose,
}: {
  server: ServerDetail;
  event: ScheduledEvent | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [when, setWhen] = useState(event ? toLocalInput(event.startsAt) : '');
  const [channelId, setChannelId] = useState<string | null>(event?.channelId ?? null);
  const [note, setNote] = useState(event?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const channels = [...server.channels].sort(
    (a, b) => (a.type === b.type ? a.position - b.position : a.type === 'text' ? -1 : 1),
  );

  async function save() {
    const trimmed = title.trim();
    if (trimmed === '') return setError('An event needs a title.');
    const startsAt = toUtcIso(when);
    if (!startsAt) return setError('Pick a date and a time.');
    if (new Date(startsAt).getTime() <= Date.now()) return setError('That time has already passed. Pick one still to come.');

    setBusy(true);
    setError(null);
    const body = { title: trimmed, startsAt, channelId, note: note.trim() };
    try {
      if (event) await api.events.update(server.id, event.id, body);
      else await api.events.create(server.id, body);
      onClose();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save the event.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={event ? 'Edit event' : 'Plan an event'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button inline" disabled={busy} onClick={() => void save()}>
            {event ? 'Save' : 'Plan it'}
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="event-title">Title</label>
        <input
          id="event-title"
          value={title}
          maxLength={LIMITS.eventTitle.max}
          placeholder="Session 12"
          onChange={(change) => setTitle(change.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="event-when">Date and time</label>
        <input id="event-when" type="datetime-local" value={when} onChange={(change) => setWhen(change.target.value)} />
        <p className="field-note">In your own time zone. Everyone else sees it in theirs.</p>
      </div>

      <div className="field">
        <label htmlFor="event-channel">Where</label>
        <select
          id="event-channel"
          value={channelId ?? ''}
          onChange={(change) => setChannelId(change.target.value === '' ? null : change.target.value)}
        >
          <option value="">No particular channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.type === 'voice' ? `♫ ${channel.name}` : `#${channel.name}`}
            </option>
          ))}
        </select>
        <p className="field-note">People who cannot see the channel still see the event, just not where.</p>
      </div>

      <div className="field">
        <label htmlFor="event-note">Note</label>
        <textarea
          id="event-note"
          className="coming-up-note-input"
          rows={4}
          value={note}
          maxLength={LIMITS.eventNote.max}
          placeholder="Optional. What to bring, what happened last time."
          onChange={(change) => setNote(change.target.value)}
        />
      </div>
    </Modal>
  );
}

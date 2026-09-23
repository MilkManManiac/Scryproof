/**
 * The initiative tracker, above the composer while a fight is running in
 * this channel.
 *
 * A compact bar by default (the round, whose turn it is, Next) and the whole
 * order when opened. Everything here is a request: the server decides who may
 * add, remove, reorder, move the turn or end the fight, and sends the result
 * to everyone at once. The buttons are hidden from people it would refuse,
 * nothing more.
 */

import { useState } from 'react';
import { INITIATIVE_LIMITS, Permission, currentEntry } from '@scryproof/shared';
import type { Channel, Member, Tracker, TrackerEntry } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { useLocalNames } from '../lib/local-names';
import { nameOf } from '../lib/mentions';
import { can } from '../lib/usePermissions';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';

/** Who a new combatant is: the person adding, nobody in particular, or a member by id. */
type Who = 'me' | 'other' | string;

/** "15" is a number; anything else is sent as a roll for the server to throw. */
function readValue(value: string): { initiative: number } | { roll: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) return { initiative: Number(trimmed) };
  return { roll: trimmed };
}

export function Initiative({ channel, mask }: { channel: Channel; mask: bigint }) {
  const { state, applyTracker } = useStore();
  useLocalNames();
  const tracker = state.trackers[channel.id];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (!tracker) return null;

  const selfId = state.user?.id ?? null;
  const members = state.members[channel.serverId] ?? [];
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const mayPost = can(mask, Permission.SEND_MESSAGES);
  const controls = mayPost && (tracker.startedBy === selfId || can(mask, Permission.MANAGE_MESSAGES));
  const acting = currentEntry(tracker);
  // Nothing to be compact about until someone is in the order.
  const expanded = open || tracker.entries.length === 0;

  /**
   * Every button here goes through this: one request at a time, and the
   * answer kept. True when it went through, so a form knows to clear.
   */
  async function act(request: () => Promise<{ tracker: Tracker } | { ok: true }>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const answer = await request();
      applyTracker(channel.id, 'tracker' in answer ? answer.tracker : null);
      return true;
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'That did not go through.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, step: -1 | 1) {
    if (!tracker) return;
    const order = tracker.entries.map((entry) => entry.id);
    const other = index + step;
    if (other < 0 || other >= order.length) return;
    [order[index], order[other]] = [order[other]!, order[index]!];
    void act(() => api.trackers.reorder(channel.id, order));
  }

  return (
    <section className={expanded ? 'initiative open' : 'initiative'} aria-label="Initiative">
      <div className="initiative-bar">
        <span className="initiative-round">Round {tracker.round}</span>
        <span className="initiative-now">
          {acting ? (
            <>
              <EntryFace entry={acting} member={acting.userId ? memberById.get(acting.userId) : undefined} />
              <span className="initiative-now-name">{acting.name}</span>
              <span className="initiative-now-label">to act</span>
            </>
          ) : (
            <span className="initiative-now-label">Nobody in the order yet</span>
          )}
        </span>
        {controls && acting ? (
          <button type="button" className="button inline" disabled={busy} onClick={() => void act(() => api.trackers.next(channel.id))}>
            Next
          </button>
        ) : null}
        <button
          type="button"
          className="link-button"
          aria-expanded={expanded}
          onClick={() => setOpen((value) => !value)}
          disabled={tracker.entries.length === 0}
        >
          {expanded ? 'Hide order' : `Show order (${tracker.entries.length})`}
        </button>
      </div>

      {error ? <div className="initiative-error">{error}</div> : null}

      {expanded ? (
        <>
          {tracker.entries.length > 0 ? (
            <ol className="initiative-list">
              {tracker.entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className={index === tracker.turn ? 'initiative-row current' : 'initiative-row'}
                  aria-current={index === tracker.turn ? 'step' : undefined}
                >
                  <span className="initiative-number" title="Initiative">
                    {entry.initiative}
                  </span>
                  <EntryFace entry={entry} member={entry.userId ? memberById.get(entry.userId) : undefined} />
                  <span className="initiative-name">{entry.name}</span>
                  {entry.note ? <span className="initiative-note">{entry.note}</span> : null}
                  {controls ? (
                    <span className="initiative-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="Move up"
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        &#9650;
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Move down"
                        disabled={busy || index === tracker.entries.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        &#9660;
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title={`Take ${entry.name} out`}
                        disabled={busy}
                        onClick={() => void act(() => api.trackers.remove(channel.id, entry.id))}
                      >
                        &#10005;
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          {mayPost ? (
            <AddForm
              tracker={tracker}
              members={members}
              selfId={selfId}
              controls={controls}
              busy={busy}
              onAdd={(body) => act(() => api.trackers.add(channel.id, body))}
            />
          ) : null}

          {controls ? (
            <div className="initiative-footer">
              {confirmingEnd ? (
                <>
                  <span>End the fight for everyone?</span>
                  <button
                    type="button"
                    className="button danger inline"
                    disabled={busy}
                    onClick={() => {
                      setConfirmingEnd(false);
                      void act(() => api.trackers.end(channel.id));
                    }}
                  >
                    End it
                  </button>
                  <button type="button" className="button secondary inline" onClick={() => setConfirmingEnd(false)}>
                    Keep going
                  </button>
                </>
              ) : (
                <button type="button" className="link-button" onClick={() => setConfirmingEnd(true)}>
                  End initiative
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** A member's avatar, or a plain mark the same size for anyone who is not one. */
function EntryFace({ entry, member }: { entry: TrackerEntry; member: Member | undefined }) {
  if (member) return <Avatar user={member.user} name={nameOf(member)} small />;
  return (
    <span className="initiative-face" aria-hidden="true">
      {entry.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AddForm({
  tracker,
  members,
  selfId,
  controls,
  busy,
  onAdd,
}: {
  tracker: Tracker;
  members: Member[];
  selfId: string | null;
  controls: boolean;
  busy: boolean;
  onAdd: (body: { name: string; userId?: string | null; initiative?: number; roll?: string }) => Promise<boolean>;
}) {
  const [who, setWho] = useState<Who>('me');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const inOrder = new Set(tracker.entries.map((entry) => entry.userId).filter((id): id is string => id !== null));
  const meIn = selfId !== null && inOrder.has(selfId);
  // Someone who does not run the fight can only add themselves, once.
  if (!controls && meIn) return null;

  const me = members.find((member) => member.userId === selfId);
  const chosenMember = who !== 'me' && who !== 'other' ? members.find((member) => member.userId === who) : undefined;
  const defaultName = who === 'me' ? (me ? nameOf(me) : '') : chosenMember ? nameOf(chosenMember) : '';
  const effectiveWho: Who = who === 'me' && meIn ? 'other' : who;

  async function submit() {
    const read = readValue(value);
    const finalName = name.trim() || defaultName;
    if (!finalName || !read) return;
    const userId = effectiveWho === 'me' ? undefined : effectiveWho === 'other' ? null : effectiveWho;
    // Kept on a refusal, so a typo in the roll can be fixed rather than retyped.
    if (!(await onAdd({ name: finalName, ...(userId === undefined ? {} : { userId }), ...read }))) return;
    setName('');
    setValue('');
    setWho('me');
  }

  return (
    <form
      className="initiative-add"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {controls ? (
        <select value={effectiveWho} onChange={(event) => setWho(event.target.value)} aria-label="Who">
          {meIn ? null : <option value="me">Me</option>}
          <option value="other">Someone else (not a member)</option>
          {members
            .filter((member) => member.userId !== selfId && !inOrder.has(member.userId))
            .map((member) => (
              <option key={member.userId} value={member.userId}>
                {nameOf(member)}
              </option>
            ))}
        </select>
      ) : null}
      <input
        type="text"
        value={name}
        maxLength={INITIATIVE_LIMITS.name.max}
        placeholder={defaultName || 'Name'}
        aria-label="Name"
        onChange={(event) => setName(event.target.value)}
      />
      <input
        type="text"
        className="initiative-value"
        value={value}
        maxLength={40}
        placeholder="15 or d20+3"
        aria-label="Initiative, or a roll"
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        type="submit"
        className="button inline"
        disabled={busy || !readValue(value) || !(name.trim() || defaultName)}
      >
        {effectiveWho === 'me' ? 'Add me' : 'Add'}
      </button>
    </form>
  );
}

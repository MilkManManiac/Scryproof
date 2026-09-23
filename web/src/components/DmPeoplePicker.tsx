/**
 * Choosing people to write to: one for a conversation, several for a group,
 * or one more for a group that already exists.
 *
 * Everyone offered shares a server with you, from what the store already has
 * loaded (a server's roster arrives when you first visit it, not before). Not
 * yourself, not anyone you have blocked, one row per person even if a server
 * is shared with several. The server checks all of this again; the list only
 * saves offering something it would refuse.
 */

import { useMemo, useState } from 'react';
import type { PublicUser } from '@scryproof/shared';
import { LIMITS } from '@scryproof/shared';

import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

export function DmPeoplePicker({
  onClose,
  initial = [],
  addTo = null,
}: {
  onClose: () => void;
  /** Already ticked when the picker opens: "Start a group" on somebody's card. */
  initial?: string[];
  /** A group to add one person to, instead of starting something new. */
  addTo?: string | null;
}) {
  const { state: app } = useStore();
  const { state, openWith, createGroup, addMember } = useDms();
  const selfId = app.user?.id ?? null;
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>(initial);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const already = useMemo(
    () => new Set(addTo ? (state.dms[addTo]?.members ?? []).map((member) => member.id) : []),
    [addTo, state.dms],
  );
  const room = addTo ? LIMITS.groupDmMembers - already.size : LIMITS.groupDmMembers - 1;

  const people = useMemo(() => {
    const byId = new Map<string, PublicUser>();
    for (const roster of Object.values(app.members)) {
      for (const member of roster) {
        if (member.userId === selfId || app.blocks.has(member.userId) || already.has(member.userId)) continue;
        byId.set(member.userId, member.user);
      }
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [app.members, app.blocks, selfId, already]);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? people.filter(
        (person) => person.displayName.toLowerCase().includes(needle) || person.username.toLowerCase().includes(needle),
      )
    : people;

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work.');
      setBusy(false);
    }
  }

  function toggle(userId: string) {
    setChosen((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : current.length >= room
          ? current
          : [...current, userId],
    );
  }

  // One person is a conversation with them. Two or more is a group.
  const start = () =>
    void run(() => (chosen.length === 1 ? openWith(chosen[0]!) : createGroup(chosen, title.trim() || null)));

  const heading = addTo ? 'Add someone' : 'Start a conversation';
  const action = chosen.length > 1 ? 'Start the group' : 'Open';

  return (
    <Modal
      title={heading}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            Cancel
          </button>
          {addTo ? null : (
            <button type="button" className="button inline" disabled={busy || chosen.length === 0} onClick={start}>
              {action}
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <input type="text" placeholder="Find someone" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {addTo ? (
        <p className="dm-note dm-picker-note">
          They will read what is written from now on. Nothing sent before was locked for them, so it stays out of reach.
        </p>
      ) : (
        <p className="dm-note dm-picker-note">
          Pick one person to write to them, or several to start a group. Up to {LIMITS.groupDmMembers} people, you included.
        </p>
      )}
      {error ? <div className="error">{error}</div> : null}
      {filtered.length === 0 ? (
        <p className="dm-note">{people.length === 0 ? 'Nobody else shares a server with you yet.' : 'Nobody matches that.'}</p>
      ) : (
        <div className="dm-picker-list">
          {filtered.map((person) => {
            const ticked = chosen.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                className={ticked ? 'dm-picker-row chosen' : 'dm-picker-row'}
                aria-pressed={addTo ? undefined : ticked}
                disabled={busy || (!addTo && !ticked && chosen.length >= room)}
                onClick={() => (addTo ? void run(() => addMember(addTo, person.id)) : toggle(person.id))}
              >
                <Avatar user={person} small presence={app.presences[person.id] ?? 'offline'} />
                <span className="dm-picker-name">{person.displayName}</span>
                {addTo ? null : <span className="dm-picker-tick" aria-hidden="true">{ticked ? 'Chosen' : ''}</span>}
              </button>
            );
          })}
        </div>
      )}
      {!addTo && chosen.length > 1 ? (
        <div className="field">
          <label htmlFor="dm-group-title">Name the group, if you like</label>
          <input
            id="dm-group-title"
            type="text"
            placeholder="Their names, if left empty"
            value={title}
            maxLength={LIMITS.groupDmTitle.max}
            onChange={(event) => setTitle(event.target.value)}
          />
          <p className="dm-note dm-picker-note">
            The name is not encrypted: the server stores it as written. Everything said inside the group is.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

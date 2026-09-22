/**
 * Everyone you have blocked, and the way back.
 *
 * The names are fetched rather than read out of the store: the store holds the
 * ids, and somebody blocked in a server you have since left is still blocked
 * and still has a name. Nobody on this list has been told they are on it.
 */

import { useEffect, useState } from 'react';
import type { BlockedPerson } from '@scryproof/shared';

import { api, ApiError } from '../../lib/api';
import { useStore } from '../../state/store';
import { Modal } from '../Modal';

export function BlockedPeople({ onClose }: { onClose: () => void }) {
  const { state, unblock } = useStore();
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.blocks
      .list()
      .then(({ blocks }) => !cancelled && setPeople(blocks))
      .catch((problem: unknown) => {
        if (cancelled) return;
        setError(problem instanceof ApiError ? problem.message : 'That list could not be fetched.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whoever has been unblocked in this dialog leaves the list as it happens,
  // rather than after a refetch that would blink.
  const listed = (people ?? []).filter((person) => state.blocks.has(person.id));

  return (
    <Modal
      title="Blocked people"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      <p className="settings-note">
        Their messages are collapsed, their reactions are not counted, they cannot ping you, and they
        cannot write to you directly. They are not told any of it.
      </p>
      {people === null && !error ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="spinner" />
        </div>
      ) : null}
      {people !== null && listed.length === 0 ? <p className="field-note">Nobody.</p> : null}
      <div className="member-rows">
        {listed.map((person) => (
          <div className="member-row" key={person.id}>
            <span className="member-row-name">{person.displayName}</span>
            <button
              type="button"
              className="button secondary inline"
              onClick={() => void unblock(person.id).catch(() => setError('That did not work.'))}
            >
              Unblock
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

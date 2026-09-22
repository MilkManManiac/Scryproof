/**
 * The pinned messages of a channel, from a pin button in the header. Fetched
 * fresh each time it opens: pins are rare and a stale list is worse than a
 * short wait. Clicking one lands on it however old it is; the store fetches
 * the history around it when it is not already loaded.
 */

import { useEffect, useState } from 'react';
import type { Message } from '@scryproof/shared';

import { api } from '../lib/api';
import { toPlainLine } from '../lib/mentions';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';

const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function PinnedMessages({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { state, jumpToMessage } = useStore();
  const [pins, setPins] = useState<Message[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.messages
      .pins(channelId)
      .then(({ messages }) => {
        if (!cancelled) setPins(messages);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Unpinning while the list is open takes the row away.
  const shown = (pins ?? []).filter((pin) => {
    const live = state.messages[channelId]?.find((message) => message.id === pin.id);
    return live ? live.pinnedAt !== null && !live.deleted : true;
  });
  const members = state.members[state.selectedServerId ?? ''] ?? [];

  function jump(id: string) {
    void jumpToMessage(channelId, id).catch(() => undefined);
    onClose();
  }

  return (
    <div className="switcher-backdrop" onMouseDown={onClose}>
      <div className="switcher notices pins" role="dialog" aria-label="Pinned messages" onMouseDown={(event) => event.stopPropagation()}>
        <div className="notices-head">
          <strong>Pinned messages</strong>
          <span className="notices-actions">{shown.length > 0 ? `${shown.length} of 50` : ''}</span>
        </div>
        <div className="notices-list">
          {error ? <p className="notices-empty">The pins could not be fetched.</p> : null}
          {pins && shown.length === 0 && !error ? (
            <p className="notices-empty">Nothing is pinned here. Anyone who can manage messages can pin one from its hover bar.</p>
          ) : null}
          {shown.map((pin) => (
            <button
              type="button"
              className="notice pin"
              key={pin.id}
              title="Go to this message"
              onClick={() => jump(pin.id)}
            >
              <Avatar user={pin.author} small />
              <span className="notice-body">
                <span className="notice-where">
                  <strong style={{ color: pin.author.accent }}>{pin.author.displayName}</strong> {when.format(new Date(pin.createdAt))}
                </span>
                <span className="pin-text">
                  {pin.content ? toPlainLine(pin.content, members) : pin.attachments.length > 0 ? `${pin.attachments.length} file(s)` : 'A locked message'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

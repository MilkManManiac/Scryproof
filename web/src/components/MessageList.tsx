/**
 * The message timeline.
 *
 * Two behaviours worth naming:
 *
 *   - Message text is rendered as text. There is no markdown pass and no
 *     dangerouslySetInnerHTML anywhere in this app, so a message body can
 *     never become markup in someone else's browser.
 *   - Scroll position is only pinned to the bottom when the reader was already
 *     at the bottom. Yanking someone back down while they are reading history
 *     is the single most annoying thing a chat client does.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Permission } from '@gooffline/shared';
import type { Channel, Message } from '@gooffline/shared';

import { api } from '../lib/api';
import { can } from '../lib/usePermissions';
import { useStore, useTypingUsers } from '../state/store';
import { Avatar } from './Avatar';

/** Consecutive messages from one author within this window share a header. */
const GROUP_WINDOW_MS = 7 * 60 * 1000;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(date: Date): string {
  const today = new Date();
  if (sameDay(date, today)) return 'Today';
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return dayFormat.format(date);
}

export function MessageList({ channel, mask }: { channel: Channel; mask: bigint }) {
  const { state, loadMessages } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const messages = state.messages[channel.id] ?? [];
  const loaded = state.loadedChannels[channel.id] ?? false;
  const typing = useTypingUsers(channel.id);
  const members = state.members[channel.serverId] ?? [];

  const canReadHistory = can(mask, Permission.READ_MESSAGE_HISTORY);

  useEffect(() => {
    if (!loaded && canReadHistory) void loadMessages(channel.id).catch(() => undefined);
  }, [channel.id, loaded, canReadHistory, loadMessages]);

  // Re-pin on channel change, before paint, so a switch always lands at the
  // newest message rather than wherever the previous channel was scrolled to.
  useLayoutEffect(() => {
    pinned.current = true;
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [channel.id]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  async function onScroll() {
    const element = scroller.current;
    if (!element) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinned.current = distanceFromBottom < 80;

    if (element.scrollTop < 120 && !loadingOlder && messages.length >= 50) {
      const oldest = messages[0];
      if (!oldest) return;

      setLoadingOlder(true);
      const previousHeight = element.scrollHeight;
      try {
        await loadMessages(channel.id, oldest.id);
        // Keep the reader's eye where it was: the list grew upward.
        requestAnimationFrame(() => {
          element.scrollTop += element.scrollHeight - previousHeight;
        });
      } catch {
        // Nothing to recover; the existing history stays on screen.
      } finally {
        setLoadingOlder(false);
      }
    }
  }

  const rows = useMemo(() => {
    const output: { message: Message; grouped: boolean; day: string | null }[] = [];
    let previous: Message | null = null;

    for (const message of messages) {
      const at = new Date(message.createdAt);
      const previousAt = previous ? new Date(previous.createdAt) : null;

      const day = !previousAt || !sameDay(at, previousAt) ? dayLabel(at) : null;
      const grouped =
        !day &&
        previous !== null &&
        previous.authorId === message.authorId &&
        at.getTime() - (previousAt?.getTime() ?? 0) < GROUP_WINDOW_MS;

      output.push({ message, grouped, day });
      previous = message;
    }
    return output;
  }, [messages]);

  if (!canReadHistory) {
    return (
      <div className="messages">
        <div className="empty">
          <div>
            <h2>No history here</h2>
            <p>
              You can take part in #{channel.name}, but you cannot read what was said before
              you arrived.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="messages" ref={scroller} onScroll={() => void onScroll()}>
        {loadingOlder ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 8 }}>
            <div className="spinner" />
          </div>
        ) : null}

        {loaded && messages.length === 0 ? (
          <div className="channel-intro">
            <h2>#{channel.name}</h2>
            <p>
              This is the start of the channel. {channel.topic ? channel.topic : 'Say something.'}
            </p>
          </div>
        ) : null}

        {rows.map(({ message, grouped, day }) => (
          <div key={message.id}>
            {day ? <div className="day-divider">{day}</div> : null}
            <MessageRow message={message} grouped={grouped} mask={mask} />
          </div>
        ))}
      </div>

      <div className="typing">
        {typing.length > 0 ? (
          <>
            <div className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
            {typing
              .map((userId) => {
                const member = members.find((entry) => entry.userId === userId);
                return member?.nickname ?? member?.user.displayName ?? 'Someone';
              })
              .join(', ')}{' '}
            {typing.length === 1 ? 'is typing' : 'are typing'}
          </>
        ) : null}
      </div>
    </>
  );
}

function MessageRow({
  message,
  grouped,
  mask,
}: {
  message: Message;
  grouped: boolean;
  mask: bigint;
}) {
  const { state } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? '');

  const mine = message.authorId === state.user?.id;
  const canDelete = mine || can(mask, Permission.MANAGE_MESSAGES);
  const at = new Date(message.createdAt);

  async function saveEdit() {
    const next = draft.trim();
    if (!next || next === message.content) {
      setEditing(false);
      return;
    }
    try {
      await api.messages.edit(message.id, next);
    } finally {
      setEditing(false);
    }
  }

  return (
    <div className={grouped ? 'message grouped' : 'message'}>
      {grouped ? (
        <span className="message-hover-time">{timeFormat.format(at)}</span>
      ) : (
        <div className="message-gutter">
          <Avatar user={message.author} />
        </div>
      )}

      <div className="message-body">
        {grouped ? null : (
          <div className="message-meta">
            <span className="message-author" style={{ color: message.author.accent }}>
              {message.author.displayName}
            </span>
            <time className="message-time" dateTime={message.createdAt}>
              {timeFormat.format(at)}
            </time>
          </div>
        )}

        {message.deleted ? (
          <div className="message-text deleted">Message deleted</div>
        ) : editing ? (
          <textarea
            className="composer-input"
            style={{ width: '100%', background: 'var(--bg-raised)', borderRadius: 6, padding: 8 }}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void saveEdit();
              }
            }}
          />
        ) : (
          <>
            {message.ciphertext && !message.content ? (
              <div className="message-text deleted">
                Encrypted message. This client cannot open it yet.
              </div>
            ) : message.content ? (
              <div className="message-text">{message.content}</div>
            ) : null}

            {message.editedAt ? <span className="message-edited">edited</span> : null}

            {message.attachments.map((attachment) =>
              attachment.contentType.startsWith('image/') ? (
                <img
                  key={attachment.id}
                  className="attachment-image"
                  src={attachment.url}
                  alt={attachment.filename}
                  loading="lazy"
                />
              ) : (
                <a
                  key={attachment.id}
                  className="attachment-file"
                  href={attachment.url}
                  download={attachment.filename}
                  rel="noreferrer"
                >
                  {attachment.filename}
                  <span style={{ color: 'var(--text-faint)' }}>
                    {Math.max(1, Math.round(attachment.size / 1024))} KB
                  </span>
                </a>
              ),
            )}
          </>
        )}
      </div>

      {message.deleted || editing ? null : (
        <div className="message-actions">
          {mine && message.content !== null ? (
            <button
              type="button"
              className="icon-button"
              title="Edit"
              onClick={() => {
                setDraft(message.content ?? '');
                setEditing(true);
              }}
            >
              &#9998;
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="icon-button danger"
              title="Delete"
              onClick={() => void api.messages.remove(message.id).catch(() => undefined)}
            >
              &#10005;
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

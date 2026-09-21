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
import { Permission, splitContent } from '@scryproof/shared';
import type { Channel, Member, Message } from '@scryproof/shared';

import { api } from '../lib/api';
import { fromDraft, nameOf, toDraft, toPlainLine } from '../lib/mentions';
import { EDIT_LAST, on } from '../lib/signals';
import { unreadLine } from '../lib/unread-line';
import { can } from '../lib/usePermissions';
import { useStore, useTypingUsers } from '../state/store';
import { Avatar } from './Avatar';
import { ReactionPicker, rememberReaction } from './ReactionPicker';

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

/** Bring a message into view and flash it, for following a reply back to what it answers. */
function jumpTo(messageId: string): void {
  const row = document.getElementById(`message-${messageId}`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('flash');
  // Reading a layout property makes the browser notice the class went away,
  // so adding it back restarts the animation.
  void row.offsetWidth;
  row.classList.add('flash');
}

export function MessageList({ channel, mask }: { channel: Channel; mask: bigint }) {
  const { state, loadMessages, markRead } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [focused, setFocused] = useState(() => document.hasFocus());

  const messages = state.messages[channel.id] ?? [];
  const loaded = state.loadedChannels[channel.id] ?? false;
  const typing = useTypingUsers(channel.id);
  const members = state.members[channel.serverId] ?? [];

  const canReadHistory = can(mask, Permission.READ_MESSAGE_HISTORY);
  const selfId = state.user?.id;

  useEffect(() => {
    if (!loaded && canReadHistory) void loadMessages(channel.id).catch(() => undefined);
  }, [channel.id, loaded, canReadHistory, loadMessages]);

  // Where reading had got to when this channel was opened. The "new" line sits
  // after it and stays put while you read, then is gone next time you come back.
  const [newAfter, setNewAfter] = useState<string | null | undefined>(undefined);
  const readAtOpen = state.readStates[channel.id]?.lastReadMessageId ?? null;
  const bootstrapped = state.bootstrapped;
  useEffect(() => {
    if (bootstrapped) setNewAfter(readAtOpen);
    // Deliberately not following readAtOpen: it moves as soon as the channel is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, bootstrapped]);

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // A channel counts as read when its newest message is on screen in a window
  // you are actually looking at. Open in a background tab does not count.
  const newestId = messages.at(-1)?.id;
  useEffect(() => {
    if (newestId && loaded && focused && pinned.current) markRead(channel.id, newestId);
  }, [channel.id, newestId, loaded, focused, markRead]);

  // Up in an empty composer edits the last thing this person said here. Only
  // what is loaded counts: a message far enough back to be off the page is
  // not what anyone means by "the last one".
  const [editRequest, setEditRequest] = useState<string | null>(null);
  const editable = useMemo(
    () => [...messages].reverse().find((entry) => entry.authorId === selfId && !entry.deleted && entry.content !== null),
    [messages, selfId],
  );
  const editableId = editable?.id;
  useEffect(() => on(EDIT_LAST, () => setEditRequest(editableId ?? null)), [editableId]);

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
    if (pinned.current && newestId && focused) markRead(channel.id, newestId);

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

  // Where the "New" line is, and whether it is on screen. Landing at the newest
  // message is right — that is what people came for — but it means the line
  // marking where they stopped reading can be forty messages up with nothing
  // saying so. The bar is that something.
  const divider = useRef<HTMLDivElement | null>(null);
  const [dividerSeen, setDividerSeen] = useState(true);

  // The line and the count come from one rule, tested on its own, so the
  // timeline and the sidebar badge can never end up saying different things.
  const newLine = useMemo(() => {
    const line = unreadLine({ messages, selfId, lastReadMessageId: newAfter });
    return { ...line, newestUnreadId: line.index === -1 ? null : messages[line.index]?.id ?? null };
  }, [messages, selfId, newAfter]);

  const rows = useMemo(() => {
    const output: { message: Message; grouped: boolean; day: string | null; firstNew: boolean }[] = [];
    let previous: Message | null = null;
    let markedNew = false;

    for (const message of messages) {
      const at = new Date(message.createdAt);
      const previousAt = previous ? new Date(previous.createdAt) : null;

      const day = !previousAt || !sameDay(at, previousAt) ? dayLabel(at) : null;
      const firstNew = !markedNew && message.id === newLine.newestUnreadId;
      if (firstNew) markedNew = true;

      const grouped =
        !day &&
        !firstNew &&
        message.replyToId === null &&
        previous !== null &&
        previous.authorId === message.authorId &&
        at.getTime() - (previousAt?.getTime() ?? 0) < GROUP_WINDOW_MS;

      output.push({ message, grouped, day, firstNew });
      previous = message;
    }
    return output;
  }, [messages, newLine.newestUnreadId]);

  const newCount = newLine.count;

  // The line sits on the first row we hold, and there is more above it we have
  // not fetched. The count is a floor, so it is written as one rather than
  // stated as a fact we cannot check.
  const countIsFloor = newLine.index === 0 && messages.length >= 50;

  useEffect(() => {
    const element = divider.current;
    const root = scroller.current;
    if (!element || !root) {
      setDividerSeen(true);
      return;
    }
    // Watched rather than computed on every scroll: the answer only changes
    // when the line crosses the edge, and a scroll handler that measures the
    // DOM on every frame is how a long channel starts to stutter.
    const observer = new IntersectionObserver(
      ([entry]) => setDividerSeen(entry?.isIntersecting ?? true),
      { root },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [newLine.newestUnreadId, channel.id]);

  const jumpToNew = () => {
    divider.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

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
      {newCount > 0 && !dividerSeen ? (
        <div className="unread-bar">
          <button type="button" className="unread-bar-jump" onClick={jumpToNew}>
            {newCount === 1 ? '1 new message' : `${newCount}${countIsFloor ? '+' : ''} new messages`}
            {/* "Where you stopped" is only true if you ever started. */}
            {newAfter === null ? ' — jump to the first one' : ' — jump to where you stopped'}
          </button>
          <button
            type="button"
            className="unread-bar-dismiss"
            onClick={() => {
              if (newestId) markRead(channel.id, newestId);
              setNewAfter(newestId ?? null);
            }}
          >
            Mark read
          </button>
        </div>
      ) : null}

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

        {rows.map(({ message, grouped, day, firstNew }) => (
          <div key={message.id}>
            {day ? <div className="day-divider">{day}</div> : null}
            {firstNew ? (
              <div className="new-divider" ref={divider}>
                New
              </div>
            ) : null}
            <MessageRow
              message={message}
              grouped={grouped}
              mask={mask}
              members={members}
              openEditor={editRequest === message.id}
              onEditorOpened={() => setEditRequest(null)}
            />
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

/** A message body with the people it names drawn as names. Still only ever text. */
function MessageContent({
  content,
  members,
  selfId,
  everyone,
}: {
  content: string;
  members: Member[];
  selfId?: string;
  /** Whether the server accepted this message's @everyone. Typing the word is not enough. */
  everyone: boolean;
}) {
  return (
    <div className="message-text">
      {splitContent(content).map((part, index) => {
        if (part.kind === 'text') return <span key={index}>{part.text}</span>;
        if (part.kind === 'everyone') {
          if (!everyone) return <span key={index}>@everyone</span>;
          return (
            <span key={index} className="mention me">
              @everyone
            </span>
          );
        }
        if (part.kind === 'link') {
          return (
            // noreferrer is the point: without it the site being opened learns
            // which page sent the visitor, and the address of a private
            // instance is not theirs to have.
            <a
              key={index}
              className="link"
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {part.text}
            </a>
          );
        }
        const member = members.find((entry) => entry.userId === part.userId);
        return (
          <span key={index} className={part.userId === selfId ? 'mention me' : 'mention'}>
            @{member ? nameOf(member) : 'someone who left'}
          </span>
        );
      })}
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  mask,
  members,
  openEditor,
  onEditorOpened,
}: {
  message: Message;
  grouped: boolean;
  mask: bigint;
  members: Member[];
  /** Set when the composer asked for this one, the last thing this person said. */
  openEditor?: boolean;
  onEditorOpened?: () => void;
}) {
  const { state, replyTo } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!openEditor || editing) return;
    setDraft(toDraft(message.content ?? '', members));
    setEditing(true);
    onEditorOpened?.();
  }, [openEditor, editing, message.content, members, onEditorOpened]);

  const selfId = state.user?.id;
  const mine = message.authorId === selfId;
  const canDelete = mine || can(mask, Permission.MANAGE_MESSAGES);
  const canReact = can(mask, Permission.ADD_REACTIONS);
  const canReply = can(mask, Permission.SEND_MESSAGES);
  const at = new Date(message.createdAt);
  const reactions = message.reactions ?? [];
  const pingsMe =
    !mine && !message.deleted && (message.mentionsEveryone || (selfId ? (message.mentions ?? []).includes(selfId) : false));

  function toggle(emoji: string) {
    const has = reactions.find((entry) => entry.emoji === emoji)?.userIds.includes(selfId ?? '');
    if (!has) rememberReaction(emoji);
    void (has ? api.messages.unreact(message.id, emoji) : api.messages.react(message.id, emoji)).catch(() => undefined);
  }

  async function saveEdit() {
    const next = fromDraft(draft.trim(), members);
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

  const author = members.find((entry) => entry.userId === message.authorId);
  const parent = message.replyTo;
  const parentMember = parent ? members.find((entry) => entry.userId === parent.authorId) : undefined;

  return (
    <div
      id={`message-${message.id}`}
      className={`message${grouped ? ' grouped' : ''}${pingsMe ? ' pings-me' : ''}${parent ? ' is-reply' : ''}`}
    >
      {parent ? (
        <button type="button" className="reply-line" onClick={() => jumpTo(parent.id)} title="Go to that message">
          <span className="reply-line-author">
            {parentMember ? nameOf(parentMember) : parent.authorName}
          </span>
          <span className="reply-line-text">
            {parent.deleted
              ? 'Message deleted'
              : parent.content
                ? toPlainLine(parent.content, members)
                : 'Sent a file'}
          </span>
        </button>
      ) : null}

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
              {author ? nameOf(author) : message.author.displayName}
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
              <MessageContent
                content={message.content}
                members={members}
                selfId={selfId}
                everyone={message.mentionsEveryone ?? false}
              />
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

            {reactions.length > 0 ? (
              <div className="reactions">
                {reactions.map((reaction) => {
                  const included = reaction.userIds.includes(selfId ?? '');
                  const who = reaction.userIds
                    .map((userId) => {
                      const member = members.find((entry) => entry.userId === userId);
                      return userId === selfId ? 'You' : member ? nameOf(member) : 'Someone';
                    })
                    .join(', ');
                  return (
                    <button
                      key={reaction.emoji}
                      type="button"
                      className={included ? 'reaction mine' : 'reaction'}
                      title={who}
                      disabled={!included && !canReact}
                      onClick={() => toggle(reaction.emoji)}
                    >
                      <span className="reaction-emoji">{reaction.emoji}</span>
                      <span className="reaction-count">{reaction.userIds.length}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>

      {message.deleted || editing ? null : (
        <div className={picking ? 'message-actions open' : 'message-actions'}>
          {canReact ? (
            <button type="button" className="icon-button" title="React" onClick={() => setPicking((open) => !open)}>
              &#9786;
            </button>
          ) : null}
          {canReply ? (
            <button
              type="button"
              className="icon-button"
              title="Reply"
              onClick={() => replyTo(message.channelId, message)}
            >
              &#8617;
            </button>
          ) : null}
          {picking ? (
            <ReactionPicker
              onClose={() => setPicking(false)}
              onPick={(emoji) => {
                setPicking(false);
                toggle(emoji);
              }}
            />
          ) : null}
          {mine && message.content !== null ? (
            <button
              type="button"
              className="icon-button"
              title="Edit"
              onClick={() => {
                setDraft(toDraft(message.content ?? '', members));
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

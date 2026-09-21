/**
 * Direct messages: the list on the left and the conversation in the middle.
 *
 * The lock in the header is a claim, and non-negotiable 8 says the interface
 * may only make it where it is true. It is true here without conditions: there
 * is no unencrypted DM, so there is no state in which this screen shows the
 * word over plaintext.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { DmChannel, PublicUser } from '@scryproof/shared';
import { LIMITS } from '@scryproof/shared';

import type { AssessedDevice } from '../lib/dm-crypto';
import { isTrusted } from '../lib/dm-crypto';
import { dmUnread, otherMember, sortedDms, useDms, type DmReactionView, type DmView } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { ReactionPicker, rememberReaction } from './ReactionPicker';
import { UserPanel } from './UserPanel';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** Messages from one person within this long draw as one block. */
const GROUP_WINDOW_MS = 7 * 60_000;

export function DmSidebar() {
  const { state: app } = useStore();
  const { state, openDm } = useDms();
  const selfId = app.user?.id ?? null;
  const list = sortedDms(state);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Direct messages</div>
      <div className="sidebar-scroll">
        {state.setupError ? <p className="dm-note">{state.setupError}</p> : null}
        {list.length === 0 && !state.setupError ? (
          <p className="dm-note">
            Nobody yet. Click anyone in a server&rsquo;s member list to write to them.
          </p>
        ) : null}
        {list.map((dm) => {
          const other = otherMember(dm, selfId);
          if (!other) return null;
          const classes = ['channel', 'dm-row'];
          if (state.openId === dm.id) classes.push('active');
          if (dmUnread(dm)) classes.push('unread');
          return (
            <button key={dm.id} type="button" className={classes.join(' ')} onClick={() => openDm(dm.id)}>
              <Avatar user={other} small presence={app.presences[other.id] ?? 'offline'} />
              <span className="channel-name">{other.displayName}</span>
              {dmUnread(dm) ? <span className="dm-dot" aria-label="Unread" /> : null}
            </button>
          );
        })}
      </div>
      <UserPanel />
    </aside>
  );
}

export function DmPane() {
  const { state: app } = useStore();
  const { state } = useDms();
  const dm = state.openId ? state.dms[state.openId] : undefined;
  const selfId = app.user?.id ?? null;
  /** Per conversation: the message the next thing sent will answer. */
  const [replying, setReplying] = useState<Record<string, string | null>>({});

  if (!dm) {
    return (
      <div className="empty">
        <div>
          <h2>Direct messages</h2>
          <p>
            Pick a conversation on the left, or click anyone in a server&rsquo;s member list to start one.
            Everything written here is locked on your device before it is sent. The server stores it and
            cannot read it.
          </p>
        </div>
      </div>
    );
  }

  const other = otherMember(dm, selfId);
  return (
    <>
      <header className="main-header">
        <div className="main-title">
          <span className="channel-sigil">@</span>
          {other?.displayName ?? 'Conversation'}
        </div>
        <div className="main-topic dm-lock" title="Locked on your device, opened on theirs. The server stores it and cannot read it.">
          End-to-end encrypted
        </div>
      </header>
      <DeviceWarnings dm={dm} selfId={selfId} />
      <DmMessages dm={dm} selfId={selfId} onReply={(id) => setReplying((current) => ({ ...current, [dm.id]: id }))} />
      <DmComposer
        dm={dm}
        name={other?.displayName ?? 'them'}
        replyingTo={replying[dm.id] ?? null}
        onCancelReply={() => setReplying((current) => ({ ...current, [dm.id]: null }))}
      />
    </>
  );
}

/* --------------------------------- warnings -------------------------------- */

/** Four groups of four: short enough to read down a phone line. */
const spaced = (fingerprint: string): string => (fingerprint.slice(0, 16).match(/.{4}/g) ?? []).join(' ');

function DeviceWarnings({ dm, selfId }: { dm: DmChannel; selfId: string | null }) {
  const { state, acceptDevice } = useDms();
  const waiting = (state.devices[dm.id] ?? []).filter((entry) => !isTrusted(entry.verdict) && entry.verdict !== 'invalid');
  if (waiting.length === 0) return null;

  return (
    <div className="dm-warnings">
      {waiting.map((entry) => {
        const person = dm.members.find((member) => member.id === entry.device.userId);
        return (
          <DeviceWarning
            key={`${entry.device.userId}:${entry.device.deviceId}`}
            entry={entry}
            person={person ?? null}
            mine={entry.device.userId === selfId}
            onAccept={() => void acceptDevice(dm.id, entry)}
          />
        );
      })}
    </div>
  );
}

function DeviceWarning({
  entry,
  person,
  mine,
  onAccept,
}: {
  entry: AssessedDevice;
  person: PublicUser | null;
  mine: boolean;
  onAccept: () => void;
}) {
  const who = mine ? 'You' : (person?.displayName ?? 'Someone');
  const changed = entry.verdict === 'changed';
  return (
    <div className="dm-warning">
      <div>
        <strong>
          {changed
            ? `${mine ? 'One of your' : `One of ${who}'s`} devices has a different key than before.`
            : `${who} signed in somewhere new.`}
        </strong>{' '}
        {changed
          ? 'That happens when a browser is wiped. It is also what somebody in the middle would look like.'
          : 'A new browser or a new phone looks like this. So would somebody pretending.'}{' '}
        Until you accept it, that device gets no copy of what you send here.
        {mine ? ' If this was not you, change your password.' : ' If you can, ask them.'}
        <span className="dm-fingerprint" title="The key this device presented. It can be compared out loud.">
          {spaced(entry.fingerprint)}
        </span>
      </div>
      <button type="button" className="button secondary inline" onClick={onAccept}>
        Accept
      </button>
    </div>
  );
}

/* --------------------------------- messages -------------------------------- */

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Addresses become links. Nothing else is interpreted: a DM body is only ever text. */
function withLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]'"]/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      // noreferrer for the same reason as in channels: the site being opened
      // should not learn the address of a private instance.
      <a key={at} className="link" href={match[0]} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {match[0]}
      </a>,
    );
    cursor = at + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** One line of a message, for the strip above a reply. */
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').slice(0, 140);

function jumpTo(messageId: string): void {
  const row = document.getElementById(`dm-message-${messageId}`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('flash');
  window.setTimeout(() => row.classList.remove('flash'), 1200);
}

function DmMessages({
  dm,
  selfId,
  onReply,
}: {
  dm: DmChannel;
  selfId: string | null;
  onReply: (messageId: string) => void;
}) {
  const { state, loadOlder, markRead, remove, edit, react } = useDms();
  const views = state.messages[dm.id] ?? [];
  const reactions = state.reactions[dm.id] ?? [];
  const loaded = state.loaded[dm.id] ?? false;
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    pinnedToBottom.current = true;
    setExhausted(false);
  }, [dm.id]);

  const newestId = views.at(-1)?.id;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [newestId, loaded, dm.id]);

  // Reading is looking at the bottom of an open conversation in a focused window.
  useEffect(() => {
    if (loaded && pinnedToBottom.current && document.hasFocus()) markRead(dm.id);
  }, [loaded, newestId, dm.id, dm.lastMessageId, markRead]);
  useEffect(() => {
    const onFocus = () => {
      if (pinnedToBottom.current) markRead(dm.id);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dm.id, markRead]);

  async function onScroll() {
    const element = scroller.current;
    if (!element) return;
    pinnedToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    if (pinnedToBottom.current) markRead(dm.id);

    if (element.scrollTop > 80 || loadingOlder || exhausted || views.length === 0) return;
    setLoadingOlder(true);
    const before = element.scrollHeight;
    const count = views.length;
    try {
      await loadOlder(dm.id);
    } finally {
      setLoadingOlder(false);
    }
    // Keep the message that was under the eye where it was.
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop += scroller.current.scrollHeight - before;
    });
    if ((state.messages[dm.id]?.length ?? 0) === count) setExhausted(true);
  }

  if (!loaded) {
    return (
      <div className="messages">
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scroller} onScroll={() => void onScroll()}>
      {loadingOlder ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 12 }}>
          <div className="spinner" />
        </div>
      ) : null}
      {views.length === 0 ? (
        <div className="channel-intro">
          <h2>Nothing here yet</h2>
          <p>Whatever you write is locked before it leaves this device.</p>
        </div>
      ) : null}

      {views.map((view, index) => {
        const previous = views[index - 1];
        const at = new Date(view.createdAt);
        const before = previous ? new Date(previous.createdAt) : null;
        const newDay = !before || !sameDay(at, before);
        const grouped =
          !newDay &&
          previous?.authorId === view.authorId &&
          before !== null &&
          at.getTime() - before.getTime() < GROUP_WINDOW_MS;
        const author = dm.members.find((member) => member.id === view.authorId);

        return (
          <div key={view.id}>
            {newDay ? <div className="day-divider">{dayFormat.format(at)}</div> : null}
            <DmRow
              view={view}
              author={author ?? null}
              grouped={grouped && !view.replyTo}
              mine={view.authorId === selfId}
              selfId={selfId}
              members={dm.members}
              parent={view.replyTo ? (views.find((entry) => entry.id === view.replyTo) ?? null) : null}
              reactions={reactions.filter((reaction) => reaction.targetId === view.id)}
              onDelete={() => void remove(dm.id, view.id)}
              onEdit={(text) => edit(dm.id, view.id, text)}
              onReact={(emoji) => void react(dm.id, view.id, emoji).catch(() => undefined)}
              onReply={() => onReply(view.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Reactions as the row draws them: one chip per emoji, in the order first used. */
function grouped(reactions: DmReactionView[]): { emoji: string; userIds: string[] }[] {
  const chips: { emoji: string; userIds: string[] }[] = [];
  for (const reaction of reactions) {
    const chip = chips.find((entry) => entry.emoji === reaction.emoji);
    if (!chip) chips.push({ emoji: reaction.emoji, userIds: [reaction.authorId] });
    else if (!chip.userIds.includes(reaction.authorId)) chip.userIds.push(reaction.authorId);
  }
  return chips;
}

function DmRow({
  view,
  author,
  grouped: isGrouped,
  mine,
  selfId,
  members,
  parent,
  reactions,
  onDelete,
  onEdit,
  onReact,
  onReply,
}: {
  view: DmView;
  author: PublicUser | null;
  grouped: boolean;
  mine: boolean;
  selfId: string | null;
  members: PublicUser[];
  /** The message this answers, if it is among the ones loaded. */
  parent: DmView | null;
  reactions: DmReactionView[];
  onDelete: () => void;
  onEdit: (text: string) => Promise<void>;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  const at = new Date(view.createdAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readable = !view.deleted && view.problem === null && view.text !== null;
  const nameOf = (userId: string): string =>
    userId === selfId ? 'You' : (members.find((member) => member.id === userId)?.displayName ?? 'Someone');

  async function saveEdit() {
    const next = draft.trim();
    if (!next || next === view.text) {
      setEditing(false);
      return;
    }
    try {
      await onEdit(next);
      setEditing(false);
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save that.');
    }
  }

  let body: ReactNode;
  if (view.deleted) body = <div className="message-text deleted">Message deleted</div>;
  else if (view.problem === 'no-key') {
    body = (
      <div className="message-text deleted" title="Each message is locked for the devices that existed, and had been accepted, when it was sent.">
        Locked. This was sent before this device could be given a key.
      </div>
    );
  } else if (view.problem === 'failed' || view.text === null) {
    body = (
      <div className="message-text deleted dm-failed" title="A copy was addressed to this device and it does not open. It was changed on the way, or did not come from who it claims.">
        This message could not be opened, so it is not shown.
      </div>
    );
  } else if (editing) {
    body = (
      <>
        <textarea
          className="composer-input"
          style={{ width: '100%', background: 'var(--bg-raised)', borderRadius: 6, padding: 8 }}
          value={draft}
          autoFocus
          maxLength={LIMITS.message.max}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false);
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void saveEdit();
            }
          }}
        />
        {error ? <div className="error">{error}</div> : null}
      </>
    );
  } else {
    body = (
      <div className="message-text">
        {withLinks(view.text)}
        {view.editedAt ? <span className="message-edited">edited</span> : null}
        {view.unverified ? (
          <span className="dm-unverified" title="It opened, but it came from a device you have not accepted. See the warning above.">
            unaccepted device
          </span>
        ) : null}
      </div>
    );
  }

  const chips = grouped(reactions);

  return (
    <div id={`dm-message-${view.id}`} className={`message${isGrouped ? ' grouped' : ''}${view.replyTo ? ' is-reply' : ''}`}>
      {view.replyTo ? (
        <button
          type="button"
          className="reply-line"
          disabled={!parent}
          onClick={() => parent && jumpTo(parent.id)}
          title={parent ? 'Go to that message' : undefined}
        >
          {parent ? (
            <>
              <span className="reply-line-author">{nameOf(parent.authorId)}</span>
              <span className="reply-line-text">
                {parent.deleted ? 'Message deleted' : parent.text !== null ? oneLine(parent.text) : 'A locked message'}
              </span>
            </>
          ) : (
            <span className="reply-line-text">An earlier message</span>
          )}
        </button>
      ) : null}

      {isGrouped ? (
        <span className="message-hover-time">{timeFormat.format(at)}</span>
      ) : (
        <div className="message-gutter">{author ? <Avatar user={author} /> : null}</div>
      )}
      <div className="message-body">
        {isGrouped ? null : (
          <div className="message-meta">
            <span className="message-author" style={author ? { color: author.accent } : undefined}>
              {author?.displayName ?? 'Someone'}
            </span>
            <time className="message-time" dateTime={view.createdAt}>
              {timeFormat.format(at)}
            </time>
          </div>
        )}
        {body}
        {chips.length > 0 && !view.deleted ? (
          <div className="reactions">
            {chips.map((chip) => (
              <button
                key={chip.emoji}
                type="button"
                className={chip.userIds.includes(selfId ?? '') ? 'reaction mine' : 'reaction'}
                title={chip.userIds.map(nameOf).join(', ')}
                onClick={() => onReact(chip.emoji)}
              >
                <span className="reaction-emoji">{chip.emoji}</span>
                <span className="reaction-count">{chip.userIds.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {view.deleted || editing ? null : (
        <div className={picking ? 'message-actions open' : 'message-actions'}>
          {readable ? (
            <>
              <button type="button" className="icon-button" title="React" onClick={() => setPicking((open) => !open)}>
                &#9786;
              </button>
              <button type="button" className="icon-button" title="Reply" onClick={onReply}>
                &#8617;
              </button>
            </>
          ) : null}
          {picking ? (
            <ReactionPicker
              onClose={() => setPicking(false)}
              onPick={(emoji) => {
                setPicking(false);
                rememberReaction(emoji);
                onReact(emoji);
              }}
            />
          ) : null}
          {mine && readable ? (
            <button
              type="button"
              className="icon-button"
              title="Edit"
              onClick={() => {
                setDraft(view.text ?? '');
                setEditing(true);
              }}
            >
              &#9998;
            </button>
          ) : null}
          {mine ? (
            <button type="button" className="icon-button danger" title="Delete" onClick={onDelete}>
              &#10005;
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- composer -------------------------------- */

function DmComposer({
  dm,
  name,
  replyingTo,
  onCancelReply,
}: {
  dm: DmChannel;
  name: string;
  replyingTo: string | null;
  onCancelReply: () => void;
}) {
  const { state, send } = useDms();
  const { state: app } = useStore();
  const target = replyingTo ? ((state.messages[dm.id] ?? []).find((view) => view.id === replyingTo) ?? null) : null;
  const targetName =
    target?.authorId === app.user?.id
      ? 'yourself'
      : (dm.members.find((member) => member.id === target?.authorId)?.displayName ?? 'them');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const text = drafts[dm.id] ?? '';

  useEffect(() => {
    setError(null);
    input.current?.focus();
  }, [dm.id]);

  useEffect(() => {
    if (replyingTo) input.current?.focus();
  }, [replyingTo]);

  // Grow with the text, up to a point.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [text]);

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send(dm.id, body, target && !target.deleted ? target.id : null);
      onCancelReply();
      setDrafts((current) => ({ ...current, [dm.id]: '' }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not send that.');
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <div className="composer">
      {error ? (
        <div className="error" style={{ marginBottom: 8 }}>
          {error}
        </div>
      ) : null}
      {target ? (
        <div className="composer-reply">
          <span className="composer-reply-text">
            Replying to <strong>{targetName}</strong>
            {target.text ? <span className="composer-reply-quote">{oneLine(target.text)}</span> : null}
          </span>
          <button type="button" className="link-button" onClick={onCancelReply}>
            Cancel
          </button>
        </div>
      ) : null}
      <div className={state.ready ? 'composer-box' : 'composer-box denied'}>
        <textarea
          ref={input}
          className="composer-input"
          rows={1}
          value={text}
          disabled={!state.ready}
          maxLength={LIMITS.message.max}
          placeholder={state.ready ? `Message ${name}` : 'Setting up keys for this device'}
          onChange={(event) => setDrafts((current) => ({ ...current, [dm.id]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && target) {
              onCancelReply();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" className="icon-button" title="Send" disabled={!state.ready || busy} onClick={() => void submit()}>
          &#10148;
        </button>
      </div>
      <div className="composer-hint">
        {text.length > LIMITS.message.max - 400 ? `${LIMITS.message.max - text.length} characters left` : ''}
      </div>
    </div>
  );
}

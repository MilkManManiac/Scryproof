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
 *     is the single most annoying thing a chat client does. While pinned, the
 *     list follows every change in size, not only new messages: see
 *     lib/stick-to-bottom.ts for why that was the difference.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Permission, emojiNameFrom, houseRules, splitContent } from '@scryproof/shared';
import type { Channel, ContentPart, Emoji, Member, Message, Reaction } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { channelKeysFor } from '../lib/channel-keys';
import { jumpTo } from '../lib/jump';
import { useLocalNames } from '../lib/local-names';
import { fromDraft, nameOf, toDraft, toPlainLine } from '../lib/mentions';
import { EDIT_LAST, on } from '../lib/signals';
import { BottomPin } from '../lib/stick-to-bottom';
import { unreadLine } from '../lib/unread-line';
import { can, useTimeoutEnd } from '../lib/usePermissions';
import { useStore, useTypingUsers } from '../state/store';
import { Avatar } from './Avatar';
import { openPicture } from './Lightbox';
import { useProfileCard } from './ProfileCard';
import { ReactionPicker, rememberReaction } from './ReactionPicker';
import { MarkupTools } from './MarkupTools';
import { applyMarkup, markerForKey } from '../lib/markup';
import { FRAME, sheetUrl, spawnOf } from '../lib/commands';
import { play } from '../lib/stage';
import type { Character } from '../lib/commands';
import { isVoiceFile, isVoiceLabel } from '../lib/voice-note';
import { SealedFile } from './SealedFile';
import { VoicePlayer } from './VoiceNote';

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
  const { state, loadMessages, loadNewerMessages, markRead } = useStore();
  useLocalNames();
  const scroller = useRef<HTMLDivElement>(null);
  const pin = useRef(new BottomPin());
  const content = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [focused, setFocused] = useState(() => document.hasFocus());

  const messages = state.messages[channel.id] ?? [];
  const loaded = state.loadedChannels[channel.id] ?? false;
  // A jump landed on something old: this list is a slice of history that stops
  // short of the newest message.
  const windowed = state.windowedChannels[channel.id] ?? false;
  const typing = useTypingUsers(channel.id);
  const members = state.members[channel.serverId] ?? [];
  const emojis = state.servers[channel.serverId]?.emojis ?? [];

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
  // you are actually looking at. Open in a background tab does not count, and
  // neither does the end of a jump window: that is not the newest message.
  const newestId = messages.at(-1)?.id;
  useEffect(() => {
    if (newestId && loaded && focused && !windowed && pin.current.pinned) markRead(channel.id, newestId);
  }, [channel.id, newestId, loaded, focused, windowed, markRead]);

  // Up in an empty composer edits the last thing this person said here. Only
  // what is loaded counts: a message far enough back to be off the page is
  // not what anyone means by "the last one".
  const [editRequest, setEditRequest] = useState<string | null>(null);
  const editable = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((entry) => entry.authorId === selfId && !entry.deleted && entry.content !== null && entry.kind === 'text'),
    [messages, selfId],
  );
  const editableId = editable?.id;
  useEffect(() => on(EDIT_LAST, () => setEditRequest(editableId ?? null)), [editableId]);

  // Re-pin on channel change, before paint, so a switch always lands at the
  // newest message rather than wherever the previous channel was scrolled to.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) pin.current.open(element);
    else pin.current.pinned = true;
  }, [channel.id]);

  // A window's last row is not the bottom of the channel, so nothing is pinned
  // to it: the jump decides where the eye goes, not this.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (windowed) pin.current.release(element);
    else pin.current.settle(element);
  }, [messages.length, windowed]);

  // Everything else that moves the bottom without adding a message: pictures
  // loading, voice players and polls filling in, the unread bar appearing above
  // the list and taking some of its height. Watching the list itself and its
  // contents catches all of them without each one having to report in.
  useEffect(() => {
    const element = scroller.current;
    const inner = content.current;
    if (!element || !inner) return;
    const observer = new ResizeObserver(() => pin.current.settle(element));
    observer.observe(element);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [canReadHistory]);

  async function onScroll() {
    const element = scroller.current;
    if (!element) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const pinned = pin.current.scrolled(element, !windowed);
    if (pinned && newestId && focused) markRead(channel.id, newestId);

    // Out of a window the same way in: scrolling down fetches the page after
    // the one on screen, until the list reaches the present and stops being a
    // window at all.
    if (windowed && distanceFromBottom < 200 && !loadingNewer) {
      setLoadingNewer(true);
      try {
        await loadNewerMessages(channel.id);
      } catch {
        // Nothing to recover; the window stays on screen.
      } finally {
        setLoadingNewer(false);
      }
      return;
    }

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

  // The first message sent after encryption was switched on, if this channel
  // was plain before. -1 with messages on screen: all of them are older.
  const switchedAt = channel.encryptedAt;
  // Only drawn between two messages we hold: at 0 the switch happened above
  // what has been fetched, and the line would sit over encrypted messages
  // claiming they are not. It appears once the older page is in.
  const sealedFrom = switchedAt ? messages.findIndex((message) => message.createdAt >= switchedAt) : -1;

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
        <div ref={content}>
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
                {channel.encrypted
                  ? ' Messages here are end-to-end encrypted: locked on your devices, and unreadable to the server.'
                  : ''}
              </p>
            </div>
          ) : null}

          {rows.map(({ message, grouped, day, firstNew }, index) => (
            <div key={message.id}>
              {index === sealedFrom && sealedFrom > 0 ? <SealedLine at={channel.encryptedAt} /> : null}
              {day ? <div className="day-divider">{day}</div> : null}
              {firstNew ? (
                <div className="new-divider" ref={divider}>
                  New
                </div>
              ) : null}
              <MessageRow
                message={message}
                encrypted={channel.encrypted}
                grouped={grouped}
                mask={mask}
                members={members}
                emojis={emojis}
                openEditor={editRequest === message.id}
                onEditorOpened={() => setEditRequest(null)}
              />
            </div>
          ))}

          {switchedAt && sealedFrom === -1 && messages.length > 0 ? <SealedLine at={switchedAt} /> : null}

          {loadingNewer ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 8 }}>
              <div className="spinner" />
            </div>
          ) : null}
        </div>
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

/**
 * One of the server's own emoji, drawn at text height.
 *
 * Only ever an `<img>` pointing at our own API, with the `:name:` as its alt
 * text, so a reader with images off or a screen reader still gets what was
 * written rather than nothing.
 */
export function CustomEmoji({ emoji, className }: { emoji: Emoji; className?: string }) {
  return (
    <img
      className={className ?? 'custom-emoji'}
      src={emoji.url}
      alt={`:${emoji.name}:`}
      title={`:${emoji.name}:`}
      loading="lazy"
    />
  );
}

/** The plain text a name or link would read as, for the blacked-out state of a spoiler. */
function plainTextOf(parts: ContentPart[], members: Member[]): string {
  return parts
    .map((part) => {
      if (part.kind === 'text') return part.text;
      if (part.kind === 'emoji') return `:${part.name}:`;
      if (part.kind === 'everyone') return '@everyone';
      if (part.kind === 'link') return part.text;
      if (part.kind === 'spoiler') return plainTextOf(part.parts, members);
      if (part.kind === 'style') return plainTextOf(part.parts, members);
      if (part.kind === 'code') return part.text;
      const member = members.find((entry) => entry.userId === part.userId);
      return `@${member ? nameOf(member) : 'someone who left'}`;
    })
    .join('');
}

/** One drawn part of a message body: text, a mention, an emoji, a link, or a spoiler. */
function ContentPartView({
  part,
  members,
  emojis,
  selfId,
  everyone,
}: {
  part: ContentPart;
  members: Member[];
  emojis: Emoji[];
  selfId?: string;
  everyone: boolean;
}) {
  if (part.kind === 'text') return <>{part.text}</>;
  if (part.kind === 'emoji') {
    const known = emojis.find((entry) => entry.name === part.name);
    // A name this server has no emoji for was never an emoji. It goes back
    // out as the text somebody typed.
    if (!known) return <>:{part.name}:</>;
    return <CustomEmoji emoji={known} />;
  }
  if (part.kind === 'everyone') {
    if (!everyone) return <>@everyone</>;
    return <span className="mention me">@everyone</span>;
  }
  if (part.kind === 'link') {
    return (
      // noreferrer is the point: without it the site being opened learns
      // which page sent the visitor, and the address of a private
      // instance is not theirs to have.
      <a
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
  if (part.kind === 'spoiler') {
    return <Spoiler parts={part.parts} members={members} emojis={emojis} selfId={selfId} everyone={everyone} />;
  }
  if (part.kind === 'code') return <code className="inline-code">{part.text}</code>;
  if (part.kind === 'style') {
    const inner = part.parts.map((child, index) => (
      <ContentPartView key={index} part={child} members={members} emojis={emojis} selfId={selfId} everyone={everyone} />
    ));
    if (part.style === 'bold') return <strong>{inner}</strong>;
    if (part.style === 'italic') return <em>{inner}</em>;
    return <s>{inner}</s>;
  }
  const member = members.find((entry) => entry.userId === part.userId);
  return (
    <span className={part.userId === selfId ? 'mention me' : 'mention'}>
      @{member ? nameOf(member) : 'someone who left'}
    </span>
  );
}

/**
 * `||hidden||`. Blacked out until clicked, then drawn like the rest of the
 * message; a mention or link inside is plain text while hidden and does not
 * become clickable until the spoiler is revealed. State lives here only,
 * so it resets to hidden on reload.
 */
function Spoiler({
  parts,
  members,
  emojis,
  selfId,
  everyone,
}: {
  parts: ContentPart[];
  members: Member[];
  emojis: Emoji[];
  selfId?: string;
  everyone: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <span className="spoiler revealed">
        {parts.map((part, index) => (
          <ContentPartView key={index} part={part} members={members} emojis={emojis} selfId={selfId} everyone={everyone} />
        ))}
      </span>
    );
  }

  const reveal = () => setRevealed(true);
  return (
    <span
      className="spoiler"
      role="button"
      tabIndex={0}
      aria-label="Spoiler, click to show"
      onClick={reveal}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          reveal();
        }
      }}
    >
      {plainTextOf(parts, members)}
    </span>
  );
}

/**
 * Reactions as this reader should see them: nothing a blocked person did, and
 * no chip left standing with nobody behind it. Filtered before the count, so
 * "3" never silently includes somebody whose messages are hidden.
 */
function visibleReactions(reactions: readonly Reaction[], blocks: ReadonlySet<string>): Reaction[] {
  if (blocks.size === 0) return [...reactions];
  return reactions
    .map((reaction) => ({ ...reaction, userIds: reaction.userIds.filter((userId) => !blocks.has(userId)) }))
    .filter((reaction) => reaction.userIds.length > 0);
}

/**
 * A body's parts, drawn, with no box around them. Still only ever text:
 * every part is a React element built from a string, never markup parsed
 * from one. DMs use this too, with nobody to name and no emoji to find.
 */
export function Rich({
  content,
  members,
  emojis,
  selfId,
  everyone,
}: {
  content: string;
  members: Member[];
  emojis: Emoji[];
  selfId?: string;
  /** Whether the server accepted this message's @everyone. Typing the word is not enough. */
  everyone: boolean;
}) {
  return (
    <>
      {splitContent(content).map((part, index) => (
        <span key={index}>
          <ContentPartView part={part} members={members} emojis={emojis} selfId={selfId} everyone={everyone} />
        </span>
      ))}
    </>
  );
}

/** A message body with the people it names drawn as names. */
function MessageContent(props: { content: string; members: Member[]; emojis: Emoji[]; selfId?: string; everyone: boolean }) {
  return (
    <div className="message-text">
      <Rich {...props} />
    </div>
  );
}

/**
 * A `/roll` result, drawn from the plain-text line the server stored:
 * `2d6+3 = 11  [4, 4]  +3`. If the shape is ever unrecognised the whole line
 * still prints, just not broken apart.
 */
const ROLL_LINE_RE = /^(.+?) = (-?\d+)(?:\s\s\[([^\]]*)\])?(.*)$/;

function RollLine({ content }: { content: string }) {
  const match = ROLL_LINE_RE.exec(content);
  if (!match) return <div className="message-text">{content}</div>;
  const [, expression, total, faces, modifiers] = match;

  return (
    <div className="roll">
      <div className="roll-expression">{expression}</div>
      <div className="roll-total">{total}</div>
      {faces || modifiers ? (
        <div className="roll-faces">
          {faces ? `[${faces}]` : ''}
          {modifiers}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A poll: the question already prints as the message's ordinary text above
 * this, so here is just the choices, a click to vote, and who may close it.
 * The server holds the truth; this draws whatever it last sent back.
 */
function PollView({ message, selfId, canManage }: { message: Message; selfId?: string; canManage: boolean }) {
  const { applyMessage } = useStore();
  const poll = message.poll;
  if (!poll) return null;

  const closed = Boolean(poll.closedAt);
  const total = poll.counts.reduce((sum, count) => sum + count, 0);
  const canClose = !closed && (message.authorId === selfId || canManage);

  async function vote(index: number) {
    if (closed || !poll) return;
    const picked = poll.mine.includes(index);
    const next = poll.multiple
      ? picked
        ? poll.mine.filter((option) => option !== index)
        : [...poll.mine, index]
      : picked
        ? []
        : [index];
    try {
      const { message: updated } = await api.messages.vote(message.id, next);
      applyMessage(message.channelId, updated);
    } catch {
      // The tally already on screen came from the server too; nothing to undo.
    }
  }

  async function close() {
    try {
      const { message: updated } = await api.messages.closePoll(message.id);
      applyMessage(message.channelId, updated);
    } catch {
      // As above.
    }
  }

  return (
    <div className="poll">
      {poll.options.map((option, index) => {
        const count = poll.counts[index] ?? 0;
        const share = total > 0 ? Math.round((count / total) * 100) : 0;
        const mine = poll.mine.includes(index);
        return (
          <button
            key={index}
            type="button"
            className={mine ? 'poll-option mine' : 'poll-option'}
            disabled={closed}
            onClick={() => void vote(index)}
          >
            <span className="poll-option-bar" style={{ width: `${share}%` }} />
            <span className="poll-option-text">{option}</span>
            <span className="poll-option-count">{count}</span>
          </button>
        );
      })}
      <div className="poll-footer">
        <span>{closed ? 'Closed' : 'Open'}</span>
        {canClose ? (
          <button type="button" className="poll-close" onClick={() => void close()}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What a spawn command leaves behind: the face, the name, and a click to
 * send it across again. `again` asks the server to play it for everyone
 * looking, the clicker included (their copy comes back like everyone
 * else's). If that fails, it still plays here.
 */
export function PlayLine({ character, again }: { character: Character; again?: () => Promise<unknown> }) {
  // Said when "again" hits the limit, instead of quietly playing it for you
  // alone, which looked as if everyone had seen it.
  const [limited, setLimited] = useState<string | null>(null);
  useEffect(() => {
    if (!limited) return;
    const timer = window.setTimeout(() => setLimited(null), 4000);
    return () => window.clearTimeout(timer);
  }, [limited]);

  const onClick = () => {
    if (!again) {
      play(character.id);
      return;
    }
    again().catch((problem: unknown) => {
      if (problem instanceof ApiError && problem.status === 429) {
        setLimited(jumpLimitNote(problem.retryAfterSeconds));
        return;
      }
      play(character.id);
    });
  };
  return (
    <span className="play-line-wrap">
      <button type="button" className="play-line" title="Again, for everyone looking" onClick={onClick}>
        <span
          className="meepo-face"
          style={{ backgroundImage: `url(${sheetUrl(character.id)})`, backgroundSize: `auto 100%` }}
        />
        <span>
          <strong>{character.name}</strong> jumped across
        </span>
        <span className="play-line-again">again</span>
      </button>
      {limited ? (
        <span className="play-line-limit" role="status">
          {limited}
        </span>
      ) : null}
    </span>
  );
}

/** What hitting the jump limit says, with how long is left when the server says. */
export function jumpLimitNote(retryAfterSeconds?: number): string {
  const wait = retryAfterSeconds && retryAfterSeconds > 0 ? ` Try again in ${retryAfterSeconds}s.` : ' Wait a moment.';
  return `That is a lot of jumping.${wait}`;
}

/** What a sealed message that did not open says instead. Never the bytes. */
function sealedProblem(status: Message['sealed']): string {
  switch (status) {
    case 'no-key':
      return "Locked. This device doesn't have the key for this message yet.";
    case 'forged':
      return "Not shown: its signature doesn't match the person it says it's from.";
    case undefined:
      return 'Encrypted message.';
    default:
      return 'This message would not open.';
  }
}

/**
 * Where a channel that was plain became encrypted. Everything above it was
 * sent before, and stays readable to the server; saying so is the point.
 */
function SealedLine({ at }: { at: string | null }) {
  const when = at ? new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  return (
    <div className="sealed-line" role="note">
      End-to-end encryption turned on{when ? `, ${when}` : ''}. Messages above this line were sent before and are not encrypted.
    </div>
  );
}

function MessageRow({
  message,
  encrypted,
  grouped,
  mask,
  members,
  emojis,
  openEditor,
  onEditorOpened,
}: {
  message: Message;
  /** The channel is encrypted now: an edit seals, even a message from before it was. */
  encrypted: boolean;
  grouped: boolean;
  mask: bigint;
  members: Member[];
  emojis: Emoji[];
  /** Set when the composer asked for this one, the last thing this person said. */
  openEditor?: boolean;
  onEditorOpened?: () => void;
}) {
  const { state, replyTo } = useStore();
  const card = useProfileCard();
  const serverId = members[0]?.serverId ?? null;
  const [editing, setEditing] = useState(false);
  const [editProblem, setEditProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  /** The picker under the + after the reactions, as opposed to the hover tray. */
  const [adding, setAdding] = useState(false);
  const editBox = useRef<HTMLTextAreaElement>(null);
  /** One blocked message shown on purpose. It hides again on reload. */
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!openEditor || editing) return;
    setDraft(toDraft(message.content ?? '', members));
    setEditing(true);
    onEditorOpened?.();
  }, [openEditor, editing, message.content, members, onEditorOpened]);

  const blocked = state.blocks.has(message.authorId);
  if (blocked && !shown) {
    return (
      <div id={`message-${message.id}`} className="message blocked">
        <button type="button" className="blocked-message" onClick={() => setShown(true)}>
          Blocked message. Show.
        </button>
      </div>
    );
  }

  const selfId = state.user?.id;
  const mine = message.authorId === selfId;
  // A timeout takes away reacting, replying and editing, but not reading and
  // not deleting your own. It is not in the mask, so it is checked beside it.
  const timedOut = Boolean(useTimeoutEnd(members.find((entry) => entry.userId === selfId)));
  const canDelete = mine || can(mask, Permission.MANAGE_MESSAGES);
  const canPin = can(mask, Permission.MANAGE_MESSAGES) && !message.deleted;
  // Saving is nobody's business but the saver's, so unlike pinning it needs no
  // permission beyond being able to see the message at all. It never changes
  // under this row from anywhere else (no gateway event exists for it), so a
  // plain optimistic toggle on top of what the message arrived with is enough.
  const [bookmarked, setBookmarked] = useState(message.bookmarked ?? false);
  const canReact = can(mask, Permission.ADD_REACTIONS) && !timedOut;
  const canReply = can(mask, Permission.SEND_MESSAGES) && !timedOut;
  const at = new Date(message.createdAt);
  const reactions = visibleReactions(message.reactions ?? [], state.blocks);
  // A blocked person's mention is not a ping, on the server or here, so the
  // row is not lit up even once it has been shown.
  const pingsMe =
    !mine &&
    !blocked &&
    !message.deleted &&
    (message.mentionsEveryone || (selfId ? (message.mentions ?? []).includes(selfId) : false));

  function toggle(emoji: string) {
    const has = reactions.find((entry) => entry.emoji === emoji)?.userIds.includes(selfId ?? '');
    if (!has) rememberReaction(emoji);
    void (has ? api.messages.unreact(message.id, emoji) : api.messages.react(message.id, emoji)).catch(() => undefined);
  }

  async function saveEdit() {
    const next = fromDraft(houseRules(draft.trim()), members);
    if (!next || next === message.content) {
      setEditing(false);
      return;
    }
    setEditProblem(null);
    try {
      if ((message.ciphertext || encrypted) && selfId) {
        const parentAuthor = message.replyTo?.authorId ?? null;
        await channelKeysFor(selfId).edit(message.id, {
          channelId: message.channelId,
          text: next,
          replyToId: message.replyToId,
          replyAuthorId: parentAuthor,
          memberIds: new Set(members.map((member) => member.userId)),
          canMentionEveryone: can(mask, Permission.MENTION_EVERYONE),
          files: message.sealedFiles,
        });
      } else {
        await api.messages.edit(message.id, next);
      }
      setEditing(false);
    } catch (problem) {
      // The editor stays open with the text in it, and says why. Closing it
      // quietly looked like a save that did nothing (a channel just switched
      // to encryption, before this device has its key, was the usual case).
      setEditProblem(problem instanceof Error && problem.message ? problem.message : 'The edit did not save.');
    }
  }

  const author = members.find((entry) => entry.userId === message.authorId);
  const spawn = message.deleted ? null : spawnOf(message.content);
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
                : message.ciphertext
                  ? 'Encrypted message'
                  : 'Sent a file'}
          </span>
        </button>
      ) : null}

      {grouped ? (
        <span className="message-hover-time">{timeFormat.format(at)}</span>
      ) : (
        <div className="message-gutter">
          <button
            type="button"
            className="who"
            title={`@${message.author.username}`}
            onClick={(event) => card.show(message.author, event.currentTarget, serverId)}
          >
            <Avatar user={message.author} />
          </button>
        </div>
      )}

      <div className="message-body">
        {grouped ? null : (
          <div className="message-meta">
            <button
              type="button"
              className="message-author who"
              style={{ color: message.author.accent }}
              title={`@${message.author.username}`}
              onClick={(event) => card.show(message.author, event.currentTarget, serverId)}
            >
              {author ? nameOf(author) : message.author.displayName}
            </button>
            <time className="message-time" dateTime={message.createdAt}>
              {timeFormat.format(at)}
            </time>
            {message.pinnedAt ? <span className="message-pinned" title="Pinned in this channel">pinned</span> : null}
            {bookmarked ? <span className="message-pinned" title="Saved">saved</span> : null}
          </div>
        )}
        {grouped && message.pinnedAt ? <span className="message-pinned" title="Pinned in this channel">pinned</span> : null}
        {grouped && bookmarked ? <span className="message-pinned" title="Saved">saved</span> : null}

        {message.deleted ? (
          <div className="message-text deleted">Message deleted</div>
        ) : editing ? (
          <>
            <textarea
              ref={editBox}
              className="composer-input"
              style={{ width: '100%', background: 'var(--bg-raised)', borderRadius: 6, padding: 8 }}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                const marker = markerForKey(event);
                if (marker) {
                  event.preventDefault();
                  applyMarkup(event.currentTarget, marker, setDraft);
                  return;
                }
                if (event.key === 'Escape') setEditing(false);
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void saveEdit();
                }
              }}
            />
            <div className="edit-tools">
              <MarkupTools input={editBox} setValue={setDraft} />
              <span>{editProblem ?? 'Enter to save, Escape to leave it'}</span>
            </div>
          </>
        ) : (
          <>
            {message.kind === 'roll' && message.content ? (
              <RollLine content={message.content} />
            ) : message.kind === 'poll' && message.content ? (
              <>
                <div className="message-text">
                  <strong>{message.content}</strong>
                </div>
                <PollView message={message} selfId={selfId} canManage={can(mask, Permission.MANAGE_MESSAGES)} />
              </>
            ) : spawn ? (
              <PlayLine character={spawn} again={() => api.messages.replay(message.id)} />
            ) : message.ciphertext && message.content === null ? (
              <div className="message-text deleted sealed-problem">{sealedProblem(message.sealed)}</div>
            ) : message.content &&
              // A voice message's body only names it for search and previews;
              // the player below says the same thing.
              !(
                isVoiceLabel(message.content) &&
                (message.attachments.some((file) => !file.sealed && isVoiceFile(file.filename)) ||
                  (message.sealedFiles ?? []).some((file) => isVoiceFile(file.name)))
              ) ? (
              <MessageContent
                content={message.content}
                members={members}
                emojis={emojis}
                selfId={selfId}
                everyone={message.mentionsEveryone ?? false}
              />
            ) : null}

            {message.editedAt ? <span className="message-edited">edited</span> : null}
            {message.sealed === 'unverified' ? (
              <span
                className="message-edited sealed-unverified"
                title="Signed by a device of theirs that you have not accepted yet. Open the lock at the top of the channel to check it."
              >
                unverified device
              </span>
            ) : null}

            {(message.sealedFiles ?? []).map((file) => {
              const locked = message.attachments.find((attachment) => attachment.id === file.id);
              return locked ? <SealedFile key={file.id} channelId={message.channelId} file={file} locked={locked} /> : null;
            })}

            {/* Locked copies are drawn above, from what the message says they are, or not at all. */}
            {message.attachments.filter((attachment) => !attachment.sealed).map((attachment) =>
              isVoiceFile(attachment.filename) ? (
                <VoicePlayer
                  key={attachment.id}
                  id={attachment.id}
                  name={attachment.filename}
                  load={async () => {
                    const response = await fetch(attachment.url, { credentials: 'same-origin' });
                    if (!response.ok) throw new Error('This file could not be fetched.');
                    return new Uint8Array(await response.arrayBuffer());
                  }}
                />
              ) : attachment.contentType.startsWith('image/') ? (
                <button
                  key={attachment.id}
                  type="button"
                  className="attachment-open"
                  title="Look closer"
                  onClick={() => openPicture({ url: attachment.url, name: attachment.filename })}
                >
                  <img className="attachment-image" src={attachment.url} alt={attachment.filename} loading="lazy" />
                </button>
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
                  // A reaction outlives the emoji it names. One that has been
                  // removed since falls back to the `:name:` that was stored.
                  const name = emojiNameFrom(reaction.emoji);
                  const custom = name ? emojis.find((entry) => entry.name === name) : undefined;
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
                      {custom ? (
                        <CustomEmoji emoji={custom} className="reaction-emoji-image" />
                      ) : (
                        <span className="reaction-emoji">{reaction.emoji}</span>
                      )}
                      <span className="reaction-count">{reaction.userIds.length}</span>
                    </button>
                  );
                })}
                {canReact ? (
                  <span className={adding ? 'reaction-add open' : 'reaction-add'}>
                    <button type="button" className="reaction add" title="Add a reaction" onClick={() => setAdding((open) => !open)}>
                      +
                    </button>
                    {adding ? (
                      <ReactionPicker
                        emojis={emojis}
                        place="below-left"
                        onClose={() => setAdding(false)}
                        onPick={(emoji) => {
                          setAdding(false);
                          toggle(emoji);
                        }}
                      />
                    ) : null}
                  </span>
                ) : null}
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
              emojis={emojis}
              onClose={() => setPicking(false)}
              onPick={(emoji) => {
                setPicking(false);
                toggle(emoji);
              }}
            />
          ) : null}
          {mine && !timedOut && message.content !== null && message.kind === 'text' ? (
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
          {canPin ? (
            <button
              type="button"
              className={message.pinnedAt ? 'icon-button on' : 'icon-button'}
              title={message.pinnedAt ? 'Unpin' : 'Pin'}
              onClick={() => void (message.pinnedAt ? api.messages.unpin(message.id) : api.messages.pin(message.id)).catch(() => undefined)}
            >
              &#128204;
            </button>
          ) : null}
          <button
            type="button"
            className={bookmarked ? 'icon-button on' : 'icon-button'}
            title={bookmarked ? 'Unsave' : 'Save'}
            onClick={() => {
              const next = !bookmarked;
              setBookmarked(next);
              void (next ? api.messages.bookmark(message.id) : api.messages.unbookmark(message.id)).catch(() =>
                setBookmarked(!next),
              );
            }}
          >
            &#128278;
          </button>
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

/**
 * Comments on a stream: a column beside a screen being watched big (`side`),
 * or a short list (`list`) under a music share being listened to, on the
 * sharer's own music card, and under the grid for someone sharing a screen. Wes, 2026-10-06: "people
 * watching/listening to a stream can post temp comments".
 *
 * Nothing here is kept. The comments live in the call session's memory
 * (`stream-chat.ts`) and go when the stream does. Text is drawn as plain
 * text: no links, no pictures, no markup.
 *
 * "Encrypted" shows under the same condition as the call's own label. Each
 * comment is sealed with the sender's call key before it leaves, and a
 * comment that does not open under the sender's key is never drawn.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PublicUser } from '@scryproof/shared';

import { useStore } from '../state/store';
import { useDms } from '../state/dms';
import { useVoice } from '../state/useVoice';
import { nameFor, useLocalNames } from '../lib/local-names';
import { COUNT_FROM, MAX_LENGTH, type StreamComment } from '../lib/stream-chat';
import { Avatar, initials } from './Avatar';

const NONE: StreamComment[] = [];
/**
 * Whether the column beside a screen is open. Starts closed (Wes 10-19: "the
 * comments thing is kinda in the way") and remembers the last choice for the
 * rest of this tab, across streams.
 */
let columnWanted = false;

/** A name and a picture for anyone in the call: you, someone in this server, or someone from a conversation. */
function usePeople(): (userId: string) => { name: string; user?: PublicUser } {
  const { state } = useStore();
  const { state: dms } = useDms();
  useLocalNames();
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  return (userId) => {
    const member = members.find((entry) => entry.userId === userId);
    const fromDm = Object.values(dms.dms)
      .flatMap((dm) => dm.members)
      .find((entry) => entry.id === userId);
    const user = (userId === state.user?.id ? state.user : undefined) ?? member?.user ?? fromDm;
    return { user, name: nameFor(userId, member?.nickname ?? user?.displayName ?? 'Someone') };
  };
}

function LockMark() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm2 0h4V5a2 2 0 1 0-4 0v2Z"
      />
    </svg>
  );
}

export function StreamChat({ stream, variant }: { stream: string; variant: 'side' | 'list' }) {
  const { state, voice: session } = useStore();
  const voice = useVoice();
  const personOf = usePeople();
  const comments = voice.comments[stream] ?? NONE;
  const queue = voice.queues[stream] ?? NONE;
  const [draft, setDraft] = useState('');
  /** The next send is a song request, not a comment. */
  const [asking, setAsking] = useState(false);
  const [resting, setResting] = useState(false);
  const [open, setOpenState] = useState(variant !== 'side' || columnWanted);
  const setOpen = (next: boolean) => {
    columnWanted = next;
    setOpenState(next);
  };
  /** How many were in the list the last time it was open, for the count on the closed button. */
  const seen = useRef(comments.length);
  if (open) seen.current = comments.length;
  const list = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);

  // Newest at the bottom, followed unless the reader scrolled up to read.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [comments, open]);
  // The strip changing size (a phone turned, the window narrowed) keeps the newest in view too.
  useEffect(() => {
    const el = list.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const follow = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    follow.observe(el);
    return () => follow.disconnect();
  }, [open]);
  useEffect(() => {
    if (!resting) return undefined;
    const timer = setTimeout(() => setResting(false), Math.max(250, session.commentWait()));
    return () => clearTimeout(timer);
  }, [resting, session]);

  const selfId = state.user?.id;
  const serverMuted = Object.values(state.voiceStates).some((entry) => entry.userId === selfId && entry.serverMute);
  const length = [...draft.trim()].length;
  const tooLong = length > MAX_LENGTH;

  const send = async (): Promise<void> => {
    if (!draft.trim() || tooLong || resting) return;
    const text = draft;
    // The rate is counted the moment this is called, so the rest that follows knows how long to wait.
    const sending = session.sendComment(stream, text, asking ? 'request' : undefined);
    setResting(true);
    if (await sending) {
      setDraft((now) => (now === text ? '' : now));
      setAsking(false);
    }
  };
  const sharing = session.sharerOf(stream) === selfId;
  const played = (key: string): void => {
    if (resting) return;
    void session.sendComment(stream, key, 'played');
    setResting(true);
  };

  if (variant === 'side' && !open) {
    const unseen = comments.length - seen.current;
    return (
      <button type="button" className="stream-chat-reopen" title="Show comments" onClick={() => setOpen(true)}>
        Comments
        {unseen > 0 ? <span className="stream-chat-unseen">{unseen}</span> : null}
      </button>
    );
  }

  return (
    <section className={`stream-chat ${variant}`} aria-label="Comments on this stream">
      {variant === 'side' ? (
        <header className="stream-chat-head">
          <span>Comments</span>
          <button type="button" className="link-button" title="Hide comments" onClick={() => setOpen(false)}>
            Hide
          </button>
        </header>
      ) : null}
      {queue.length > 0 ? (
        <div className="stream-chat-queue">
          <div className="stream-chat-queue-head">Song requests</div>
          <ol>
            {queue.map((request) => (
              <li key={request.key}>
                <span className="stream-chat-words">
                  <strong>{personOf(request.userId).name}</strong> {request.text}
                </span>
                {sharing ? (
                  <button type="button" className="link-button" disabled={resting} onClick={() => played(request.key)}>
                    Played
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <ol
        ref={list}
        className="stream-chat-list"
        onScroll={(event) => {
          const el = event.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {comments.length === 0 ? <li className="stream-chat-empty">Comments disappear when the stream ends.</li> : null}
        {comments.map((comment) => {
          const person = personOf(comment.userId);
          return (
            <li key={comment.key} className="stream-chat-line" data-user-id={comment.userId}>
              {person.user ? (
                <Avatar user={person.user} name={person.name} small />
              ) : (
                <span className="avatar small" aria-hidden="true">
                  {initials(person.name)}
                </span>
              )}
              <span className="stream-chat-words">
                <strong>{person.name}</strong> {comment.request ? <span className="stream-chat-request">request</span> : null} {comment.text}
              </span>
            </li>
          );
        })}
      </ol>
      {serverMuted ? (
        <p className="stream-chat-note">A moderator has muted you.</p>
      ) : (
        <form
          className="stream-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <button
            type="button"
            className={`stream-chat-ask${asking ? ' on' : ''}`}
            title={asking ? 'Sending as a song request' : 'Request a song'}
            aria-pressed={asking}
            disabled={!voice.encrypted}
            onClick={() => setAsking((now) => !now)}
          >
            &#9834;
          </button>
          <input
            className="stream-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={asking ? 'Request a song' : 'Say something'}
            aria-label={asking ? 'Request a song on this stream' : 'Comment on this stream'}
            disabled={!voice.encrypted}
          />
          <button
            type="submit"
            className="button inline"
            disabled={!voice.encrypted || resting || tooLong || length === 0}
          >
            Send
          </button>
          <div className="stream-chat-foot">
            {voice.encrypted ? (
              <span className="stream-chat-lock" title="Only people in this call can read these">
                <LockMark /> Encrypted
              </span>
            ) : (
              <span>Comments need the call to be encrypted.</span>
            )}
            {length > COUNT_FROM ? (
              <span className={tooLong ? 'stream-chat-count over' : 'stream-chat-count'}>
                {length}/{MAX_LENGTH}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}

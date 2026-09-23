/**
 * The message box.
 *
 * It disables itself when the server says the member cannot post, but that is
 * a courtesy only: the send endpoint checks SEND_MESSAGES again and slowmode
 * again, and a client that posts anyway simply gets a 403.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS, Permission, emojiToken, houseRules } from '@scryproof/shared';
import type { Attachment, Channel } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { commandOffers, commandQueryAt, expandTextCommand, isInitCommand } from '../lib/commands';
import { channelDrafts } from '../lib/drafts';
import { emojiOffers, expandShortcodes } from '../lib/emoji';
import { emojiQueryAt, fromDraft, mentionLabel, mentionQueryAt, nameOf, toPlainLine } from '../lib/mentions';
import { applyMarkup, markerForKey } from '../lib/markup';
import { ScrubError, scrubImage } from '../lib/scrub-image';
import { EDIT_LAST, emit } from '../lib/signals';
import { can, useTimeoutEnd } from '../lib/usePermissions';
import { voiceLabel } from '../lib/voice-note';
import { useStore } from '../state/store';
import { MarkupTools } from './MarkupTools';
import { ReactionPicker } from './ReactionPicker';
import { Spawner } from './Spawner';
import { RecordButton } from './VoiceNote';

/** One row in the list under the box, for a person or for one of the server's emoji. */
interface Offer {
  key: string;
  /** What is written into the draft when this row is picked. */
  written: string;
  /** What the row reads as. */
  name: string;
  note: string;
  /** Set for a custom emoji, so the row shows the image it will insert. */
  imageUrl?: string;
  /** Set for a character command, so the row shows the face. */
  sheet?: string;
  /** Set for a built-in emoji, drawn as itself. */
  glyph?: string;
}

export function Composer({ channel, mask }: { channel: Channel; mask: bigint }) {
  const { state, sendTyping, replyTo, applyTracker } = useStore();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [chosen, setChosen] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  /** Which of the two boards beside Send is open. */
  const [board, setBoard] = useState<'emoji' | 'spawn' | null>(null);

  // Keeps the in-progress draft alongside the box's own state, so switching to
  // another channel and back puts the same text where it was left. Only the
  // text: pending attachments are uploads in flight and are not kept.
  function updateText(value: string) {
    setText(value);
    channelDrafts.set(channel.id, value);
  }

  const members = state.members[channel.serverId] ?? [];

  // A timeout is not a permission, so it cannot be read off the mask. The send
  // endpoint refuses either way; this only keeps the box from pretending.
  const timedOutUntil = useTimeoutEnd(members.find((member) => member.userId === state.user?.id));

  const mayPost = can(mask, Permission.SEND_MESSAGES) && !timedOutUntil;
  const mayAttach = can(mask, Permission.ATTACH_FILES) && !timedOutUntil;
  const mayPingEveryone = can(mask, Permission.MENTION_EVERYONE);

  const emojis = state.servers[channel.serverId]?.emojis ?? [];
  const replyingTo = state.replyingTo[channel.id] ?? null;

  // The list under the box while an @name or a :emoji is being typed. Only one
  // can be open at a time: each pattern needs its own mark immediately before
  // the word, and only one character can sit there.
  const asking = dismissed ? null : mentionQueryAt(text, caret);
  const askingEmoji = dismissed || asking ? null : emojiQueryAt(text, caret);
  // A `/word` at the very start: the commands.
  const askingCommand = dismissed || asking || askingEmoji ? null : commandQueryAt(text, caret);
  const query = asking?.query;
  const emojiQuery = askingEmoji?.query;
  const commandQuery = askingCommand?.query;

  const offers = useMemo<Offer[]>(() => {
    if (commandQuery !== undefined) {
      return commandOffers(commandQuery).map((offer) => ({
        key: offer.key,
        written: offer.written,
        name: offer.name,
        note: offer.note,
        sheet: offer.sheet,
      }));
    }
    if (emojiQuery !== undefined) {
      // The server's own first, then the built-in names, seven in all.
      const own: Offer[] = emojis
        .filter((emoji) => emoji.name.includes(emojiQuery))
        // Names that start with what was typed come before names that contain it.
        .sort((a, b) => Number(b.name.startsWith(emojiQuery)) - Number(a.name.startsWith(emojiQuery)))
        .slice(0, 7)
        .map((emoji) => ({
          key: emoji.id,
          written: emojiToken(emoji.name),
          name: emojiToken(emoji.name),
          note: 'this server',
          imageUrl: emoji.url,
        }));
      const builtIn: Offer[] = emojiOffers(emojiQuery, 7 - own.length).map((offer) => ({
        key: `emoji:${offer.name}`,
        written: offer.emoji,
        name: `:${offer.name}:`,
        note: '',
        glyph: offer.emoji,
      }));
      return [...own, ...builtIn];
    }
    if (query === undefined) return [];
    const people: Offer[] = members
      .filter((member) =>
        [nameOf(member), member.user.displayName, member.user.username].some((name) =>
          name.toLowerCase().includes(query),
        ),
      )
      // Names that start with what was typed come before names that contain it.
      .sort((a, b) => Number(nameOf(b).toLowerCase().startsWith(query)) - Number(nameOf(a).toLowerCase().startsWith(query)))
      .slice(0, 7)
      .map((member) => ({
        key: member.userId,
        written: `@${mentionLabel(member, members)}`,
        name: `@${nameOf(member)}`,
        note: member.user.username,
      }));
    if (mayPingEveryone && 'everyone'.startsWith(query)) {
      people.push({
        key: 'everyone',
        written: '@everyone',
        name: '@everyone',
        note: 'pings every person who can see this channel',
      });
    }
    return people;
  }, [query, emojiQuery, commandQuery, members, emojis, mayPingEveryone]);
  const picked = Math.min(chosen, Math.max(0, offers.length - 1));

  /**
   * Put the chosen completion in place of what was being typed and leave the
   * caret after it. `written` is what lands in the box: `@Name ` for a person,
   * `:name: ` for one of the server's emoji.
   */
  function complete(written: string) {
    const span = asking ?? askingEmoji ?? askingCommand;
    if (!span) return;
    const next = `${text.slice(0, span.start)}${written} ${text.slice(caret)}`;
    const position = span.start + written.length + 1;
    updateText(next);
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }

  /** Put something in at the caret, from one of the boards, and keep typing. */
  function insert(piece: string) {
    const at = Math.min(caret, text.length);
    const next = `${text.slice(0, at)}${piece}${text.slice(at)}`;
    const position = at + piece.length;
    updateText(next);
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
      grow();
    });
  }

  // Picking "reply" on a message should put you straight into typing it.
  useEffect(() => {
    if (replyingTo) input.current?.focus();
  }, [replyingTo]);

  // Whatever was left unsent in this channel comes back, cursor at the end.
  // Pending attachments are uploads in flight, not draft text, so they are
  // not kept: switching channels mid-upload abandons them, same as before.
  useEffect(() => {
    const draft = channelDrafts.get(channel.id);
    setText(draft);
    setCaret(draft.length);
    setPending([]);
    setError(null);
    setCooldown(0);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(draft.length, draft.length);
      grow();
    });
  }, [channel.id]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function grow() {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 340)}px`;
  }

  async function send(override?: string) {
    const typed = override ?? text.trim();
    if (!override && isInitCommand(typed)) {
      await startInitiative();
      return;
    }
    // `:fire:` becomes the emoji unless this server has its own by that
    // name; `/shrug` becomes its text. A character command goes as typed.
    const body = expandTextCommand(expandShortcodes(typed, (name) => emojis.some((emoji) => emoji.name === name)));
    if ((!body && pending.length === 0) || cooldown > 0) return;
    const answering = replyingTo;
    // From the board, the command goes on its own: whatever was half typed
    // stays in the box, and the files waiting there stay waiting.
    const files = override ? [] : pending;

    if (!override) {
      updateText('');
      setPending([]);
      replyTo(channel.id, null);
      requestAnimationFrame(grow);
    }
    setError(null);

    try {
      await api.messages.send(channel.id, {
        content: body ? houseRules(fromDraft(body, members)) : undefined,
        replyToId: override ? undefined : answering?.id,
        attachmentIds: files.length > 0 ? files.map((file) => file.id) : undefined,
      });
    } catch (problem) {
      // Put the draft back rather than losing what someone typed.
      if (!override) {
        updateText(typed);
        setPending(pending);
        replyTo(channel.id, answering);
      }
      if (problem instanceof ApiError) {
        setError(problem.message);
        if (problem.retryAfterSeconds) setCooldown(problem.retryAfterSeconds);
      } else {
        setError('Message did not send.');
      }
    }
  }

  /**
   * `/init` is not a message. It asks the server for this channel's tracker,
   * which starts one or answers with the one already running; the server
   * posts "Initiative started." itself when it is new.
   */
  async function startInitiative() {
    setError(null);
    updateText('');
    requestAnimationFrame(grow);
    try {
      const { tracker } = await api.trackers.start(channel.id);
      applyTracker(channel.id, tracker);
    } catch (problem) {
      updateText('/init');
      setError(problem instanceof ApiError ? problem.message : 'Initiative did not start.');
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !mayAttach) return;
    if (pending.length + files.length > LIMITS.attachmentsPerMessage) {
      setError(`Up to ${LIMITS.attachmentsPerMessage} files per message.`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        // Images are re-encoded here, before anything leaves the machine, so
        // the GPS coordinates in a phone photo are never sent. If that fails
        // the upload stops: sending the original instead would defeat it.
        const clean = await scrubImage(file);
        const attachment = await api.upload(channel.id, clean);
        setPending((prev) => [...prev, attachment]);
      }
    } catch (problem) {
      if (problem instanceof ScrubError) setError(problem.message);
      else setError(problem instanceof ApiError ? problem.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (filePicker.current) filePicker.current.value = '';
    }
  }

  /**
   * A voice message goes on its own, like a command from the board: the draft
   * and any files waiting in the box stay where they are. It is an ordinary
   * attachment, so the server checks ATTACH_FILES on the upload as it would
   * for any other file.
   */
  async function sendVoice(file: File, seconds: number) {
    if (cooldown > 0) throw new Error(`Slowmode. Wait ${cooldown}s.`);
    const answering = replyingTo;
    setError(null);
    try {
      const attachment = await api.upload(channel.id, file);
      await api.messages.send(channel.id, {
        content: voiceLabel(seconds),
        replyToId: answering?.id,
        attachmentIds: [attachment.id],
      });
      if (answering) replyTo(channel.id, null);
    } catch (problem) {
      if (problem instanceof ApiError && problem.retryAfterSeconds) setCooldown(problem.retryAfterSeconds);
      throw problem instanceof ApiError ? new Error(problem.message) : new Error('The voice message did not send.');
    }
  }

  const slowmode = channel.slowmodeSeconds ?? 0;

  return (
    <div className="composer">
      {error ? (
        <div className="error" style={{ marginBottom: 8 }}>
          {error}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="composer-pending">
          {pending.map((file) => (
            <span className="pending-file" key={file.id}>
              {file.filename}
              <button
                type="button"
                className="icon-button"
                style={{ width: 18, height: 18 }}
                title="Remove"
                onClick={() => setPending((prev) => prev.filter((entry) => entry.id !== file.id))}
              >
                &#10005;
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {offers.length > 0 ? (
        <div
          className="mention-offers"
          role="listbox"
          aria-label={commandQuery !== undefined ? 'Commands' : emojiQuery === undefined ? 'People to mention' : 'Emoji to insert'}
        >
          {offers.map((offer, index) => (
            <button
              key={offer.key}
              type="button"
              role="option"
              aria-selected={index === picked}
              className={index === picked ? 'mention-offer active' : 'mention-offer'}
              // mousedown, not click: a click would take focus from the box first.
              onMouseDown={(event) => {
                event.preventDefault();
                complete(offer.written);
              }}
              onMouseEnter={() => setChosen(index)}
            >
              {offer.imageUrl ? (
                <img className="custom-emoji" src={offer.imageUrl} alt="" loading="lazy" />
              ) : offer.sheet ? (
                <span className="meepo-face" style={{ backgroundImage: `url(${offer.sheet})`, backgroundSize: 'auto 100%' }} />
              ) : offer.glyph ? (
                <span className="reaction-emoji">{offer.glyph}</span>
              ) : commandQuery !== undefined ? (
                <span className="meepo-face" aria-hidden="true" />
              ) : null}
              <span className="mention-offer-name">{offer.name}</span>
              <span className="mention-offer-note">{offer.note}</span>
            </button>
          ))}
        </div>
      ) : null}

      {replyingTo ? (
        <div className="composer-reply">
          <span className="composer-reply-text">
            Replying to <strong>{replyingTo.author.displayName}</strong>
            {replyingTo.content ? <span className="composer-reply-quote">{toPlainLine(replyingTo.content, members)}</span> : null}
          </span>
          <button type="button" className="link-button" onClick={() => replyTo(channel.id, null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <div
        className={mayPost ? 'composer-box' : 'composer-box denied'}
        onDragOver={(event) => {
          if (mayAttach) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!mayAttach) return;
          event.preventDefault();
          void upload(event.dataTransfer.files);
        }}
      >
        {/* Where this is going, on the line you type into. The header names
            the channel too, but it is a screen away from the caret; this is
            the answer to "which room am I in" at the moment of sending. */}
        <span className="composer-label" title={`#${channel.name}`}>
          <span className="composer-label-mark">#</span>
          {channel.name}
        </span>

        {mayAttach ? (
          <>
            <input
              ref={filePicker}
              type="file"
              multiple
              hidden
              onChange={(event) => void upload(event.target.files)}
            />
            <button
              type="button"
              className="icon-button"
              title="Attach a file"
              disabled={uploading}
              onClick={() => filePicker.current?.click()}
            >
              {uploading ? <span className="spinner" /> : '+'}
            </button>
          </>
        ) : null}

        <textarea
          ref={input}
          className="composer-input"
          rows={1}
          value={text}
          disabled={!mayPost}
          maxLength={LIMITS.message.max}
          placeholder={
            mayPost
              ? cooldown > 0
                ? `Slowmode. ${cooldown}s`
                : 'Write something'
              : timedOutUntil
                ? `You are timed out until ${timedOutUntil.toLocaleString()}.`
                : 'You do not have permission to post here.'
          }
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onChange={(event) => {
            updateText(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setDismissed(false);
            setChosen(0);
            grow();
            if (event.target.value.trim()) sendTyping(channel.id);
          }}
          onPaste={(event) => {
            const files = event.clipboardData?.files;
            if (mayAttach && files && files.length > 0) {
              event.preventDefault();
              void upload(files);
            }
          }}
          onKeyDown={(event) => {
            const marker = markerForKey(event);
            if (marker) {
              event.preventDefault();
              applyMarkup(event.currentTarget, marker, setText);
              return;
            }
            if (offers.length > 0) {
              const offer = offers[picked];
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setChosen((picked + step + offers.length) % offers.length);
                return;
              }
              if ((event.key === 'Enter' || event.key === 'Tab') && offer) {
                event.preventDefault();
                complete(offer.written);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDismissed(true);
                return;
              }
            }
            if (event.key === 'Escape' && replyingTo) {
              replyTo(channel.id, null);
              return;
            }
            // Only with the box empty. Up in the middle of a draft is how you
            // get back to the line above, and taking that would be worse than
            // not having the shortcut.
            if (event.key === 'ArrowUp' && text === '') {
              event.preventDefault();
              emit(EDIT_LAST);
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />

        {mayPost ? (
          <span className="composer-pop">
            <button
              type="button"
              className={board === 'emoji' ? 'icon-button on' : 'icon-button'}
              title="Emoji"
              onClick={() => setBoard((open) => (open === 'emoji' ? null : 'emoji'))}
            >
              &#9786;
            </button>
            {board === 'emoji' ? (
              <ReactionPicker
                emojis={emojis}
                place="above-right"
                label="Pick an emoji"
                onClose={() => setBoard(null)}
                onPick={(emoji) => {
                  setBoard(null);
                  insert(emoji);
                }}
              />
            ) : null}
          </span>
        ) : null}
        {mayPost ? (
          <span className="composer-pop">
            <button
              type="button"
              className={board === 'spawn' ? 'icon-button on' : 'icon-button'}
              title="Send a character across the room"
              onClick={() => setBoard((open) => (open === 'spawn' ? null : 'spawn'))}
            >
              <span className="meepo-face" style={{ width: 24, height: 24, backgroundImage: 'url(/meepo/tang.png)', backgroundSize: 'auto 150%', backgroundPosition: '-6px -8px' }} />
            </button>
            {board === 'spawn' ? (
              <Spawner
                onClose={() => setBoard(null)}
                onPick={(command) => {
                  setBoard(null);
                  void send(command);
                }}
              />
            ) : null}
          </span>
        ) : null}

        {/* Only where a file could be attached: a clip is one. */}
        {mayPost && mayAttach ? (
          <RecordButton disabled={cooldown > 0} onClip={sendVoice} onError={setError} />
        ) : null}

        <button
          type="button"
          className="icon-button"
          title="Send"
          disabled={!mayPost || cooldown > 0}
          onClick={() => void send()}
        >
          &#10148;
        </button>
      </div>

      <div className="composer-hint">
        <span>
          {text.startsWith('/') ? (
            'Commands: /tang-jump, /roll 2d6+3, /init, /shrug'
          ) : (
            <>
              {slowmode > 0 && mayPost ? `Slowmode: one message every ${slowmode}s. ` : ''}
              {text.length > LIMITS.message.max - 400
                ? `${LIMITS.message.max - text.length} characters left`
                : ''}
            </>
          )}
        </span>
        <MarkupTools input={input} setValue={setText} disabled={!mayPost} />
      </div>
    </div>
  );
}

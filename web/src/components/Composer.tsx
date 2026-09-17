/**
 * The message box.
 *
 * It disables itself when the server says the member cannot post, but that is
 * a courtesy only: the send endpoint checks SEND_MESSAGES again and slowmode
 * again, and a client that posts anyway simply gets a 403.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS, Permission } from '@gooffline/shared';
import type { Attachment, Channel } from '@gooffline/shared';

import { ApiError, api } from '../lib/api';
import { fromDraft, mentionLabel, mentionQueryAt, nameOf, toPlainLine } from '../lib/mentions';
import { ScrubError, scrubImage } from '../lib/scrub-image';
import { can } from '../lib/usePermissions';
import { useStore } from '../state/store';

export function Composer({ channel, mask }: { channel: Channel; mask: bigint }) {
  const { state, sendTyping, replyTo } = useStore();
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

  const mayPost = can(mask, Permission.SEND_MESSAGES);
  const mayAttach = can(mask, Permission.ATTACH_FILES);
  const mayPingEveryone = can(mask, Permission.MENTION_EVERYONE);

  const members = state.members[channel.serverId] ?? [];
  const replyingTo = state.replyingTo[channel.id] ?? null;

  // The list under the box while an @name is being typed.
  const asking = dismissed ? null : mentionQueryAt(text, caret);
  const query = asking?.query;
  const offers = useMemo(() => {
    if (query === undefined) return [];
    const people = members
      .filter((member) =>
        [nameOf(member), member.user.displayName, member.user.username].some((name) =>
          name.toLowerCase().includes(query),
        ),
      )
      // Names that start with what was typed come before names that contain it.
      .sort((a, b) => Number(nameOf(b).toLowerCase().startsWith(query)) - Number(nameOf(a).toLowerCase().startsWith(query)))
      .slice(0, 7)
      .map((member) => ({ key: member.userId, label: mentionLabel(member, members), name: nameOf(member), note: member.user.username }));
    if (mayPingEveryone && 'everyone'.startsWith(query)) {
      people.push({ key: 'everyone', label: 'everyone', name: 'everyone', note: 'pings every person who can see this channel' });
    }
    return people;
  }, [query, members, mayPingEveryone]);
  const picked = Math.min(chosen, Math.max(0, offers.length - 1));

  function complete(label: string) {
    if (!asking) return;
    const next = `${text.slice(0, asking.start)}@${label} ${text.slice(caret)}`;
    const position = asking.start + label.length + 2;
    setText(next);
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }

  // Picking "reply" on a message should put you straight into typing it.
  useEffect(() => {
    if (replyingTo) input.current?.focus();
  }, [replyingTo]);

  // A fresh draft per channel, and focus lands where the typing goes.
  useEffect(() => {
    setText('');
    setPending([]);
    setError(null);
    setCooldown(0);
    input.current?.focus();
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

  async function send() {
    const body = text.trim();
    if ((!body && pending.length === 0) || cooldown > 0) return;
    const answering = replyingTo;

    setText('');
    setPending([]);
    setError(null);
    replyTo(channel.id, null);
    requestAnimationFrame(grow);

    try {
      await api.messages.send(channel.id, {
        content: body ? fromDraft(body, members) : undefined,
        replyToId: answering?.id,
        attachmentIds: pending.length > 0 ? pending.map((file) => file.id) : undefined,
      });
    } catch (problem) {
      // Put the draft back rather than losing what someone typed.
      setText(body);
      setPending(pending);
      replyTo(channel.id, answering);
      if (problem instanceof ApiError) {
        setError(problem.message);
        if (problem.retryAfterSeconds) setCooldown(problem.retryAfterSeconds);
      } else {
        setError('Message did not send.');
      }
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
        <div className="mention-offers" role="listbox" aria-label="People to mention">
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
                complete(offer.label);
              }}
              onMouseEnter={() => setChosen(index)}
            >
              <span className="mention-offer-name">@{offer.name}</span>
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
                : `Message #${channel.name}`
              : 'You do not have permission to post here.'
          }
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onChange={(event) => {
            setText(event.target.value);
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
                complete(offer.label);
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
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />

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
        {slowmode > 0 && mayPost ? `Slowmode: one message every ${slowmode}s. ` : ''}
        {text.length > LIMITS.message.max - 400
          ? `${LIMITS.message.max - text.length} characters left`
          : ''}
      </div>
    </div>
  );
}

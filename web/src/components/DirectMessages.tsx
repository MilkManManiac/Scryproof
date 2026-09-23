/**
 * Direct messages: the list on the left and the conversation in the middle.
 *
 * The lock in the header is a claim, and non-negotiable 8 says the interface
 * may only make it where it is true. It is true here without conditions: there
 * is no unencrypted DM, so there is no state in which this screen shows the
 * word over plaintext.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DmChannel, PublicUser } from '@scryproof/shared';
import { LIMITS } from '@scryproof/shared';

import { api, ApiError } from '../lib/api';
import type { AssessedDevice, DmFileRef } from '../lib/dm-crypto';
import { isTrusted, openFile, sealFile } from '../lib/dm-crypto';
import { dmDrafts } from '../lib/drafts';
import { ScrubError, scrubImage } from '../lib/scrub-image';
import { dmUnread, otherMember, sortedDms, useDms, type DmReactionView, type DmView } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { DockButton } from './DockButton';
import { openPicture } from './Lightbox';
import { Modal } from './Modal';
import { applyMarkup, markerForKey } from '../lib/markup';
import { MarkupTools } from './MarkupTools';
import { PlayLine, Rich } from './MessageList';
import { commandOffers, commandQueryAt, expandTextCommand, spawnOf } from '../lib/commands';
import { emojiOffers, expandShortcodes } from '../lib/emoji';
import { emojiQueryAt } from '../lib/mentions';
import { Spawner } from './Spawner';
import { useProfileCard } from './ProfileCard';
import { ReactionPicker, rememberReaction } from './ReactionPicker';
import { CreateRecovery, RestoreRecovery } from './RecoveryPhrase';
import { UserPanel } from './UserPanel';
import { RecordButton, VoicePlayer } from './VoiceNote';
import { isVoiceFile, isVoiceLabel, voiceLabel } from '../lib/voice-note';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** Messages from one person within this long draw as one block. */
const GROUP_WINDOW_MS = 7 * 60_000;

export function DmSidebar() {
  const { state: app } = useStore();
  const { state, openDm } = useDms();
  const selfId = app.user?.id ?? null;
  const list = sortedDms(state);
  const [picking, setPicking] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-header-name">Direct messages</span>
        <span className="sidebar-header-tools">
          <button type="button" className="icon-button" title="Start a conversation" onClick={() => setPicking(true)}>
            +
          </button>
        </span>
      </div>
      {picking ? <DmStartPicker onClose={() => setPicking(false)} /> : null}
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
      <RecoveryStatus />
      <UserPanel />
    </aside>
  );
}

/**
 * Everyone who shares a server with you, from what the store already has
 * loaded (a server's roster arrives when you first visit it, not before).
 * Not yourself, not anyone you have blocked, one row per person even if a
 * server is shared with several.
 */
function DmStartPicker({ onClose }: { onClose: () => void }) {
  const { state: app } = useStore();
  const { openWith } = useDms();
  const selfId = app.user?.id ?? null;
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    const byId = new Map<string, PublicUser>();
    for (const roster of Object.values(app.members)) {
      for (const member of roster) {
        if (member.userId === selfId || app.blocks.has(member.userId)) continue;
        byId.set(member.userId, member.user);
      }
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [app.members, app.blocks, selfId]);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? people.filter(
        (person) => person.displayName.toLowerCase().includes(needle) || person.username.toLowerCase().includes(needle),
      )
    : people;

  async function pick(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      await openWith(userId);
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not start that conversation.');
      setBusyId(null);
    }
  }

  return (
    <Modal
      title="Start a conversation"
      onClose={onClose}
      footer={
        <button type="button" className="button secondary inline" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div className="field">
        <input
          type="text"
          placeholder="Find someone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error ? <div className="error">{error}</div> : null}
      {filtered.length === 0 ? (
        <p className="dm-note">
          {people.length === 0 ? "Nobody shares a server with you yet." : 'Nobody matches that.'}
        </p>
      ) : (
        <div className="dm-picker-list">
          {filtered.map((person) => (
            <button
              key={person.id}
              type="button"
              className="dm-picker-row"
              disabled={busyId !== null}
              onClick={() => void pick(person.id)}
            >
              <Avatar user={person} small presence={app.presences[person.id] ?? 'offline'} />
              <span className="dm-picker-name">{person.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Where the phrase stands, and the way in to making or entering one. */
function RecoveryStatus() {
  const { state } = useDms();
  const [dialog, setDialog] = useState<null | 'create' | 'restore'>(null);
  const recovery = state.recovery;
  if (!state.ready || !recovery) return null;

  return (
    <div className="dm-recovery">
      {!recovery.exists ? (
        <>
          <p>A new computer cannot open your old messages unless you have a recovery phrase.</p>
          <button type="button" className="link-button" onClick={() => setDialog('create')}>
            Make a recovery phrase
          </button>
        </>
      ) : (
        <>
          <p>{recovery.held ? 'Recovery phrase entered on this device.' : 'You have a recovery phrase.'}</p>
          {recovery.held ? null : (
            <button type="button" className="link-button" onClick={() => setDialog('restore')}>
              Enter it here
            </button>
          )}
          <button type="button" className="link-button" onClick={() => setDialog('create')}>
            Make a new one
          </button>
        </>
      )}
      {dialog === 'create' ? <CreateRecovery onClose={() => setDialog(null)} /> : null}
      {dialog === 'restore' ? <RestoreRecovery onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

/** Above a conversation with messages this device cannot open: what would open them. */
function LockedNotice({ dmId }: { dmId: string }) {
  const { state } = useDms();
  const [open, setOpen] = useState(false);
  const locked = (state.messages[dmId] ?? []).some((view) => view.problem === 'no-key');
  const needed = locked && Boolean(state.recovery?.exists) && !state.recovery?.held;

  // The dialog outlives the warning, in the same place in the tree, or React
  // would start it again just as it had something to say.
  return (
    <>
      {needed ? (
        <div className="dm-warnings">
          <div className="dm-warning">
            <div>
              <strong>Some messages here are locked.</strong> They were sent before this device existed. Your recovery
              phrase opens them.
            </div>
            <button type="button" className="button inline" onClick={() => setOpen(true)}>
              Enter recovery phrase
            </button>
          </div>
        </div>
      ) : null}
      {open ? <RestoreRecovery onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function DmPane() {
  const card = useProfileCard();
  const { state: app, block, unblock } = useStore();
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
  const blocked = Boolean(other && app.blocks.has(other.id));
  return (
    <>
      <header className="main-header">
        <DockButton />
        <div className="main-title">
          <span className="channel-sigil">@</span>
          {other ? (
            <button type="button" className="who" title={`@${other.username}`} onClick={(event) => card.show(other, event.currentTarget)}>
              {other.displayName}
            </button>
          ) : (
            'Conversation'
          )}
        </div>
        <div className="main-topic dm-lock" title="Locked on your device, opened on theirs. The server stores it and cannot read it.">
          End-to-end encrypted
        </div>
        {other ? (
          <button
            type="button"
            className="link-button dm-block-toggle"
            title={blocked ? 'Let them write to you again' : 'They are not told. Their messages collapse and they cannot write here.'}
            onClick={() => void (blocked ? unblock(other.id) : block(other.id)).catch(() => undefined)}
          >
            {blocked ? 'Unblock' : 'Block'}
          </button>
        ) : null}
      </header>
      <DeviceWarnings dm={dm} selfId={selfId} />
      <LockedNotice dmId={dm.id} />
      <DmMessages dm={dm} selfId={selfId} onReply={(id) => setReplying((current) => ({ ...current, [dm.id]: id }))} />
      {blocked && other ? (
        // The conversation stays where it was and stays readable. What goes is
        // the way to add to it, which the server would refuse anyway.
        <div className="composer">
          <div className="dm-blocked">
            <span>You have blocked this person.</span>
            <button
              type="button"
              className="button secondary inline"
              onClick={() => void unblock(other.id).catch(() => undefined)}
            >
              Unblock
            </button>
          </div>
        </div>
      ) : (
        <DmComposer
          dm={dm}
          name={other?.displayName ?? 'them'}
          replyingTo={replying[dm.id] ?? null}
          onCancelReply={() => setReplying((current) => ({ ...current, [dm.id]: null }))}
        />
      )}
    </>
  );
}

/* --------------------------------- warnings -------------------------------- */

/** Four groups of four: short enough to read down a phone line. */
const spaced = (fingerprint: string): string => (fingerprint.slice(0, 16).match(/.{4}/g) ?? []).join(' ');

function DeviceWarnings({ dm, selfId }: { dm: DmChannel; selfId: string | null }) {
  const { state, acceptDevice } = useDms();
  const known = state.devices[dm.id];
  const waiting = (known ?? []).filter((entry) => !isTrusted(entry.verdict) && entry.verdict !== 'invalid');
  // Somebody whose browser has not made a key yet. Said here, before anything is typed.
  const absent = known
    ? dm.members.filter((member) => member.id !== selfId && !known.some((entry) => entry.device.userId === member.id))
    : [];
  if (waiting.length === 0 && absent.length === 0) return null;

  return (
    <div className="dm-warnings">
      {absent.map((member) => (
        <div className="dm-warning" key={member.id}>
          <div>
            <strong>{member.displayName} cannot get messages here yet.</strong> They have not opened Scryproof since DMs
            were added, so their browser has not made a key to lock anything to. It will work once they have signed in.
          </div>
        </div>
      ))}
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

/* ---------------------------------- files ---------------------------------- */

/**
 * Only these are drawn in place. Anything else, SVG above all, is handed over
 * as a download and never given to the page to interpret.
 */
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
/** Past this a picture waits to be asked for rather than opening itself. */
const AUTO_OPEN_BYTES = 15 * 1024 * 1024;

/** Opened files, kept for the life of the tab so scrolling does not decrypt twice. */
const openedFiles = new Map<string, Promise<string | null>>();

function objectUrlFor(dmId: string, file: DmFileRef): Promise<string | null> {
  const existing = openedFiles.get(file.id);
  if (existing) return existing;
  const made = (async () => {
    const opened = await openFile(dmId, file, await api.dms.downloadFile(dmId, file.id));
    if (!opened) return null;
    // The type is only ever one of ours or a plain download: never what the sender typed.
    const type = PICTURE_TYPES.has(file.type) ? file.type : 'application/octet-stream';
    return URL.createObjectURL(new Blob([opened as BlobPart], { type }));
  })();
  made.catch(() => openedFiles.delete(file.id));
  openedFiles.set(file.id, made);
  return made;
}

const sizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function DmFile({ dmId, file }: { dmId: string; file: DmFileRef }) {
  // A voice message is opened the same way as any other file, then played in place.
  if (isVoiceFile(file.name)) {
    return (
      <VoicePlayer
        id={file.id}
        name={file.name}
        load={async () => {
          const opened = await openFile(dmId, file, await api.dms.downloadFile(dmId, file.id));
          if (!opened) throw new Error('This file could not be opened.');
          return opened;
        }}
      />
    );
  }
  return <DmFileRow dmId={dmId} file={file} />;
}

function DmFileRow({ dmId, file }: { dmId: string; file: DmFileRef }) {
  const picture = PICTURE_TYPES.has(file.type);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');

  useEffect(() => {
    if (!picture || file.size > AUTO_OPEN_BYTES) return;
    let cancelled = false;
    setState('working');
    objectUrlFor(dmId, file)
      .then((made) => {
        if (cancelled) return;
        setUrl(made);
        setState(made ? 'idle' : 'failed');
      })
      .catch(() => !cancelled && setState('failed'));
    return () => {
      cancelled = true;
    };
  }, [dmId, file, picture]);

  async function save() {
    setState('working');
    try {
      const made = await objectUrlFor(dmId, file);
      if (!made) {
        setState('failed');
        return;
      }
      const link = document.createElement('a');
      link.href = made;
      link.download = file.name;
      link.click();
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  if (picture && url) {
    return (
      <button type="button" className="attachment-open" title="Look closer" onClick={() => openPicture({ url, name: file.name })}>
        <img className="attachment-image" src={url} alt={file.name} />
      </button>
    );
  }

  return (
    <button type="button" className="attachment-file dm-file" disabled={state === 'working'} onClick={() => void save()}>
      {file.name}
      <span style={{ color: 'var(--text-dim)' }}>
        {state === 'failed'
          ? 'could not be opened'
          : state === 'working'
            ? 'unlocking'
            : sizeLabel(file.size)}
      </span>
    </button>
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
  const card = useProfileCard();
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
      <>
        {/* A voice message's body only names it for search and previews; the
            player below says the same thing. */}
        {(view.text && !(isVoiceLabel(view.text) && view.files.some((file) => isVoiceFile(file.name)))) ||
        view.editedAt ||
        view.unverified ? (
          <div className="message-text">
            {/* The same parts as a channel message. There is nobody to name here
                and no server emoji, so those come out as the text typed. */}
            {spawnOf(view.text) ? (
              <PlayLine character={spawnOf(view.text)!} />
            ) : (
              <Rich content={view.text} members={[]} emojis={[]} everyone={false} />
            )}
            {view.editedAt ? <span className="message-edited">edited</span> : null}
            {view.unverified ? (
              <span className="dm-unverified" title="It opened, but it came from a device you have not accepted. See the warning above.">
                unaccepted device
              </span>
            ) : null}
          </div>
        ) : null}
        {view.files.map((file) => (
          <DmFile key={file.id} dmId={view.dmId} file={file} />
        ))}
      </>
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
        <div className="message-gutter">
          {author ? (
            <button type="button" className="who" title={`@${author.username}`} onClick={(event) => card.show(author, event.currentTarget)}>
              <Avatar user={author} />
            </button>
          ) : null}
        </div>
      )}
      <div className="message-body">
        {isGrouped ? null : (
          <div className="message-meta">
            {author ? (
              <button
                type="button"
                className="message-author who"
                style={{ color: author.accent }}
                title={`@${author.username}`}
                onClick={(event) => card.show(author, event.currentTarget)}
              >
                {author.displayName}
              </button>
            ) : (
              <span className="message-author">Someone</span>
            )}
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
  // The unsent text lives in the shared draft store, keyed by conversation, so
  // switching to another DM and back puts it right back in the box; `text`
  // here just mirrors that store for this render.
  const [text, setLocalText] = useState(() => dmDrafts.get(dm.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, DmFileRef[]>>({});
  const [locking, setLocking] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [board, setBoard] = useState<'emoji' | 'spawn' | null>(null);
  const [caret, setCaret] = useState(0);
  const [chosen, setChosen] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const files = pending[dm.id] ?? [];

  // The list under the box while a `/command` or a `:emoji` is being typed,
  // the same as in a channel. No @names here: there is one person to talk to.
  // No /roll either: dice are rolled by the server, which cannot read this.
  const askingEmoji = dismissed ? null : emojiQueryAt(text, caret);
  const askingCommand = dismissed || askingEmoji ? null : commandQueryAt(text, caret);
  const offers = useMemo(() => {
    if (askingCommand) return commandOffers(askingCommand.query, 8).filter((offer) => offer.key !== 'roll').slice(0, 7);
    if (askingEmoji) {
      return emojiOffers(askingEmoji.query).map((offer) => ({
        key: `emoji:${offer.name}`,
        written: offer.emoji,
        name: `:${offer.name}:`,
        note: '',
        glyph: offer.emoji,
      }));
    }
    return [];
  }, [askingCommand?.query, askingEmoji?.query]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = Math.min(chosen, Math.max(0, offers.length - 1));

  function setText(value: string) {
    setLocalText(value);
    dmDrafts.set(dm.id, value);
  }

  /** Put the chosen completion in place of what was being typed. */
  function complete(written: string) {
    const span = askingEmoji ?? askingCommand;
    if (!span) return;
    const next = `${text.slice(0, span.start)}${written} ${text.slice(caret)}`;
    const position = span.start + written.length + 1;
    setText(next);
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }

  /**
   * Seal one file here and upload the sealed copy. Every file a DM carries
   * comes through this, voice messages included: the server only ever holds
   * bytes it cannot open.
   */
  async function lock(file: File): Promise<DmFileRef> {
    if (file.size > LIMITS.dmFileBytes) {
      throw new Error(`Files here are limited to ${Math.floor(LIMITS.dmFileBytes / (1024 * 1024))} MB.`);
    }
    // Same as in channels: a photo is re-encoded first so where it was
    // taken never leaves this machine, even locked.
    const clean = await scrubImage(file);
    const { sealed, key, iv } = await sealFile(dm.id, new Uint8Array(await clean.arrayBuffer()));
    const stored = await api.dms.uploadFile(dm.id, sealed);
    return { id: stored.id, name: clean.name, type: clean.type, size: clean.size, key, iv };
  }

  /**
   * A voice message goes on its own: the draft and any files waiting in the
   * box stay where they are.
   */
  async function sendVoice(file: File, seconds: number) {
    if (!state.ready) throw new Error('Keys for this device are still being set up.');
    setError(null);
    const ref = await lock(file);
    try {
      await send(dm.id, voiceLabel(seconds), target && !target.deleted ? target.id : null, [ref]);
    } catch (problem) {
      // Not sent, so the sealed copy has nothing to belong to.
      void api.dms.discardFile(dm.id, ref.id).catch(() => undefined);
      throw problem instanceof Error ? problem : new Error('The voice message did not send.');
    }
    onCancelReply();
  }

  async function attach(list: FileList | File[] | null) {
    const chosen = list ? Array.from(list) : [];
    if (chosen.length === 0 || !state.ready) return;
    if (files.length + chosen.length > LIMITS.attachmentsPerMessage) {
      setError(`Up to ${LIMITS.attachmentsPerMessage} files per message.`);
      return;
    }
    setLocking(true);
    setError(null);
    try {
      for (const file of chosen) {
        const ref = await lock(file);
        setPending((current) => ({ ...current, [dm.id]: [...(current[dm.id] ?? []), ref] }));
      }
    } catch (problem) {
      if (problem instanceof ScrubError || problem instanceof ApiError || problem instanceof Error) setError(problem.message);
      else setError('Upload failed.');
    } finally {
      setLocking(false);
      if (filePicker.current) filePicker.current.value = '';
    }
  }

  function discard(file: DmFileRef) {
    setPending((current) => ({ ...current, [dm.id]: (current[dm.id] ?? []).filter((entry) => entry.id !== file.id) }));
    void api.dms.discardFile(dm.id, file.id).catch(() => undefined);
  }

  // Whatever was left unsent in this conversation comes back, cursor at the
  // end. Pending attachments are uploads in flight, not draft text, and are
  // left out of the store, so they are not restored here.
  useEffect(() => {
    const draft = dmDrafts.get(dm.id);
    setLocalText(draft);
    setError(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(draft.length, draft.length);
    });
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

  async function submit(override?: string) {
    // Same as a channel: `:fire:` becomes the emoji, `/shrug` its text.
    const body = expandTextCommand(expandShortcodes(override ?? text.trim()));
    if ((!body && files.length === 0) || busy || locking) return;
    setBusy(true);
    setError(null);
    try {
      await send(dm.id, body, target && !target.deleted ? target.id : null, files);
      setPending((current) => ({ ...current, [dm.id]: [] }));
      onCancelReply();
      setText('');
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
      {offers.length > 0 ? (
        <div className="mention-offers" role="listbox" aria-label={askingCommand ? 'Commands' : 'Emoji to insert'}>
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
              {'sheet' in offer && offer.sheet ? (
                <span className="meepo-face" style={{ backgroundImage: `url(${offer.sheet})`, backgroundSize: 'auto 100%' }} />
              ) : 'glyph' in offer && offer.glyph ? (
                <span className="reaction-emoji">{offer.glyph}</span>
              ) : (
                <span className="meepo-face" aria-hidden="true" />
              )}
              <span className="mention-offer-name">{offer.name}</span>
              <span className="mention-offer-note">{offer.note}</span>
            </button>
          ))}
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
      {files.length > 0 ? (
        <div className="composer-pending">
          {files.map((file) => (
            <span className="pending-file" key={file.id}>
              {file.name}
              <button type="button" className="icon-button" style={{ width: 18, height: 18 }} title="Remove" onClick={() => discard(file)}>
                &#10005;
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={state.ready ? 'composer-box' : 'composer-box denied'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void attach(event.dataTransfer.files);
        }}
      >
        {/* Who this is going to, on the line you type into. Same idea as the
            channel label in Composer: the name is beside the caret, not a
            screen away in the header. */}
        <span className="composer-label" title={`@${name}`}>
          <span className="composer-label-mark">@</span>
          {name}
        </span>
        <input ref={filePicker} type="file" multiple hidden onChange={(event) => void attach(event.target.files)} />
        <button
          type="button"
          className="icon-button"
          title="Attach a file. It is locked here before it is uploaded."
          disabled={!state.ready || locking}
          onClick={() => filePicker.current?.click()}
        >
          {locking ? <span className="spinner" /> : '+'}
        </button>
        <textarea
          ref={input}
          className="composer-input"
          rows={1}
          value={text}
          disabled={!state.ready}
          maxLength={LIMITS.message.max}
          placeholder={state.ready ? 'Write something' : 'Setting up keys for this device'}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setDismissed(false);
            setChosen(0);
          }}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData.files);
            if (pasted.length === 0) return;
            event.preventDefault();
            void attach(pasted);
          }}
          onKeyDown={(event) => {
            const marker = markerForKey(event);
            if (marker) {
              event.preventDefault();
              applyMarkup(event.currentTarget, marker, (value) => setText(value));
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
        <span className="composer-pop">
          <button
            type="button"
            className={board === 'emoji' ? 'icon-button on' : 'icon-button'}
            title="Emoji"
            disabled={!state.ready}
            onClick={() => setBoard((open) => (open === 'emoji' ? null : 'emoji'))}
          >
            &#9786;
          </button>
          {board === 'emoji' ? (
            <ReactionPicker
              place="above-right"
              label="Pick an emoji"
              onClose={() => setBoard(null)}
              onPick={(emoji) => {
                setBoard(null);
                const element = input.current;
                const at = element?.selectionStart ?? text.length;
                const next = `${text.slice(0, at)}${emoji}${text.slice(at)}`;
                setText(next);
                requestAnimationFrame(() => {
                  element?.focus();
                  element?.setSelectionRange(at + emoji.length, at + emoji.length);
                });
              }}
            />
          ) : null}
        </span>
        <span className="composer-pop">
          <button
            type="button"
            className={board === 'spawn' ? 'icon-button on' : 'icon-button'}
            title="Send a character across the room"
            disabled={!state.ready}
            onClick={() => setBoard((open) => (open === 'spawn' ? null : 'spawn'))}
          >
            <span className="meepo-face" style={{ width: 24, height: 24, backgroundImage: 'url(/meepo/tang.png)', backgroundSize: 'auto 150%', backgroundPosition: '-6px -8px' }} />
          </button>
          {board === 'spawn' ? (
            <Spawner
              onClose={() => setBoard(null)}
              onPick={(command) => {
                setBoard(null);
                void submit(command);
              }}
            />
          ) : null}
        </span>
        <RecordButton disabled={!state.ready} onClip={sendVoice} onError={setError} />
        <button type="button" className="icon-button" title="Send" disabled={!state.ready || busy} onClick={() => void submit()}>
          &#10148;
        </button>
      </div>
      <div className="composer-hint">
        <span>{text.length > LIMITS.message.max - 400 ? `${LIMITS.message.max - text.length} characters left` : ''}</span>
        <MarkupTools input={input} setValue={(value) => setText(value)} disabled={!state.ready} />
      </div>
    </div>
  );
}

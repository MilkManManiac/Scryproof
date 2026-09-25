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
import { isTrusted, openFile, recipientsFor, sealFile, timeLooksMoved } from '../lib/dm-crypto';
import { safetyNumber } from '../lib/safety-number';
import { dmDrafts } from '../lib/drafts';
import { ScrubError, scrubImage } from '../lib/scrub-image';
import { BottomPin } from '../lib/stick-to-bottom';
import { dmUnread, othersIn, sortedDms, titleOf, useDms, type DmReactionView, type DmView } from '../state/dms';
import { nameFor, useLocalNames } from '../lib/local-names';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { DmCallButton, DmCallMark, DmCallStage } from './DmCall';
import { DockButton } from './DockButton';
import { DmPeoplePicker } from './DmPeoplePicker';
import { openPicture } from './Lightbox';
import { applyMarkup, markerForKey } from '../lib/markup';
import { MarkupTools } from './MarkupTools';
import { Modal } from './Modal';
import { PlayLine, Rich, jumpLimitNote } from './MessageList';
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
  useLocalNames();
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
      {picking ? <DmPeoplePicker onClose={() => setPicking(false)} /> : null}
      <div className="sidebar-scroll">
        {state.setupError ? <p className="dm-note">{state.setupError}</p> : null}
        {list.length === 0 && !state.setupError ? (
          <p className="dm-note">
            Nobody yet. Click anyone in a server&rsquo;s member list to write to them.
          </p>
        ) : null}
        {list.map((dm) => {
          const others = othersIn(dm, selfId);
          const other = others[0];
          if (dm.kind === 'pair' && !other) return null;
          const classes = ['channel', 'dm-row'];
          if (state.openId === dm.id) classes.push('active');
          if (dmUnread(dm)) classes.push('unread');
          return (
            <button key={dm.id} type="button" className={classes.join(' ')} onClick={() => openDm(dm.id)}>

              {dm.kind === 'group' ? (
                <span className="dm-group-mark" title={`${dm.members.length} people`}>
                  {dm.members.length}
                </span>
              ) : other ? (
                <Avatar user={other} small presence={app.presences[other.id] ?? 'offline'} />
              ) : null}
              <span className="channel-name">{titleOf(dm, selfId)}</span>
              <DmCallMark dmId={dm.id} />
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
  const { state: app } = useStore();
  const [open, setOpen] = useState(false);
  // In a group, what somebody you blocked sent after the block was never
  // locked for you. No phrase would open it, so it is not offered as a reason.
  const group = state.dms[dmId]?.kind === 'group';
  const locked = (state.messages[dmId] ?? []).some(
    (view) => view.problem === 'no-key' && !(group && app.blocks.has(view.authorId)),
  );
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
  useLocalNames();
  const { state: app, unblock } = useStore();
  const { state } = useDms();
  const dm = state.openId ? state.dms[state.openId] : undefined;
  const selfId = app.user?.id ?? null;
  /** Per conversation: the message the next thing sent will answer. */
  const [replying, setReplying] = useState<Record<string, string | null>>({});
  const [checkingKeys, setCheckingKeys] = useState(false);

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

  // A pair is closed by a block from either end. A group is not: see DmPeople.
  const other = dm.kind === 'pair' ? (othersIn(dm, selfId)[0] ?? null) : null;
  const blocked = Boolean(other && app.blocks.has(other.id));
  return (
    <>
      <header className="main-header">
        <DockButton />
        <div className="main-title">
          <span className="channel-sigil">@</span>
          {other ? (
            <button type="button" className="who" title={`@${other.username}`} onClick={(event) => card.show(other, event.currentTarget)}>
              {nameFor(other.id, other.displayName)}
            </button>
          ) : (
            titleOf(dm, selfId)
          )}
        </div>
        <div className="main-topic dm-lock" title="Locked on your device, opened on theirs. The server stores it and cannot read it.">
          End-to-end encrypted
        </div>
        <DmCallButton dm={dm} />
        <button
          type="button"
          className="link-button"
          title="Your number and theirs, to read out loud. Comparing them is what proves nobody is in the middle."
          onClick={() => setCheckingKeys(true)}
        >
          Check keys
        </button>
        <DmPeople dm={dm} selfId={selfId} />
      </header>
      <DmCallStage dm={dm} />
      <DeviceWarnings dm={dm} selfId={selfId} onCheckKeys={() => setCheckingKeys(true)} />
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
          name={other ? nameFor(other.id, other.displayName) : titleOf(dm, selfId)}
          replyingTo={replying[dm.id] ?? null}
          onCancelReply={() => setReplying((current) => ({ ...current, [dm.id]: null }))}
        />
      )}
      {checkingKeys ? <DmKeys dm={dm} selfId={selfId} onClose={() => setCheckingKeys(false)} /> : null}
    </>
  );
}

/* ---------------------------------- people --------------------------------- */

/**
 * The right-hand end of the header, for the people in the conversation.
 *
 * In a pair that is one Block button, because blocking the one other person
 * closes the conversation. In a group a block is between you and one person
 * and the conversation carries on, so it lives on that person's row in a
 * short list, beside the ways to add someone and to leave.
 */
function DmPeople({ dm, selfId }: { dm: DmChannel; selfId: string | null }) {
  const { state: app, block, unblock } = useStore();
  const { state, leave } = useDms();
  const card = useProfileCard();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else, or Escape, like the profile card. Not
  // while the add dialog is up: that is a click elsewhere on purpose.
  useEffect(() => {
    if (!open || adding) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, adding]);

  // Switching conversation closes it.
  useEffect(() => {
    setOpen(false);
    setLeaving(false);
    setError(null);
  }, [dm.id]);

  if (dm.kind === 'pair') {
    const other = othersIn(dm, selfId)[0];
    if (!other) return null;
    const blocked = app.blocks.has(other.id);
    return (
      <button
        type="button"
        className="link-button dm-block-toggle"
        title={blocked ? 'Let them write to you again' : 'They are not told. Their messages collapse and they cannot write here.'}
        onClick={() => void (blocked ? unblock(other.id) : block(other.id)).catch(() => undefined)}
      >
        {blocked ? 'Unblock' : 'Block'}
      </button>
    );
  }

  const known = state.devices[dm.id];
  const people = [...dm.members].sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : a.displayName.localeCompare(b.displayName)));

  async function goodbye() {
    setError(null);
    try {
      await leave(dm.id);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not leave.');
    }
  }

  return (
    <span className="dm-people-anchor" ref={box}>
      <button
        type="button"
        className="link-button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {dm.members.length} people
      </button>
      {open ? (
        <div className="dm-people" role="dialog" aria-label="People in this conversation">
          {people.map((member) => {
            const mine = member.id === selfId;
            const blocked = app.blocks.has(member.id);
            // Somebody whose browser has not made a key yet gets nothing sent here.
            const keyless = known !== undefined && !known.some((entry) => entry.device.userId === member.id);
            return (
              <div className="dm-people-row" key={member.id}>
                <Avatar user={member} small presence={app.presences[member.id] ?? 'offline'} />
                <button type="button" className="who dm-people-name" onClick={(event) => card.show(member, event.currentTarget)}>
                  {mine ? 'You' : nameFor(member.id, member.displayName)}
                </button>
                {keyless && !mine ? (
                  <span className="dm-people-note" title="They have not opened Scryproof since DMs were added. Nothing sent here reaches them until they do.">
                    no key yet
                  </span>
                ) : null}
                {mine ? null : (
                  <button
                    type="button"
                    className="link-button"
                    title={
                      blocked
                        ? 'Let them write to you again'
                        : 'They are not told. What they send here after this is not delivered to you, and what they sent before collapses. Everyone else still talks to them.'
                    }
                    onClick={() => void (blocked ? unblock(member.id) : block(member.id)).catch(() => undefined)}
                  >
                    {blocked ? 'Unblock' : 'Block'}
                  </button>
                )}
              </div>
            );
          })}
          {error ? <div className="error">{error}</div> : null}
          <div className="dm-people-actions">
            <button type="button" className="button secondary inline" onClick={() => setAdding(true)}>
              Add someone
            </button>
            {leaving ? (
              <>
                <span className="dm-people-note">Leave for good? Someone would have to add you back.</span>
                <button type="button" className="button inline danger" onClick={() => void goodbye()}>
                  Leave
                </button>
                <button type="button" className="button secondary inline" onClick={() => setLeaving(false)}>
                  Stay
                </button>
              </>
            ) : (
              <button type="button" className="button secondary inline" onClick={() => setLeaving(true)}>
                Leave group
              </button>
            )}
          </div>
        </div>
      ) : null}
      {adding ? <DmPeoplePicker addTo={dm.id} onClose={() => setAdding(false)} /> : null}
    </span>
  );
}

/* --------------------------------- warnings -------------------------------- */

/** Four groups of four: short enough to read down a phone line. */
const spaced = (fingerprint: string): string => (fingerprint.slice(0, 16).match(/.{4}/g) ?? []).join(' ');

function DeviceWarnings({
  dm,
  selfId,
  onCheckKeys,
}: {
  dm: DmChannel;
  selfId: string | null;
  onCheckKeys: () => void;
}) {
  const { state, acceptDevice } = useDms();
  const known = state.devices[dm.id];
  const waiting = (known ?? []).filter((entry) => !isTrusted(entry.verdict) && entry.verdict !== 'invalid');
  // Somebody whose browser has not made a key yet. Said here, before anything is typed.
  const absent = known
    ? dm.members.filter((member) => member.id !== selfId && !known.some((entry) => entry.device.userId === member.id))
    : [];
  // The server also holds the device list, and a device of somebody who is not
  // in this conversation is what handing our key to a stranger looks like. It
  // is left out of the lock (`recipientsFor`), and said here so it is visible.
  const outsiders = known
    ? recipientsFor(known, new Set(dm.members.map((member) => member.id))).outsiders
    : [];
  if (waiting.length === 0 && absent.length === 0 && outsiders.length === 0) return null;

  return (
    <div className="dm-warnings">
      {outsiders.map((entry) => (
        <div className="dm-warning" key={`${entry.device.userId}:${entry.device.deviceId}`}>
          <div>
            <strong>The server lists a device for somebody who is not in this conversation.</strong> Nothing written
            here is locked to it: what you send goes to the people in this conversation and nobody else. A device list
            and a member list that disagree is worth knowing about.
          </div>
        </div>
      ))}
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
            onCheckKeys={onCheckKeys}
          />
        );
      })}
    </div>
  );
}

export function DeviceWarning({
  entry,
  person,
  mine,
  onAccept,
  onCheckKeys,
}: {
  entry: AssessedDevice;
  person: PublicUser | null;
  mine: boolean;
  onAccept: () => void;
  /**
   * Where the numbers two people compare out loud live, where the screen has
   * somewhere to send them. Absent elsewhere (the channel lock panel), and the
   * wording drops the offer rather than pointing at nothing.
   */
  onCheckKeys?: () => void;
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
        {mine ? ' If this was not you, change your password.' : ' If you can, ask them.'}{' '}
        {onCheckKeys
          ? mine
            ? 'Check keys shows the numbers to compare out loud, this device among them.'
            : 'Their number for this device, to compare out loud, is under Check keys.'
          : 'The long hex line is the key this device presented.'}
        <span className="dm-fingerprint" title="The key this device presented, in short. Read numbers out loud from Check keys, not this.">
          {spaced(entry.fingerprint)}
        </span>
      </div>
      <button type="button" className="button secondary inline" onClick={onAccept}>
        Accept
      </button>
    </div>
  );
}

/**
 * One device's safety number, worked out when it is first asked for and kept.
 *
 * Twenty digits stand for one identity key, so the number changes only when the
 * key does. Deriving one is deliberately slow (about half a second, see
 * `safety-number.ts`), so nothing is derived until a screen shows it, and then
 * only once per key for as long as the tab lives.
 */
const safetyNumbers = new Map<string, Promise<string>>();

function safetyNumberOf(userId: string, fingerprint: string): Promise<string> {
  const key = `${userId}:${fingerprint}`;
  const already = safetyNumbers.get(key);
  if (already) return already;
  const made = safetyNumber(userId, fingerprint);
  made.catch(() => safetyNumbers.delete(key));
  safetyNumbers.set(key, made);
  return made;
}

function SafetyNumber({ userId, fingerprint }: { userId: string; fingerprint: string }) {
  const [digits, setDigits] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void safetyNumberOf(userId, fingerprint).then(
      (value) => {
        if (live) setDigits(value);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [userId, fingerprint]);

  return (
    <span className="dm-fingerprint" title="Twenty digits standing for this device's key. Compare them over a call or in person, never through this server.">
      {digits ?? 'working it out…'}
    </span>
  );
}

/**
 * "Check keys": the numbers two people read to each other.
 *
 * This is the check the DM warning asks for. Saying your number and hearing
 * theirs, over something the server does not carry, is what proves the keys
 * either side holds are the ones the other is using: a server that swapped one
 * cannot show the same number on both screens. Nothing here is sent anywhere.
 */
function DmKeys({ dm, selfId, onClose }: { dm: DmChannel; selfId: string | null; onClose: () => void }) {
  const { state } = useDms();
  const known = state.devices[dm.id] ?? [];
  const me = state.me;
  const others = dm.members.filter((member) => member.id !== selfId);
  const label = (entry: AssessedDevice): string => (isTrusted(entry.verdict) ? 'trusted here' : 'not accepted yet');

  return (
    <Modal
      title="Check keys"
      onClose={onClose}
      footer={
        <button type="button" className="button secondary inline" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="recovery-text">
        <p>
          Each device has its own number. Yours is on your screen here, and theirs next to their devices. Read one out
          over a call or in person: if the numbers match, the server is not standing in the middle of this
          conversation. If they do not, stop and find out why. The app cannot do this check for you, and neither can
          the server: that is what makes it worth doing.
        </p>
        <p>
          <strong>Your number</strong>, for this device:
        </p>
        {me ? (
          <div className="dm-people-row">
            <span className="dm-people-name">
              <SafetyNumber userId={me.userId} fingerprint={me.fingerprint} />
            </span>
          </div>
        ) : (
          <p className="field-note">This device has no keys yet.</p>
        )}
        {others.map((member) => {
          // A device that failed its signature check is left out: it is not a
          // device whose key anyone could read a number from.
          const devices = known.filter(
            (entry) => entry.device.userId === member.id && entry.verdict !== 'invalid',
          );
          return (
            <div key={member.id}>
              <p>
                <strong>{nameFor(member.id, member.displayName)}</strong>
                {devices.length === 0 ? ' has no devices listed here.' : ''}
              </p>
              {devices.map((entry) => (
                <div className="dm-people-row" key={entry.device.deviceId}>
                  <span className="dm-people-name">
                    <SafetyNumber userId={entry.device.userId} fingerprint={entry.fingerprint} />
                  </span>
                  <span className="dm-people-note">{label(entry)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Modal>
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
  const { state: app } = useStore();
  // A message whose sealed bytes are the ones an earlier message already used
  // is a repeat the server put here: it is not drawn. Says which in the state,
  // where every sealed row for this conversation is known.
  const hidden = useMemo(() => new Set(state.replayed[dm.id] ?? []), [state.replayed, dm.id]);
  const views = useMemo(
    () => (state.messages[dm.id] ?? []).filter((view) => !hidden.has(view.id)),
    [state.messages, dm.id, hidden],
  );
  // In a group, somebody you blocked collapses as they would in a channel, and
  // their reactions do not count. In a pair the block has already closed the
  // conversation, and what was said before it stays as it was.
  const silenced = (userId: string): boolean => dm.kind === 'group' && userId !== selfId && app.blocks.has(userId);
  const reactions = (state.reactions[dm.id] ?? []).filter((reaction) => !silenced(reaction.authorId));
  const loaded = state.loaded[dm.id] ?? false;
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pin = useRef(new BottomPin(40));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  // Before paint, and before the effect below: re-pinning in a plain effect
  // ran after the scroll, so leaving one conversation scrolled up opened the
  // next one where the last had been.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) pin.current.open(element);
    else pin.current.pinned = true;
  }, [dm.id]);

  useEffect(() => {
    setExhausted(false);
  }, [dm.id]);

  const newestId = views.at(-1)?.id;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) pin.current.settle(element);
  }, [newestId, loaded, dm.id]);

  // Pictures here are unlocked after the list is drawn and have no height
  // until then, so the bottom moves with no new message. Follow every change
  // in size while pinned; see lib/stick-to-bottom.ts.
  useEffect(() => {
    const element = scroller.current;
    const inner = content.current;
    if (!element || !inner) return;
    const observer = new ResizeObserver(() => pin.current.settle(element));
    observer.observe(element);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [loaded]);

  // Reading is looking at the bottom of an open conversation in a focused window.
  useEffect(() => {
    if (loaded && pin.current.pinned && document.hasFocus()) markRead(dm.id);
  }, [loaded, newestId, dm.id, dm.lastMessageId, markRead]);
  useEffect(() => {
    const onFocus = () => {
      if (pin.current.pinned) markRead(dm.id);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dm.id, markRead]);

  async function onScroll() {
    const element = scroller.current;
    if (!element) return;
    if (pin.current.scrolled(element)) markRead(dm.id);

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
      <div ref={content}>
        {loadingOlder ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 12 }}>
            <div className="spinner" />
          </div>
        ) : null}
        {views.length === 0 ? (
          <div className="channel-intro">
            <h2>Nothing here yet</h2>
            <p>
              Whatever you write is locked before it leaves this device.
              {dm.kind === 'group'
                ? ' Anyone added later reads from when they joined: what came before was not locked for them.'
                : ''}
            </p>
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
                collapsed={silenced(view.authorId)}
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
  collapsed,
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
  /** From somebody this person blocked, in a group. */
  collapsed: boolean;
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
  /** One blocked message shown on purpose. It hides again on reload. */
  const [shown, setShown] = useState(false);
  const readable = !view.deleted && view.problem === null && view.text !== null;
  // The sender's own time for this message disagrees with the time the server
  // gave it. The server can move its own stamp; it cannot move the one inside
  // the seal, so both are shown rather than trusting either.
  const writtenMoved = timeLooksMoved(view.sealedAt, view.createdAt);
  const nameOf = (userId: string): string =>
    userId === selfId ? 'You' : nameFor(userId, members.find((member) => member.id === userId)?.displayName ?? 'Someone');

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

  if (collapsed && !(shown && view.problem !== 'no-key')) {
    return (
      <div id={`dm-message-${view.id}`} className="message blocked">
        {view.problem === 'no-key' ? (
          // Sent after the block. The server kept no copy of the key for this
          // person, so there is nothing to show even on request.
          <span className="blocked-message" title="Sent after you blocked them. It was not delivered to you.">
            Blocked message.
          </span>
        ) : (
          <button type="button" className="blocked-message" onClick={() => setShown(true)}>
            Blocked message. Show.
          </button>
        )}
      </div>
    );
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
        view.unverified ||
        view.unproven ||
        writtenMoved ? (
          <div className="message-text">
            {/* The same parts as a channel message. There is nobody to name here
                and no server emoji, so those come out as the text typed. */}
            {spawnOf(view.text) ? (
              <PlayLine character={spawnOf(view.text)!} again={() => api.dms.replay(view.dmId, view.id)} />
            ) : (
              <Rich content={view.text} members={[]} emojis={[]} everyone={false} />
            )}
            {view.editedAt ? <span className="message-edited">edited</span> : null}
            {writtenMoved && view.sealedAt !== null ? (
              <span
                className="message-edited"
                title="The sender's own clock said this when the words were sealed, which is not when the server says it arrived. The time inside the seal is the one the server cannot change."
              >
                written {timeFormat.format(view.sealedAt)}
              </span>
            ) : null}
            {view.unverified ? (
              <span className="dm-unverified" title="It opened, but it came from a device you have not accepted. See the warning above.">
                unaccepted device
              </span>
            ) : null}
            {view.unproven ? (
              <span
                className="dm-unverified"
                title="This message's format does not prove which member sent it. It opened, but anyone else in this group could have written it in their name."
              >
                sender not proven
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
                {nameFor(author.id, author.displayName)}
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
  const targetMember = dm.members.find((member) => member.id === target?.authorId);
  const targetName =
    target?.authorId === app.user?.id
      ? 'yourself'
      : nameFor(target?.authorId ?? '', targetMember?.displayName ?? 'them');
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
      if (problem instanceof ApiError && problem.status === 429 && spawnOf(body)) {
        setError(jumpLimitNote(problem.retryAfterSeconds));
      } else setError(problem instanceof Error ? problem.message : 'Could not send that.');
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

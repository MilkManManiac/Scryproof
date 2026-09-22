/*
 * The card behind every name.
 *
 * Click a person anywhere, the member list, a message, a voice row, and this
 * opens beside what was clicked: who they are, what they are up to, their
 * roles here, whether they are in a call, and the things you can do about
 * them. Clicking used to open a conversation straight away, which is too
 * much for a click: a card can be closed, a conversation is now in your list.
 *
 * One provider, mounted once, so there is one card on screen at a time and
 * nobody else has to know how to draw it. Everything shown is already in the
 * store; the card asks the server for nothing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PublicUser } from '@scryproof/shared';

import { placeBeside } from '../lib/place';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { ProfileSettings } from './ProfileSettings';
import { CameraGlyph, ScreenGlyph, VoiceGlyph } from './glyphs';

interface Opened {
  user: PublicUser;
  /** The server whose nickname and roles to show, when the click was inside one. */
  serverId: string | null;
  anchor: DOMRect;
}

interface ProfileCardValue {
  /** Open the card for this person, beside the element that was clicked. */
  show: (user: PublicUser, anchor: Element, serverId?: string | null) => void;
  close: () => void;
}

const Context = createContext<ProfileCardValue | null>(null);

export function useProfileCard(): ProfileCardValue {
  const value = useContext(Context);
  if (!value) throw new Error('useProfileCard outside ProfileCardProvider');
  return value;
}

export function ProfileCardProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [editing, setEditing] = useState(false);

  const show = useCallback((user: PublicUser, anchor: Element, serverId: string | null = null) => {
    setOpened({ user, serverId, anchor: anchor.getBoundingClientRect() });
  }, []);
  const close = useCallback(() => setOpened(null), []);
  const value = useMemo(() => ({ show, close }), [show, close]);

  return (
    <Context.Provider value={value}>
      {children}
      {opened ? (
        <ProfileCard
          opened={opened}
          onClose={close}
          onEdit={() => {
            close();
            setEditing(true);
          }}
        />
      ) : null}
      {editing ? <ProfileSettings onClose={() => setEditing(false)} /> : null}
    </Context.Provider>
  );
}

const SINCE = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

function ProfileCard({ opened, onClose, onEdit }: { opened: Opened; onClose: () => void; onEdit: () => void }) {
  const { state, block, unblock } = useStore();
  const { openWith, send } = useDms();
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { user, serverId } = opened;
  const self = state.user?.id === user.id;
  const presence = state.connection === 'open' ? (state.presences[user.id] ?? 'offline') : 'offline';
  const server = serverId ? (state.servers[serverId] ?? null) : null;
  const member = serverId ? (state.members[serverId] ?? []).find((entry) => entry.userId === user.id) : undefined;
  const roles = useMemo(() => {
    if (!server || !member) return [];
    return server.roles
      .filter((role) => !role.isEveryone && member.roleIds.includes(role.id))
      .sort((a, b) => b.position - a.position);
  }, [server, member]);
  const call = Object.values(state.voiceStates).find((voice) => voice.userId === user.id && voice.channelId);
  const callServer = call ? state.servers[call.serverId] : null;
  const callChannel = callServer?.channels.find((channel) => channel.id === call?.channelId);
  const blocked = state.blocks.has(user.id);
  const name = member?.nickname ?? user.displayName;

  // Measured once drawn, then placed. Until then it sits off screen.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    setSpot(
      placeBeside(
        opened.anchor,
        { width: element.offsetWidth, height: element.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [opened]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Next tick, or the click that opened the card closes it.
    const timer = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  async function sendDraft() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setProblem(null);
    try {
      const dmId = await openWith(user.id);
      await send(dmId, text);
      setDraft('');
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not send that.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="profile-card"
      ref={box}
      role="dialog"
      aria-label={`${name}'s profile`}
      style={spot ? { top: spot.top, left: spot.left } : { top: -9999, left: -9999 }}
    >
      <div
        className="profile-card-banner"
        style={{ background: `linear-gradient(180deg, ${user.accent}cc, ${user.accent}55)` }}
      />
      <div className="profile-card-avatar">
        <Avatar user={user} large presence={presence} />
      </div>
      <div className="profile-card-body">
        <div>
          <div className="profile-card-name">{name}</div>
          <div className="profile-card-handle">
            @{user.username}
            {member?.nickname ? <span title="Their name outside this server"> &middot; {user.displayName}</span> : null}
          </div>
        </div>

        {user.statusText ? <div className="profile-card-status">{user.statusText}</div> : null}

        {roles.length > 0 ? (
          <div className="profile-card-roles">
            {roles.map((role) => (
              <span
                key={role.id}
                className="role-chip"
                style={role.color ? { borderColor: role.color, color: role.color } : undefined}
              >
                {role.name}
              </span>
            ))}
          </div>
        ) : null}

        {call && callChannel ? (
          <div className="profile-card-line">
            <span className="voice-flag in-voice">
              <VoiceGlyph />
            </span>
            In {callChannel.name}
            {callServer && callServer.id !== serverId ? ` on ${callServer.name}` : ''}
            {call.sharingScreen ? (
              <span className="voice-flag sharing" title="Sharing their screen">
                <ScreenGlyph />
              </span>
            ) : null}
            {call.cameraOn ? (
              <span className="voice-flag camera" title="Camera on">
                <CameraGlyph />
              </span>
            ) : null}
          </div>
        ) : null}

        {member ? (
          <div className="profile-card-line">Here since {SINCE.format(new Date(member.joinedAt))}</div>
        ) : null}

        {blocked ? <div className="profile-card-line">You have blocked them. They are not told.</div> : null}

        <div className="profile-card-actions">
          {self ? (
            <button type="button" className="button secondary inline" onClick={onEdit}>
              Edit profile
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button secondary inline"
                onClick={() => {
                  onClose();
                  void openWith(user.id).catch(() => undefined);
                }}
              >
                Message
              </button>
              <button
                type="button"
                className="button secondary inline"
                title={blocked ? 'Let them write to you again' : 'Hides them from you. They are never told.'}
                onClick={() => void (blocked ? unblock(user.id) : block(user.id)).catch(() => undefined)}
              >
                {blocked ? 'Unblock' : 'Block'}
              </button>
            </>
          )}
        </div>

        {self || blocked ? null : (
          <form
            className="profile-card-say"
            onSubmit={(event) => {
              event.preventDefault();
              void sendDraft();
            }}
          >
            <input
              type="text"
              className="profile-card-input"
              placeholder={`Message @${name}`}
              value={draft}
              maxLength={2000}
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
            />
            {problem ? <div className="error">{problem}</div> : null}
          </form>
        )}
      </div>
    </div>
  );
}

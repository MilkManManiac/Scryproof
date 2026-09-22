/**
 * Who you are, and the controls you reach for most: presence, mute, deafen.
 * Signing out lives in the menu behind your name, because it is rare and the
 * bar is narrow.
 *
 * Mute and deafen here are the client's own state, sent to the server so other
 * members see it. Nothing in this panel grants anything; it only reports.
 */

import { useState, useSyncExternalStore } from 'react';
import type { PresenceStatus } from '@scryproof/shared';

import { buildLabel, isDesktop } from '../lib/desktop';
import { canInstall, install, subscribeInstall } from '../lib/install';
import { hasUnread, subscribeUnread } from '../lib/whats-new';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { NotifySettings } from './NotifySettings';
import { useProfileCard } from './ProfileCard';
import { ProfileSettings } from './ProfileSettings';
import { ThemePicker } from './ThemePicker';
import { VoiceSettings } from './VoiceSettings';
import { WhatsNew } from './WhatsNew';
import { BlockedPeople } from './settings/BlockedPeople';

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Invisible',
};

export function UserPanel() {
  const { state, setPresence, signOut, updateVoice, leaveVoice } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const card = useProfileCard();
  const installable = useSyncExternalStore(subscribeInstall, canInstall) && !isDesktop;
  const news = useSyncExternalStore(subscribeUnread, hasUnread);

  const user = state.user;
  if (!user) return null;

  const myVoice = Object.values(state.voiceStates).find((voice) => voice.userId === user.id);
  const status = state.presences[user.id] ?? 'online';

  const connectionLabel =
    state.connection === 'open'
      ? STATUS_LABEL[status]
      : state.connection === 'reconnecting'
        ? 'Reconnecting'
        : state.connection === 'connecting'
          ? 'Connecting'
          : 'Disconnected';

  return (
    <div className="user-panel" style={{ position: 'relative' }}>
      <button
        type="button"
        className="who"
        title="Your profile"
        onClick={(event) => card.show(user, event.currentTarget, state.selectedServerId)}
      >
        <Avatar user={user} small presence={state.connection === 'open' ? status : 'offline'} />
      </button>

      <button
        type="button"
        className="user-panel-identity"
        style={{ textAlign: 'left' }}
        onClick={() => setMenuOpen((open) => !open)}
        title={news ? 'Something new since you were last here. Status, themes and sign out.' : 'Status and sign out'}
      >
        <div className="user-panel-name">
          {user.displayName}
          {news ? <i className="news-dot" aria-label="Something new" /> : null}
        </div>
        <div className="user-panel-status">{state.connection === 'open' && user.statusText ? user.statusText : connectionLabel}</div>
      </button>

      <span className="user-panel-tools">
      {myVoice ? (
        <>
          <button
            type="button"
            className={myVoice.selfMute ? 'icon-button danger on' : 'icon-button'}
            title={myVoice.selfMute ? 'Unmute' : 'Mute'}
            onClick={() => updateVoice({ selfMute: !myVoice.selfMute })}
          >
            {myVoice.selfMute ? '\u{1F507}' : '\u{1F3A4}'}
          </button>
          <button
            type="button"
            className={myVoice.selfDeaf ? 'icon-button danger on' : 'icon-button'}
            title={myVoice.selfDeaf ? 'Undeafen' : 'Deafen'}
            onClick={() => updateVoice({ selfDeaf: !myVoice.selfDeaf })}
          >
            {'\u{1F3A7}'}
          </button>
          <button
            type="button"
            className="icon-button danger"
            title="Leave voice"
            onClick={() => leaveVoice()}
          >
            &#10005;
          </button>
        </>
      ) : null}

      <button
        type="button"
        className="icon-button"
        title="Notifications"
        onClick={() => setNotifyOpen(true)}
      >
        &#9836;
      </button>

      <button
        type="button"
        className="icon-button"
        title="Voice and audio settings"
        onClick={() => setAudioOpen(true)}
      >
        &#9881;
      </button>
      </span>

      {audioOpen ? <VoiceSettings onClose={() => setAudioOpen(false)} /> : null}
      {notifyOpen ? <NotifySettings onClose={() => setNotifyOpen(false)} /> : null}
      {profileOpen ? <ProfileSettings onClose={() => setProfileOpen(false)} /> : null}
      {blockedOpen ? <BlockedPeople onClose={() => setBlockedOpen(false)} /> : null}
      {themesOpen ? <ThemePicker onClose={() => setThemesOpen(false)} /> : null}
      {newsOpen ? <WhatsNew onClose={() => setNewsOpen(false)} /> : null}

      {menuOpen ? (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 8,
            right: 8,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius)',
            padding: 4,
            zIndex: 30,
            boxShadow: '0 12px 32px #00000066',
          }}
        >
          {(Object.keys(STATUS_LABEL) as PresenceStatus[]).map((option) => (
            <button
              key={option}
              type="button"
              className="channel"
              onClick={() => {
                setPresence(option);
                setMenuOpen(false);
              }}
            >
              <i className={`presence-dot ${option}`} style={{ position: 'static', border: 'none' }} />
              <span className="channel-name">{STATUS_LABEL[option]}</span>
            </button>
          ))}
          <button
            type="button"
            className="channel"
            onClick={() => {
              setProfileOpen(true);
              setMenuOpen(false);
            }}
          >
            <span className="channel-name">Edit profile</span>
          </button>
          <button
            type="button"
            className="channel"
            onClick={() => {
              setBlockedOpen(true);
              setMenuOpen(false);
            }}
          >
            <span className="channel-name">Blocked people</span>
          </button>
          <button
            type="button"
            className="channel"
            title="Choose a theme"
            onClick={() => {
              setThemesOpen(true);
              setMenuOpen(false);
            }}
          >
            <span className="channel-name">Themes</span>
          </button>
          <button
            type="button"
            className="channel"
            title="What changed in the last few releases"
            onClick={() => {
              setNewsOpen(true);
              setMenuOpen(false);
            }}
          >
            <span className="channel-name">
              What&apos;s new
              {news ? <i className="news-dot" aria-hidden="true" /> : null}
            </span>
          </button>
          {installable ? (
            <button
              type="button"
              className="channel"
              title="Puts Scryproof on your home screen or desktop, in its own window"
              onClick={() => {
                setMenuOpen(false);
                void install();
              }}
            >
              <span className="channel-name">Install on this device</span>
            </button>
          ) : null}
          <button type="button" className="channel" onClick={() => void signOut()}>
            <span className="channel-name">Sign out</span>
          </button>
          <div className="build-label" title="Which build of Scryproof this is">
            {buildLabel()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

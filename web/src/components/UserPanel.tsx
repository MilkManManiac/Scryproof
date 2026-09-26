/**
 * Who you are, and the controls you reach for most, laid out the way Discord
 * does it so nobody has to learn it: your face and name, then microphone,
 * headphones and settings. While you are in a call, the card above
 * (`VoiceDock.tsx`) holds the call's own buttons: leave, camera, screen,
 * soundboard.
 *
 * Wes, 2026-09-26: the old bar's marks were "hard to see and aren't
 * intuitive" (a music note meant notifications, the gear meant only voice
 * settings, and mute and deafen vanished outside a call). Now every mark is
 * drawn, the gear holds every setting, and mute and deafen are always there:
 * outside a call they set how the next one starts.
 *
 * Mute and deafen are the client's own state, sent to the server so other
 * members see it. Nothing in this panel grants anything; it only reports.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PresenceStatus } from '@scryproof/shared';

import { buildLabel, isDesktop } from '../lib/desktop';
import { canInstall, install, subscribeInstall } from '../lib/install';
import { voicePrefs } from '../lib/voice-prefs';
import { openWalkthrough } from '../lib/walkthrough';
import { hasUnread, subscribeUnread } from '../lib/whats-new';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { GearGlyph, HeadphonesGlyph, MicGlyph } from './glyphs';
import { MuteBanner, MutedTalkNote } from './MuteStatus';
import { NotifySettings } from './NotifySettings';
import { useProfileCard } from './ProfileCard';
import { ProfileSettings } from './ProfileSettings';
import { ThemePicker } from './ThemePicker';
import { VoiceDock } from './VoiceDock';
import { VoiceSettings } from './VoiceSettings';
import { NewsCard, WhatsNew } from './WhatsNew';
import { AccountSettings } from './settings/AccountSettings';
import { BlockedPeople } from './settings/BlockedPeople';

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Invisible',
};

type Dialog = 'audio' | 'notify' | 'profile' | 'account' | 'blocked' | 'themes' | 'news';

/** A menu that rises out of the bar, and shuts on a click anywhere else or Escape. */
function PanelMenu({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) close.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    const timer = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div className="panel-menu" ref={box} role="menu" aria-label={label}>
      {children}
    </div>
  );
}

function MenuItem({ children, title, onClick }: { children: ReactNode; title?: string; onClick: () => void }) {
  return (
    <button type="button" className="panel-menu-item" role="menuitem" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function UserPanel() {
  const { state, setPresence, signOut, updateVoice } = useStore();
  const [menu, setMenu] = useState<'you' | 'settings' | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const card = useProfileCard();
  const installable = useSyncExternalStore(subscribeInstall, canInstall) && !isDesktop;
  const news = useSyncExternalStore(subscribeUnread, hasUnread);
  const standingMute = useSyncExternalStore(voicePrefs.subscribe, () => voicePrefs.get().selfMute);
  const standingDeaf = useSyncExternalStore(voicePrefs.subscribe, () => voicePrefs.get().selfDeaf);

  const user = state.user;
  if (!user) return null;

  const myVoice = Object.values(state.voiceStates).find((voice) => voice.userId === user.id);
  const status = state.presences[user.id] ?? 'online';

  // In a call, the buttons show the call; out of one, how the next call starts.
  const selfMute = myVoice ? myVoice.selfMute : standingMute;
  const selfDeaf = myVoice ? myVoice.selfDeaf : standingDeaf;
  const micOff = selfMute || Boolean(myVoice?.serverMute);
  const earsOff = selfDeaf || Boolean(myVoice?.serverDeaf);
  const later = myVoice ? '' : ' (for your next call)';

  const connectionLabel =
    state.connection === 'open'
      ? STATUS_LABEL[status]
      : state.connection === 'reconnecting'
        ? 'Reconnecting'
        : state.connection === 'connecting'
          ? 'Connecting'
          : 'Disconnected';

  const open = (next: Dialog) => {
    setDialog(next);
    setMenu(null);
  };
  const shut = () => setDialog(null);

  return (
    <>
      {news && dialog !== 'news' ? <NewsCard onOpen={() => setDialog('news')} /> : null}
      {myVoice ? <MutedTalkNote onUnmute={() => updateVoice({ selfMute: false })} /> : null}
      {myVoice ? <VoiceDock mine={myVoice} /> : null}
      <div className="user-panel" style={{ position: 'relative' }}>
        <MuteBanner state={myVoice} onChange={updateVoice} where="panel" />
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
          onMouseDown={(event) => {
            if (menu === 'you') event.stopPropagation();
          }}
          onClick={() => setMenu((current) => (current === 'you' ? null : 'you'))}
          title={news ? 'Something new since you were last here. Status, profile and sign out.' : 'Status, profile and sign out'}
          aria-expanded={menu === 'you'}
        >
          <div className="user-panel-name">
            {user.displayName}
            {news ? <i className="news-dot" aria-hidden="true" /> : null}
          </div>
          <div className="user-panel-status">{state.connection === 'open' && user.statusText ? user.statusText : connectionLabel}</div>
        </button>

        <span className="user-panel-tools">
          <button
            type="button"
            className={micOff ? 'icon-button panel-tool off' : 'icon-button panel-tool'}
            title={(selfMute ? 'Unmute' : 'Mute') + later}
            aria-label={selfMute ? 'Unmute' : 'Mute'}
            aria-pressed={micOff}
            onClick={() => updateVoice({ selfMute: !selfMute })}
          >
            <MicGlyph size={20} off={micOff} />
          </button>
          <button
            type="button"
            className={earsOff ? 'icon-button panel-tool off' : 'icon-button panel-tool'}
            title={(selfDeaf ? 'Undeafen' : 'Deafen') + later}
            aria-label={selfDeaf ? 'Undeafen' : 'Deafen'}
            aria-pressed={earsOff}
            onClick={() => updateVoice({ selfDeaf: !selfDeaf })}
          >
            <HeadphonesGlyph size={20} off={earsOff} />
          </button>
          <button
            type="button"
            className={menu === 'settings' ? 'icon-button panel-tool on' : 'icon-button panel-tool'}
            title="Settings"
            aria-label="Settings"
            aria-expanded={menu === 'settings'}
            onMouseDown={(event) => {
              if (menu === 'settings') event.stopPropagation();
            }}
            onClick={() => setMenu((current) => (current === 'settings' ? null : 'settings'))}
          >
            <GearGlyph size={20} />
          </button>
        </span>

        {dialog === 'audio' ? <VoiceSettings onClose={shut} /> : null}
        {dialog === 'notify' ? <NotifySettings onClose={shut} /> : null}
        {dialog === 'profile' ? <ProfileSettings onClose={shut} /> : null}
        {dialog === 'account' ? <AccountSettings onClose={shut} /> : null}
        {dialog === 'blocked' ? <BlockedPeople onClose={shut} /> : null}
        {dialog === 'themes' ? <ThemePicker onClose={shut} /> : null}
        {dialog === 'news' ? <WhatsNew onClose={shut} /> : null}

        {menu === 'settings' ? (
          <PanelMenu label="Settings" onClose={() => setMenu(null)}>
            <div className="panel-menu-heading">Settings</div>
            <MenuItem onClick={() => open('audio')}>Voice and audio</MenuItem>
            <MenuItem onClick={() => open('notify')}>Notifications</MenuItem>
            <MenuItem title="Choose a theme" onClick={() => open('themes')}>
              Themes
            </MenuItem>
            <MenuItem onClick={() => open('profile')}>Edit profile</MenuItem>
            <MenuItem onClick={() => open('account')}>Account</MenuItem>
            <MenuItem onClick={() => open('blocked')}>Blocked people</MenuItem>
          </PanelMenu>
        ) : null}

        {menu === 'you' ? (
          <PanelMenu label="You" onClose={() => setMenu(null)}>
            {(Object.keys(STATUS_LABEL) as PresenceStatus[]).map((option) => (
              <MenuItem
                key={option}
                onClick={() => {
                  setPresence(option);
                  setMenu(null);
                }}
              >
                <i className={`presence-dot ${option}`} style={{ position: 'static', border: 'none' }} />
                {STATUS_LABEL[option]}
                {option === status ? (
                  <span className="panel-menu-check" aria-label="current">
                    &#10003;
                  </span>
                ) : null}
              </MenuItem>
            ))}
            <div className="panel-menu-rule" />
            <MenuItem onClick={() => open('profile')}>Edit profile</MenuItem>
            <MenuItem title="What changed in the last few releases" onClick={() => open('news')}>
              What&apos;s new
              {news ? <i className="news-dot" aria-hidden="true" /> : null}
            </MenuItem>
            <MenuItem
              title="A short tour of the app, in plain words"
              onClick={() => {
                setMenu(null);
                openWalkthrough();
              }}
            >
              How Scryproof works
            </MenuItem>
            {installable ? (
              <MenuItem
                title="Puts Scryproof on your home screen or desktop, in its own window"
                onClick={() => {
                  setMenu(null);
                  void install();
                }}
              >
                Install on this device
              </MenuItem>
            ) : null}
            <div className="panel-menu-rule" />
            <MenuItem onClick={() => void signOut()}>Sign out</MenuItem>
            <div className="build-label" title="Which build of Scryproof this is">
              {buildLabel()}
            </div>
          </PanelMenu>
        ) : null}
      </div>
    </>
  );
}

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { useVoice } from '../state/useVoice';
import { useDms } from '../state/dms';
import { useLayer } from '../lib/back';
import { nameFor, useLocalNames } from '../lib/local-names';
import { isDesktop } from '../lib/desktop';
import { musicSound } from '../lib/music-share';
import { screenSound } from '../lib/voice-session';
import { MAX_PERSON_VOLUME, MAX_STREAM_VOLUME, voicePrefs } from '../lib/voice-prefs';
import type { PublicUser } from '@scryproof/shared';
import { Avatar, initials } from './Avatar';
import { ConnectionPanel } from './VoicePanel';
import { SpeakerGlyph, SlidersGlyph } from './glyphs';

function MusicListeners({
  ids,
  people,
}: {
  ids: string[];
  people: { userId: string; name: string; user?: PublicUser }[];
}) {
  const listeners = ids.flatMap((id) => {
    const person = people.find((entry) => entry.userId === id);
    return person ? [person] : [];
  });
  return (
    <div className="mixer-listeners">
      {listeners.length > 0 ? (
        <ul aria-label="Listening to this music">
          {listeners.map((person) => (
            <li
              key={person.userId}
              data-user-id={person.userId}
              title={`${person.name} is listening`}
              aria-label={`${person.name} is listening`}
            >
              {person.user ? (
                <Avatar user={person.user} name={person.name} small />
              ) : (
                <span className="avatar small" aria-hidden="true">
                  {initials(person.name)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <span>{listeners.length > 0 ? `${listeners.length} listening` : 'No one listening yet'}</span>
    </div>
  );
}

function Fader({
  label,
  source,
  value,
  onChange,
  max = MAX_PERSON_VOLUME,
  disabled = false,
}: {
  label: string;
  source: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  disabled?: boolean;
}) {
  const remembered = useRef(1);
  const percent = Math.round(value * 100);
  return (
    <div className={`mixer-fader${disabled ? ' inactive' : ''}`}>
      <button
        type="button"
        className="icon-button"
        disabled={disabled}
        aria-label={`${value === 0 ? 'Unmute' : 'Mute'} ${label}`}
        aria-pressed={value === 0}
        onClick={() => {
          if (value === 0) onChange(remembered.current);
          else {
            remembered.current = value;
            onChange(0);
          }
        }}
      >
        <SpeakerGlyph size={16} off={value === 0} />
      </button>
      <input
        type="range"
        className="voice-range"
        min={0}
        max={max * 100}
        step={5}
        value={percent}
        disabled={disabled}
        aria-label={`${label} volume`}
        aria-valuetext={`${percent} percent`}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <output className={value > 1 ? 'boosted' : ''}>{percent}%</output>
      <button
        type="button"
        className="mixer-reset"
        disabled={disabled || value === 1}
        title={`Reset ${label} to 100%`}
        aria-label={`Reset ${label} to 100%`}
        onClick={() => onChange(1)}
      >
        Reset
      </button>
      <div
        className="mixer-level"
        data-mix-source={source}
        role="meter"
        aria-label={`${label} level`}
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={-60}
        aria-valuetext="Silent"
        title="Output level · RMS dBFS · −60 to 0 dB"
      >
        <span className="mixer-level-track" aria-hidden="true">
          <i />
        </span>
        <span className="mixer-level-number" aria-hidden="true">
          −∞ dB
        </span>
      </div>
    </div>
  );
}

export function MixerButton({ dock = false }: { dock?: boolean }) {
  const call = useVoice();
  const [open, setOpen] = useState(false);
  const active = call.phase === 'connected';
  const musicCount = call.sharedAudio.filter((share) => share.kind === 'music').length;
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);
  return (
    <>
      <button
        type="button"
        className={dock ? 'voice-dock-button mixer-dock-button' : 'call-button mixer-button'}
        disabled={!active}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Call mixer"
        aria-label="Open call mixer"
      >
        <SlidersGlyph size={18} />
        <span>Mixer</span>
        {musicCount > 0 ? (
          <span className="mixer-badge" title="Music available">
            ♪ {musicCount}
          </span>
        ) : null}
      </button>
      {open && active ? <CallMixer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CallMixer({ onClose }: { onClose: () => void }) {
  const { state, voice: session } = useStore();
  const { state: conversations } = useDms();
  const call = useVoice();
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);
  useLocalNames();
  const panel = useRef<HTMLDivElement>(null);
  // One local sampling loop for the open mixer; no call-wide React rerenders.
  useEffect(() => {
    const draw = () => {
      if (document.hidden) return;
      for (const meter of panel.current?.querySelectorAll<HTMLElement>('[data-mix-source]') ?? []) {
        const db = session.mixerLevel(meter.dataset.mixSource!);
        const clamped = Math.max(-60, Math.min(0, db));
        const silent = db <= -60;
        const label = silent ? '−∞ dB' : `${Math.round(db)} dB`;
        meter.style.setProperty('--meter-level', `${((clamped + 60) / 60) * 100}%`);
        meter.setAttribute('aria-valuenow', String(Math.round(clamped)));
        meter.setAttribute('aria-valuetext', silent ? 'Below −60 dBFS' : `${Math.round(db)} dBFS`);
        const number = meter.querySelector('.mixer-level-number');
        if (number && number.textContent !== label) number.textContent = label;
      }
    };
    draw();
    const timer = window.setInterval(draw, 50);
    return () => window.clearInterval(timer);
  }, [session]);
  const close = useRef(onClose);
  close.current = onClose;
  useLayer(() => close.current());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('.share-picker')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"], a[href]',
        ) ?? []),
      ];
      if (!panel.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        return;
      }
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const occupants = Object.values(state.voiceStates).filter((person) =>
    call.channelId ? person.channelId === call.channelId : Boolean(call.dmId) && person.dmId === call.dmId,
  );
  const self = occupants.find((person) => person.userId === state.user?.id);
  const members = state.members[self?.serverId ?? ''] ?? [];
  const dm = call.dmId ? conversations.dms[call.dmId] : undefined;
  const everyone = occupants
    .map((person) => {
      const member = members.find((entry) => entry.userId === person.userId);
      const user =
        (person.userId === state.user?.id ? state.user : undefined) ??
        member?.user ??
        dm?.members.find((entry) => entry.id === person.userId);
      return { ...person, user, name: nameFor(person.userId, member?.nickname ?? user?.displayName ?? 'Someone') };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
  const people = everyone.filter((person) => person.userId !== state.user?.id);
  const ownMusic = call.sharedAudio.find((share) => share.userId === state.user?.id && share.kind === 'music');
  const canCapture = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const deafened = Boolean(self?.selfDeaf || self?.serverDeaf);
  const blocked = call.sharing || !call.can.screenShare || self?.serverMute || !canCapture;
  return createPortal(
    <div
      className="mixer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panel} className="call-mixer" role="dialog" aria-modal="true" aria-labelledby="call-mixer-title">
        <header className="mixer-header">
          <div>
            <span className="mixer-eyebrow">YOUR CALL · YOUR MIX</span>
            <h2 id="call-mixer-title">Call mixer</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close mixer" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="mixer-body">
          <p className="mixer-intro">Balance the room. These levels change only what you hear.</p>
          <section className="mixer-master" aria-label="Call output">
            <div className="mixer-section-label">
              Call output <span>{deafened ? 'Deafened' : 'All incoming audio'}</span>
            </div>
            <Fader
              label="Call output"
              source=":output"
              value={prefs.outputVolume}
              max={2}
              onChange={(outputVolume) => voicePrefs.set({ outputVolume })}
            />
            {deafened ? <p className="field-note">Undeafen in the call controls to hear your mix.</p> : null}
          </section>
          <section className="mixer-music" aria-label="Share music">
            <div className="mixer-music-heading">
              <div>
                <h3>Music together</h3>
                <p>Share a source. Everyone chooses whether to listen.</p>
              </div>
              <span aria-hidden="true">♪</span>
            </div>
            {call.musicSharing || call.musicBusy ? (
              <button type="button" className="button secondary inline" onClick={() => void session.stopMusic()}>
                {call.musicBusy ? 'Cancel audio share' : 'Stop sharing music'}
              </button>
            ) : (
              <button
                type="button"
                className="button inline"
                disabled={Boolean(blocked)}
                onClick={() => void session.startMusic()}
              >
                Share music
              </button>
            )}
            <p className="field-note">
              {call.sharing
                ? 'Stop your screen share to share music.'
                : !call.can.screenShare
                  ? 'You do not have sharing permission in this call.'
                  : self?.serverMute
                    ? 'A moderator has muted you.'
                    : !canCapture
                      ? 'This browser can listen, but cannot share audio.'
                      : isDesktop
                        ? 'Turn on Include sound in the picker. Windows shares all computer sound, including the call. For music without call echo, share a music tab from Chrome or Edge.'
                        : 'Choose a music tab and enable Share audio. Only audio is sent. Screen and music sharing use the same slot.'}
            </p>
            {call.musicError ? (
              <p className="mixer-error" role="alert">
                {call.musicError}
              </p>
            ) : null}
            {ownMusic ? <MusicListeners ids={ownMusic.listeners} people={everyone} /> : null}
            <p className="mixer-listener-note">When you listen, your picture appears for everyone in the call.</p>
          </section>
          <div className="mixer-section-label">
            People{' '}
            <span>
              {people.length} {people.length === 1 ? 'other person' : 'other people'}
            </span>
          </div>
          {people.length === 0 ? (
            <p className="mixer-empty">A little quiet in here. People appear as they join your call.</p>
          ) : null}
          {people.map((person) => (
            <section className="mixer-person" key={person.userId} aria-label={`${person.name} audio`}>
              <div className="mixer-person-heading">
                {person.user ? <Avatar user={person.user} name={person.name} small /> : null}
                <strong>{person.name}</strong>
                <span className={call.speaking.includes(person.userId) ? 'mixer-speaking' : ''}>
                  {person.selfMute || person.serverMute
                    ? 'Mic muted'
                    : call.speaking.includes(person.userId)
                      ? 'Speaking'
                      : 'Voice'}
                </span>
              </div>
              <Fader
                label={`${person.name} voice`}
                source={person.userId}
                value={prefs.volumes[person.userId] ?? 1}
                onChange={(value) => voicePrefs.setVolumeFor(person.userId, value)}
              />
              {call.sharedAudio
                .filter((share) => share.userId === person.userId)
                .map((share) => {
                  const music = share.kind === 'music';
                  const key = music ? musicSound(person.userId) : screenSound(person.userId);
                  const label = `${person.name} ${music ? 'music' : 'stream'}`;
                  return (
                    <div className="mixer-source" key={share.sid}>
                      <div className="mixer-source-heading">
                        <span>
                          {music ? '♪ Music' : 'Screen audio'}
                          {share.muted ? ' · Paused' : ''}
                        </span>
                        <button
                          type="button"
                          className={share.listening ? 'mixer-listen listening' : 'mixer-listen'}
                          aria-label={`${share.listening ? 'Stop listening to' : 'Listen to'} ${label}`}
                          aria-pressed={share.listening}
                          onClick={() =>
                            music
                              ? session.setMusicListening(person.userId, share.sid, !share.listening)
                              : session.setScreenSound(person.userId, !share.listening)
                          }
                        >
                          {share.listening ? 'Listening' : 'Listen'}
                        </button>
                      </div>
                      <Fader
                        label={label}
                        source={key}
                        value={prefs.volumes[key] ?? 1}
                        max={MAX_STREAM_VOLUME}
                        disabled={!share.listening}
                        onChange={(value) => voicePrefs.setVolumeFor(key, value)}
                      />
                      {music ? <MusicListeners ids={share.listeners} people={everyone} /> : null}
                    </div>
                  );
                })}
            </section>
          ))}
          <section className="mixer-board">
            <div className="mixer-section-label">
              Soundboard <span>All clips</span>
            </div>
            <Fader
              label="Soundboard"
              source=":soundboard"
              value={prefs.soundboardVolume}
              max={1}
              onChange={(soundboardVolume) => voicePrefs.set({ soundboardVolume })}
            />
          </section>
          <p className="mixer-footnote">
            100% is the original level. Boost quiet sources up to 400%; high levels can distort.
          </p>
        </div>
        <footer className="mixer-connection">
          <ConnectionPanel />
        </footer>
      </div>
    </div>,
    document.body,
  );
}

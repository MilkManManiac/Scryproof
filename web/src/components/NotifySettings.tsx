/**
 * Notifications: what makes a sound, what pops up, and how much a pop-up says.
 *
 * Rebuilt 2026-10-01 around one row per moment (Wes: "allow each user to be
 * very specific about what they want to hear and see"), with the real pop-up
 * card drawn next to each detail level so the choice is seen, not described
 * ("show rather than tell"). Channels and servers set differently from their
 * right-click menus are listed at the bottom, where an old choice can be found
 * and undone.
 *
 * Kept apart from the voice settings because it is a different question: that
 * dialog is about a call you are in, this is about the room carrying on
 * without you. None of it reaches the server except the mute lists and the
 * mention switch, which the phone needs.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { guide } from '../lib/guide';
import { notices } from '../lib/notices';
import { disablePush, enablePush, preparePush, pushAvailability, pushConfigured, pushState } from '../lib/push';
import { SOUND_BANK, SOUND_IDS, notifyPrefs, ownPlaceMode, playSound } from '../lib/notify';
import type { MessageSound, Moment, NotifyPrefs, PlaceMode, PopupDetail, SoundId } from '../lib/notify';
import type { PopupCard } from '../lib/popups';
import { useStore } from '../state/store';
import { Modal } from './Modal';
import { PopupCardView } from './PopupStack';

const WHEN_CHOICES: [value: MessageSound, label: string][] = [
  ['off', 'Never'],
  ['unfocused', 'When I am somewhere else'],
  ['always', 'Any channel I am not looking at'],
];

/** The rows, in the order people think of them: things for you, then the room, then the rest. */
const ROWS: { moment: Moment; label: string; note: string }[] = [
  { moment: 'mention', label: 'Someone mentions you', note: 'Your name, @everyone, or a role you have.' },
  { moment: 'dm', label: 'A direct message', note: 'Unless you are already looking at that conversation.' },
  { moment: 'message', label: 'A message in a channel', note: 'Everything else said in channels you can see.' },
  {
    moment: 'joined',
    label: 'Someone joins a voice room',
    note: 'The sound is for your own call. A pop-up is for any room in your servers.',
  },
  { moment: 'left', label: 'Someone leaves a voice room', note: 'The same, on the way out.' },
  { moment: 'live', label: 'Someone goes live', note: 'Starts sharing their screen in a voice room.' },
  { moment: 'ended', label: 'A stream ends', note: 'They stop sharing.' },
  { moment: 'event', label: 'An event is about to start', note: 'One you said you are going to.' },
  { moment: 'game', label: 'Someone finishes a daily game', note: 'Purdle, Cuntections, Trundle and the rest.' },
];

const DETAILS: { value: PopupDetail; label: string }[] = [
  { value: 'who', label: 'Who' },
  { value: 'where', label: 'Who and where' },
  { value: 'what', label: 'Who, where and what' },
];

/** The example in each detail picture. Made up, and obviously so to anyone who knows lamp. */
const EXAMPLE: PopupCard = {
  id: 'example',
  moment: 'mention',
  who: 'lamp',
  user: { id: 'example', username: 'lamp', displayName: 'lamp', accent: '#7c6cf0', avatarUrl: null, statusText: null },
  where: '#general · The Table',
  what: 'are we still on for tonight? bring the dice',
  open: () => undefined,
};

const PLACE_LABELS: Record<PlaceMode, string> = {
  default: 'Follow my settings',
  watch: 'Every message',
  mentions: 'Mentions only',
  mute: 'Mute',
};

function SoundPicker({ moment, prefs }: { moment: Moment; prefs: NotifyPrefs }) {
  // A mention's on/off lives in `mention`, which the phone reads too.
  const value: SoundId = moment === 'mention' && !prefs.mention ? 'none' : prefs.moments[moment].sound;
  return (
    <span className="notify-sound">
      <select
        className="voice-select"
        aria-label="Sound"
        value={value}
        onChange={(event) => {
          const sound = event.target.value as SoundId;
          if (moment === 'mention') notifyPrefs.set({ mention: sound !== 'none' });
          if (sound !== 'none' || moment !== 'mention') notifyPrefs.setMoment(moment, { sound });
          playSound(sound);
        }}
      >
        {SOUND_IDS.map((id) => (
          <option key={id} value={id}>
            {id === 'none' ? 'No sound' : SOUND_BANK[id].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-button notify-hear"
        title="Hear it"
        aria-label="Hear it"
        disabled={value === 'none'}
        onClick={() => playSound(value)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 5v14l12-7z" />
        </svg>
      </button>
    </span>
  );
}

export function NotifySettings({ onClose }: { onClose: () => void }) {
  const prefs = useSyncExternalStore(notifyPrefs.subscribe, notifyPrefs.get);
  const listPrefs = useSyncExternalStore(notices.subscribe, notices.prefs);
  const [refused, setRefused] = useState(false);
  const { state } = useStore();

  // Every channel and server set differently, by name, so a choice from
  // months ago is still findable. Something since left or deleted shows its id.
  const overridden = [...prefs.mutedServers, ...prefs.mutedChannels, ...prefs.watched, ...prefs.mentionsOnly];
  const places = Array.from(new Set(overridden)).map((id) => {
    const server = state.servers[id];
    if (server) return { id, scope: 'server' as const, name: server.name, where: 'Whole server' };
    for (const each of Object.values(state.servers)) {
      const channel = each.channels.find((entry) => entry.id === id);
      if (channel) return { id, scope: 'channel' as const, name: `${channel.type === 'voice' ? '' : '#'}${channel.name}`, where: each.name };
    }
    return { id, scope: (prefs.mutedServers.includes(id) ? 'server' : 'channel') as 'server' | 'channel', name: id, where: 'No longer here' };
  });

  return (
    <Modal
      title="Notifications"
      className="notify-settings"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      <p className="field-note">
        Pick what you hear and see for each kind of thing. A single channel or server can be set differently by
        right-clicking it. More on each of these, and on setting up your phone:{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            onClose();
            guide.open('notifications');
          }}
        >
          the Guide
        </button>
        .
      </p>

      <div className="settings-subhead">How much a pop-up says</div>
      <div className="notify-details" role="radiogroup" aria-label="How much a pop-up says">
        {DETAILS.map((detail) => (
          <label key={detail.value} className={prefs.popupDetail === detail.value ? 'notify-detail chosen' : 'notify-detail'}>
            <span className="notify-detail-head">
              <input
                type="radio"
                name="popup-detail"
                checked={prefs.popupDetail === detail.value}
                onChange={() => notifyPrefs.set({ popupDetail: detail.value })}
              />
              {detail.label}
            </span>
            <PopupCardView card={EXAMPLE} detail={detail.value} still />
          </label>
        ))}
      </div>
      <p className="field-note">
        A direct message&rsquo;s words only ever appear in Scryproof&rsquo;s own pop-up, and only for a conversation
        already open on this device. Your computer&rsquo;s notifications get who wrote, never what: the message is
        encrypted, and your computer keeps a history of what it showed.
      </p>
      <label className="toggle-row">
        <span>
          Use my computer&rsquo;s notifications when Scryproof is in the background
          <span className="field-note">
            The pop-up appears in the corner of your screen even with Scryproof behind other windows.
            {refused ? ' The browser said no. Allow notifications for this site in its settings, then try again.' : ''}
          </span>
        </span>
        <input
          type="checkbox"
          className="perm-switch"
          checked={listPrefs.popups}
          onChange={(event) => {
            if (!event.target.checked) return notices.setPrefs({ popups: false });
            void notices.enablePopups().then((allowed) => setRefused(!allowed));
          }}
        />
      </label>

      <div className="settings-subhead">What makes a sound or pops up</div>
      <div className="notify-moments">
        <div className="notify-moment notify-moment-head" aria-hidden="true">
          <span />
          <span>Sound</span>
          <span>Pop-up</span>
        </div>
        {ROWS.map((row) => (
          <div className="notify-moment" key={row.moment}>
            <span className="notify-moment-label">
              {row.label}
              <span className="field-note">{row.note}</span>
              {row.moment === 'message' ? (
                <select
                  className="voice-select notify-when"
                  aria-label="When a channel message makes a sound"
                  value={prefs.message}
                  onChange={(event) => notifyPrefs.set({ message: event.target.value as MessageSound })}
                >
                  {WHEN_CHOICES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : null}
            </span>
            <SoundPicker moment={row.moment} prefs={prefs} />
            <input
              type="checkbox"
              className="perm-switch"
              aria-label={`Pop up: ${row.label}`}
              checked={prefs.moments[row.moment].popup}
              onChange={(event) => notifyPrefs.setMoment(row.moment, { popup: event.target.checked })}
            />
          </div>
        ))}
      </div>
      <p className="field-note">A burst of messages is one sound, not one each.</p>

      <div className="settings-subhead">Volume</div>
      <div className="toggle-row">
        <span>
          How loud the sounds are
          <span className="field-note">All of these. Your computer&rsquo;s own volume still applies on top.</span>
        </span>
        <span className="voice-volume">
          <input
            type="range"
            className="voice-range"
            min={0}
            max={200}
            step={5}
            value={Math.round(prefs.volume * 100)}
            onChange={(event) => notifyPrefs.set({ volume: Number(event.target.value) / 100 })}
            onMouseUp={() => playSound(prefs.moments.mention.sound)}
            onKeyUp={() => playSound(prefs.moments.mention.sound)}
            aria-label="Volume of the notification sounds"
          />
          <span className="voice-volume-number">{Math.round(prefs.volume * 100)}%</span>
        </span>
      </div>

      <PushSection />

      <div className="settings-subhead">Channels and servers set differently</div>
      {places.length === 0 ? (
        <p className="field-note">None. Right-click a channel or a server to watch it, hear only mentions, or mute it.</p>
      ) : (
        <div className="radio-group">
          {places.map((place) => (
            <div className="toggle-row" key={place.id}>
              <span>
                {place.name}
                <span className="field-note">{place.where}</span>
              </span>
              <select
                className="voice-select"
                aria-label={`Notifications for ${place.name}`}
                value={ownPlaceMode(prefs, place.id)}
                onChange={(event) => notifyPrefs.setPlace(place.id, place.scope, event.target.value as PlaceMode)}
              >
                {(['default', 'watch', 'mentions', 'mute'] as const).map((mode) => (
                  <option key={mode} value={mode}>
                    {PLACE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="settings-subhead">The list behind the bell</div>
      <label className="toggle-row">
        <span>
          Show what a channel message says
          <span className="field-note">Off means only who and where. Kept on this device only.</span>
        </span>
        <input
          type="checkbox"
          className="perm-switch"
          checked={listPrefs.previews}
          onChange={(event) => notices.setPrefs({ previews: event.target.checked })}
        />
      </label>
    </Modal>
  );
}

/**
 * Phone notifications for this device (`lib/push.ts`). Not drawn at all where
 * it cannot work, except on an iPhone in Safari, which is told how to get it.
 */
function PushSection() {
  const availability = pushAvailability();
  const on = useSyncExternalStore(pushState.subscribe, pushState.get);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void preparePush();
  }, []);

  if (availability === 'unsupported') return null;

  return (
    <>
      <div className="settings-subhead">When Scryproof is closed</div>
      {availability === 'install-first' ? (
        <p className="field-note">
          On an iPhone this only works in the app on your home screen. In Safari, tap Share, then Add to Home Screen,
          open Scryproof from there, and turn it on here.
        </p>
      ) : (
        <label className="toggle-row">
          <span>
            Notify this device
            <span className="field-note">
              &ldquo;Someone messaged you&rdquo; or &ldquo;Someone mentioned you&rdquo;, never who or what, with a
              sound and a number on the app&rsquo;s icon. &ldquo;No sound&rdquo; on mentions above stops them
              here too, and muted places stay quiet.
              {problem ? ` ${problem}` : ''}
            </span>
          </span>
          <input
            type="checkbox"
            className="perm-switch"
            checked={on === true}
            disabled={busy || on === null}
            onChange={(event) => {
              setProblem(null);
              if (!event.target.checked) {
                setBusy(true);
                void disablePush().finally(() => setBusy(false));
                return;
              }
              if (!pushConfigured()) {
                setProblem('This server has not been set up for it yet.');
                return;
              }
              setBusy(true);
              void enablePush()
                .then((result) => {
                  if (result === 'refused') {
                    setProblem('Your device said no. Allow notifications for Scryproof in its settings, then try again.');
                  } else if (result !== 'on') {
                    setProblem('That did not work. Try again in a moment.');
                  }
                })
                .finally(() => setBusy(false));
            }}
          />
        </label>
      )}
      {availability === 'ready' && on === true ? (
        <>
          <EveryMessage />
          <WhileAttending />
        </>
      ) : null}
    </>
  );
}

function EveryMessage() {
  const [every, setEvery] = useState(notifyPrefs.get().pushEvery);
  useEffect(() => notifyPrefs.subscribe(() => setEvery(notifyPrefs.get().pushEvery)), []);
  return (
    <label className="toggle-row">
      <span>
        Every channel message too
        <span className="field-note">
          Adds &ldquo;New message in a channel&rdquo; for everything said where you can see it. Busy servers make
          this a lot of buzzing.
        </span>
      </span>
      <input
        type="checkbox"
        className="perm-switch"
        checked={every}
        onChange={(event) => notifyPrefs.set({ pushEvery: event.target.checked })}
      />
    </label>
  );
}

function WhileAttending() {
  const [value, setValue] = useState(notifyPrefs.get().pushWhileAttending);
  useEffect(() => notifyPrefs.subscribe(() => setValue(notifyPrefs.get().pushWhileAttending)), []);
  return (
    <label className="toggle-row">
      <span>
        Even while I am on my computer
        <span className="field-note">
          Off keeps this device quiet while you are using Scryproof on another screen. Either way, nothing comes
          while you are looking at it here.
        </span>
      </span>
      <input
        type="checkbox"
        className="perm-switch"
        checked={value}
        onChange={(event) => notifyPrefs.set({ pushWhileAttending: event.target.checked })}
      />
    </label>
  );
}

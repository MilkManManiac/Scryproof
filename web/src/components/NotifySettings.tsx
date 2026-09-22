/**
 * What makes a sound when somebody says something.
 *
 * Kept apart from the voice settings because it is a different question: that
 * dialog is about a call you are in, this is about the room carrying on
 * without you. Like the voice settings, none of it reaches the server — what
 * your machine does when a message arrives is not the server's business.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { notices } from '../lib/notices';
import { notifyPrefs, play } from '../lib/notify';
import type { MessageSound } from '../lib/notify';
import { useStore } from '../state/store';
import { Modal } from './Modal';

const MESSAGE_CHOICES: [value: MessageSound, label: string, note: string][] = [
  ['off', 'Never', 'Only the times someone says your name.'],
  ['unfocused', 'When I am somewhere else', 'Nothing while you are sitting in front of it.'],
  ['always', 'Every message', 'Including the channel already on screen.'],
];

export function NotifySettings({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState(notifyPrefs.get());
  useEffect(() => notifyPrefs.subscribe(() => setPrefs(notifyPrefs.get())), []);
  const popups = useSyncExternalStore(notices.subscribe, notices.prefs);
  const [refused, setRefused] = useState(false);
  const { state } = useStore();

  // Names for whatever is muted, so a mute from months ago is still findable.
  // A server or channel that has since been left or deleted just shows its id.
  const mutedServers = prefs.mutedServers.map((id) => ({ id, name: state.servers[id]?.name ?? id }));
  const mutedChannels = prefs.mutedChannels.map((id) => {
    for (const server of Object.values(state.servers)) {
      const channel = server.channels.find((entry) => entry.id === id);
      if (channel) return { id, name: `#${channel.name}`, server: server.name };
    }
    return { id, name: id, server: null as string | null };
  });

  return (
    <Modal
      title="Notifications"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      <label className="toggle-row">
        <span>
          When someone says your name
          <span className="field-note">
            A mention, or @everyone.{' '}
            <button
              type="button"
              className="link-button"
              onClick={(event) => {
                event.preventDefault();
                play('mention');
              }}
            >
              Hear it
            </button>
          </span>
        </span>
        <input
          type="checkbox"
          className="perm-switch"
          checked={prefs.mention}
          onChange={(event) => notifyPrefs.set({ mention: event.target.checked })}
        />
      </label>

      <div className="settings-subhead">Pop-ups</div>
      <label className="toggle-row">
        <span>
          Show a pop-up when I am somewhere else
          <span className="field-note">
            For mentions and direct messages. A direct message pop-up says who wrote, never what: that text is
            encrypted, and your computer&rsquo;s notification history is not.
            {refused ? ' The browser said no. Allow notifications for this site in its settings, then try again.' : ''}
          </span>
        </span>
        <input
          type="checkbox"
          className="perm-switch"
          checked={popups.popups}
          onChange={(event) => {
            if (!event.target.checked) return notices.setPrefs({ popups: false });
            void notices.enablePopups().then((allowed) => setRefused(!allowed));
          }}
        />
      </label>
      <label className="toggle-row">
        <span>
          Show what a channel message says
          <span className="field-note">In the pop-up and in the list behind the bell. Off means only who and where.</span>
        </span>
        <input
          type="checkbox"
          className="perm-switch"
          checked={popups.previews}
          onChange={(event) => notices.setPrefs({ previews: event.target.checked })}
        />
      </label>

      <div className="settings-subhead">Sounds for everything else</div>
      <div className="radio-group">
        <p className="field-note">
          One short note.{' '}
          <button
            type="button"
            className="link-button"
            onClick={(event) => {
              event.preventDefault();
              play('message');
            }}
          >
            Hear it
          </button>
        </p>
        {MESSAGE_CHOICES.map(([value, label, note]) => (
          <label className="radio-row" key={value}>
            <input
              type="radio"
              name="message-sound"
              checked={prefs.message === value}
              onChange={() => notifyPrefs.set({ message: value })}
            />
            <span>
              {label}
              <span className="field-note">{note}</span>
            </span>
          </label>
        ))}
        <p className="field-note">
          A burst of messages is one sound, not one each.
        </p>
      </div>

      <div className="settings-subhead">Volume</div>
      <div className="toggle-row">
        <span>
          How loud the sounds are
          <span className="field-note">Both of them. Your computer&rsquo;s own volume still applies on top.</span>
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
            onMouseUp={() => play('mention')}
            onKeyUp={() => play('mention')}
            aria-label="Volume of the message and mention sounds"
          />
          <span className="voice-volume-number">{Math.round(prefs.volume * 100)}%</span>
        </span>
      </div>

      {mutedServers.length > 0 || mutedChannels.length > 0 ? (
        <>
          <div className="settings-subhead">Muted</div>
          <div className="radio-group">
            {mutedServers.map((entry) => (
              <label className="toggle-row" key={`server-${entry.id}`}>
                <span>{entry.name}</span>
                <button
                  type="button"
                  className="button secondary inline"
                  onClick={() => notifyPrefs.toggleServer(entry.id)}
                >
                  Unmute
                </button>
              </label>
            ))}
            {mutedChannels.map((entry) => (
              <label className="toggle-row" key={`channel-${entry.id}`}>
                <span>
                  {entry.name}
                  {entry.server ? <span className="field-note">{entry.server}</span> : null}
                </span>
                <button
                  type="button"
                  className="button secondary inline"
                  onClick={() => notifyPrefs.toggleChannel(entry.id)}
                >
                  Unmute
                </button>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

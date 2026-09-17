/**
 * What makes a sound when somebody says something.
 *
 * Kept apart from the voice settings because it is a different question: that
 * dialog is about a call you are in, this is about the room carrying on
 * without you. Like the voice settings, none of it reaches the server — what
 * your machine does when a message arrives is not the server's business.
 */

import { useEffect, useState } from 'react';

import { notifyPrefs, play } from '../lib/notify';
import type { MessageSound } from '../lib/notify';
import { Modal } from './Modal';

const MESSAGE_CHOICES: [value: MessageSound, label: string, note: string][] = [
  ['off', 'Never', 'Only the times someone says your name.'],
  ['unfocused', 'When I am somewhere else', 'Nothing while you are sitting in front of it.'],
  ['always', 'Every message', 'Including the channel already on screen.'],
];

export function NotifySettings({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState(notifyPrefs.get());
  useEffect(() => notifyPrefs.subscribe(() => setPrefs(notifyPrefs.get())), []);

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

      <div className="settings-subhead">Everything else</div>
      <div className="radio-group">
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
    </Modal>
  );
}

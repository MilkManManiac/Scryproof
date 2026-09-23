/**
 * The quality of a call's pictures, from inside the call.
 *
 * The same settings as Voice settings (voicePrefs, in this browser only), put
 * where you are when you notice a stream looks bad (Wes, 2026-09-23: "let them
 * adjust the stream quality from there as well"). What you send, if you share,
 * changes at once; what you receive changes at once for everyone you watch.
 * The full settings are one click further, where they always were.
 */

import { useSyncExternalStore } from 'react';

import { shareCostLabel, voicePrefs, type ReceiveQuality, type ShareFps, type ShareHeight } from '../lib/voice-prefs';
import { Menu } from './Menu';

const RECEIVE: { id: ReceiveQuality; label: string }[] = [
  { id: 'auto', label: 'Sharp' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

export function CallQuality({
  sharing,
  canShare,
  onClose,
  onAllSettings,
}: {
  /** This device is sharing its screen right now, so a change applies to it live. */
  sharing: boolean;
  canShare: boolean;
  onClose: () => void;
  onAllSettings: () => void;
}) {
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);

  return (
    <div className="call-quality" onClick={(event) => event.stopPropagation()}>
      <Menu onClose={onClose}>
        {canShare ? (
          <>
            <div className="call-quality-head">Your screen share</div>
            <div className="call-quality-row">
              <select
                className="voice-select"
                aria-label="Screen share resolution"
                value={prefs.shareHeight}
                onChange={(event) => voicePrefs.set({ shareHeight: Number(event.target.value) as ShareHeight })}
              >
                <option value={720}>720p</option>
                <option value={1080}>1080p</option>
                <option value={1440}>1440p</option>
                <option value={0}>Full size</option>
              </select>
              <select
                className="voice-select"
                aria-label="Screen share frames a second"
                value={prefs.shareFps}
                onChange={(event) => voicePrefs.set({ shareFps: Number(event.target.value) as ShareFps })}
              >
                <option value={15}>15 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
            <p className="call-quality-note">
              {shareCostLabel(prefs)} {sharing ? 'Changes your share now.' : 'Used when you start sharing.'}
            </p>
          </>
        ) : null}

        <div className="call-quality-head">What you watch</div>
        <div className="voice-modes" role="radiogroup" aria-label="Video you receive">
          {RECEIVE.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={prefs.receiveQuality === choice.id}
              className={prefs.receiveQuality === choice.id ? 'voice-mode active' : 'voice-mode'}
              onClick={() => voicePrefs.set({ receiveQuality: choice.id })}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p className="call-quality-note">Only for you. Lower it if streams stutter on your connection.</p>

        <button
          type="button"
          className="link-button call-quality-more"
          onClick={() => {
            onClose();
            onAllSettings();
          }}
        >
          All voice and video settings
        </button>
      </Menu>
    </div>
  );
}

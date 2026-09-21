/**
 * Voice and audio settings.
 *
 * Everything here is stored in this browser and nowhere else. The meter opens
 * the microphone for as long as this dialog is open, to show that it works and
 * to make the threshold something you set by looking rather than guessing;
 * that audio goes to the meter and no further.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { openMeter, sounds } from '../lib/voice-audio';
import { captureOptions, keyLabel, shareCostLabel, voicePrefs, type InputMode, type ShareFps, type ShareHeight } from '../lib/voice-prefs';
import { Modal } from './Modal';

const FLOOR_DB = -80;
const toPercent = (db: number): number => Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100));

const MODES: { id: InputMode; label: string; note: string }[] = [
  { id: 'open', label: 'Always on', note: 'Your microphone is live whenever you are not muted.' },
  {
    id: 'threshold',
    label: 'When I talk',
    note: 'Live only while you are louder than the line on the meter. Keyboards and fans stay out.',
  },
  {
    id: 'push',
    label: 'Push to talk',
    note: 'Live only while you hold a key. This works while Scryproof is the window in front. Holding a key from inside a game needs the desktop app, which does not exist yet.',
  },
];

const canChooseSpeaker = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

export function VoiceSettings({ onClose }: { onClose: () => void }) {
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(FLOOR_DB);
  const [meterError, setMeterError] = useState<string | null>(null);
  const [capturingKey, setCapturingKey] = useState(false);

  const { inputDeviceId, noiseSuppression, echoCancellation, autoGain } = prefs;

  // The meter follows the chosen microphone and processing, so what it shows
  // is what a call would send.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    setMeterError(null);

    openMeter(captureOptions(voicePrefs.get()), setLevel)
      .then(async (close) => {
        if (cancelled) return close();
        stop = close;
        // Device names are hidden until the microphone has been allowed once.
        setDevices(await navigator.mediaDevices.enumerateDevices());
      })
      .catch(() => {
        if (!cancelled) setMeterError('The microphone could not be opened. Check that the browser is allowed to use it.');
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [inputDeviceId, noiseSuppression, echoCancellation, autoGain]);

  useEffect(() => {
    if (!capturingKey) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== 'Escape') voicePrefs.set({ pushKey: event.code });
      setCapturingKey(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturingKey]);

  const microphones = devices.filter((device) => device.kind === 'audioinput' && device.deviceId !== 'default');
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  const speakers = devices.filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default');
  const open = prefs.inputMode !== 'threshold' || level >= prefs.thresholdDb;

  return (
    <Modal
      title="Voice and audio"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="voice-settings">
        <div className="settings-subhead">Microphone</div>
        <select
          className="voice-select"
          value={prefs.inputDeviceId}
          onChange={(event) => voicePrefs.set({ inputDeviceId: event.target.value })}
        >
          <option value="">System default</option>
          {microphones.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || 'Microphone'}
            </option>
          ))}
        </select>

        <div className="voice-meter-wrap">
          <div className={`voice-meter${open ? '' : ' shut'}`} aria-label="Microphone level">
            <div className="voice-meter-fill" style={{ width: `${toPercent(level)}%` }} />
          </div>
          {prefs.inputMode === 'threshold' ? (
            <>
              <div className="voice-meter-line" style={{ left: `${toPercent(prefs.thresholdDb)}%` }} />
              <input
                type="range"
                className="voice-range over-meter"
                min={FLOOR_DB}
                max={0}
                step={1}
                value={prefs.thresholdDb}
                onChange={(event) => voicePrefs.set({ thresholdDb: Number(event.target.value) })}
                aria-label="Loudness needed before your microphone opens"
              />
            </>
          ) : null}
        </div>
        <p className="field-note">
          {meterError ??
            (prefs.inputMode === 'threshold'
              ? 'Talk normally and drag the line to just below where your voice reaches. The bar dims when you would not be heard.'
              : 'Say something. If the bar does not move, this is the wrong microphone.')}
        </p>

        <div className="voice-modes" role="radiogroup" aria-label="When your microphone is live">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={prefs.inputMode === mode.id}
              className={prefs.inputMode === mode.id ? 'voice-mode active' : 'voice-mode'}
              onClick={() => voicePrefs.set({ inputMode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="field-note">{MODES.find((mode) => mode.id === prefs.inputMode)?.note}</p>

        {prefs.inputMode === 'push' ? (
          <div className="toggle-row">
            <span>
              Key to hold
              <span className="field-note">Pick one you do not type with.</span>
            </span>
            <button type="button" className="button secondary inline" onClick={() => setCapturingKey(true)}>
              {capturingKey ? 'Press a key…' : keyLabel(prefs.pushKey)}
            </button>
          </div>
        ) : null}

        <label className="toggle-row">
          <span>
            Noise suppression
            <span className="field-note">Takes out steady background noise. Turn off if your voice sounds underwater.</span>
          </span>
          <input
            type="checkbox"
            className="perm-switch"
            checked={prefs.noiseSuppression}
            onChange={(event) => voicePrefs.set({ noiseSuppression: event.target.checked })}
          />
        </label>
        <label className="toggle-row">
          <span>
            Echo cancellation
            <span className="field-note">Stops your speakers feeding back into the call. Leave on unless you wear headphones.</span>
          </span>
          <input
            type="checkbox"
            className="perm-switch"
            checked={prefs.echoCancellation}
            onChange={(event) => voicePrefs.set({ echoCancellation: event.target.checked })}
          />
        </label>
        <label className="toggle-row">
          <span>
            Automatic volume
            <span className="field-note">Evens out quiet and loud moments. Turn off if you set your own microphone gain.</span>
          </span>
          <input
            type="checkbox"
            className="perm-switch"
            checked={prefs.autoGain}
            onChange={(event) => voicePrefs.set({ autoGain: event.target.checked })}
          />
        </label>

        <div className="settings-subhead">Speakers</div>
        {canChooseSpeaker ? (
          <select
            className="voice-select"
            value={prefs.outputDeviceId}
            onChange={(event) => voicePrefs.set({ outputDeviceId: event.target.value })}
          >
            <option value="">System default</option>
            {speakers.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || 'Speakers'}
              </option>
            ))}
          </select>
        ) : (
          <p className="field-note">This browser always plays through the system default. Chrome and Edge can choose.</p>
        )}

        <div className="toggle-row">
          <span>
            Everyone's volume
            <span className="field-note">Each person also has their own: click them in the call.</span>
          </span>
          <span className="voice-volume">
            <input
              type="range"
              className="voice-range"
              min={0}
              max={200}
              step={5}
              value={Math.round(prefs.outputVolume * 100)}
              onChange={(event) => voicePrefs.set({ outputVolume: Number(event.target.value) / 100 })}
              aria-label="Volume of everyone you hear"
            />
            <span className="voice-volume-number">{Math.round(prefs.outputVolume * 100)}%</span>
          </span>
        </div>

        <label className="toggle-row">
          <span>
            Join and leave sounds
            <span className="field-note">
              Two short tones when someone comes or goes.{' '}
              <button type="button" className="link-button" onClick={(event) => { event.preventDefault(); sounds.joined(); }}>
                Hear it
              </button>
            </span>
          </span>
          <input
            type="checkbox"
            className="perm-switch"
            checked={prefs.sounds}
            onChange={(event) => voicePrefs.set({ sounds: event.target.checked })}
          />
        </label>

        <div className="settings-subhead">Camera</div>
        <select
          className="voice-select"
          value={prefs.cameraDeviceId}
          onChange={(event) => voicePrefs.set({ cameraDeviceId: event.target.value })}
        >
          <option value="">System default</option>
          {cameras.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || 'Camera'}
            </option>
          ))}
        </select>

        <div className="settings-subhead">Screen share quality</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            className="voice-select"
            aria-label="Resolution"
            value={prefs.shareHeight}
            onChange={(event) => voicePrefs.set({ shareHeight: Number(event.target.value) as ShareHeight })}
          >
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
            <option value={1440}>1440p</option>
            <option value={0}>Full size of the screen</option>
          </select>
          <select
            className="voice-select"
            aria-label="Frames a second"
            value={prefs.shareFps}
            onChange={(event) => voicePrefs.set({ shareFps: Number(event.target.value) as ShareFps })}
          >
            <option value={15}>15 frames a second</option>
            <option value={30}>30 frames a second</option>
            <option value={60}>60 frames a second</option>
          </select>
        </div>
        <p className="field-note">
          {shareCostLabel(prefs)} Everyone watching downloads the same. Applies the next time you start sharing.
        </p>
      </div>
    </Modal>
  );
}

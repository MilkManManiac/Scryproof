/**
 * Voice and audio settings.
 *
 * Everything here is stored in this browser and nowhere else. The meter opens
 * the microphone for as long as this dialog is open, to show that it works and
 * to make the threshold something you set by looking rather than guessing;
 * that audio goes to the meter and no further. With a voice changer chosen,
 * "Hear it" also plays the changed voice back to this device's own speakers.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { isDesktop } from '../lib/desktop';
import { canRunModel, openMeter, sounds } from '../lib/voice-audio';
import { VOICE_EFFECTS, isVoiceEffect } from '../lib/voice-effects';
import {
  cameraCostLabel,
  captureOptions,
  keyLabel,
  usesModel,
  shareCostLabel,
  voicePrefs,
  type CameraFps,
  type CameraHeight,
  type InputMode,
  type NoiseMode,
  type ReceiveQuality,
  type ShareFps,
  type ShareHeight,
} from '../lib/voice-prefs';
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
    note: isDesktop
      ? 'Live only while you hold a key, even with a game in front. The app watches for that one key and nothing else.'
      : 'Live only while you hold a key, while this tab is the window in front. From inside a game, use the desktop app.',
  },
];

const RECEIVE: { id: ReceiveQuality; label: string; note: string }[] = [
  { id: 'auto', label: 'Sharp', note: 'As much picture as the tile on your screen can show. The usual choice.' },
  { id: 'medium', label: 'Medium', note: 'A middle-sized picture whatever the tile size. Easier on a slow connection.' },
  { id: 'low', label: 'Low', note: 'The smallest picture anyone sends. For a connection that is struggling.' },
];

const NOISE: { id: NoiseMode; label: string; note: string }[] = [
  {
    id: 'strong',
    label: 'Strong',
    note: 'A speech model on this computer keeps your voice and drops the rest: keys, fans, breathing, knocks on the microphone.',
  },
  { id: 'standard', label: 'Standard', note: "The browser's own. Takes out steady sounds like a fan, not sudden ones." },
  { id: 'off', label: 'Off', note: 'Your microphone exactly as it is. For a good microphone in a quiet room.' },
];

const canChooseSpeaker = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

export function VoiceSettings({ onClose }: { onClose: () => void }) {
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(FLOOR_DB);
  const [meterError, setMeterError] = useState<string | null>(null);
  const [capturingKey, setCapturingKey] = useState(false);
  const [hearing, setHearing] = useState(false);

  const [modelFailed, setModelFailed] = useState(false);

  const { inputDeviceId, noiseMode, echoCancellation, autoGain } = prefs;
  const voiceEffect = isVoiceEffect(prefs.voiceEffect) ? prefs.voiceEffect : 'none';
  const suppress = usesModel(prefs);

  // The meter follows the chosen microphone and processing, so what it shows
  // is what a call would send.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    setMeterError(null);

    const options = captureOptions(voicePrefs.get());
    openMeter(options, setLevel, hearing ? { suppress, effect: voiceEffect } : null)
      .then(async (meter) => {
        if (cancelled) return meter.stop();
        stop = meter.stop;
        setModelFailed(hearing && suppress && !meter.suppressing);
        // Device names are hidden until the microphone has been allowed once.
        setDevices(await navigator.mediaDevices.enumerateDevices());
      })
      .catch((problem: unknown) => {
        if (cancelled) return;
        // getUserMedia fails with one of these names; anything else came from
        // building the voice changer.
        const name = problem instanceof Error ? problem.name : '';
        const microphone = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError'];
        if (hearing && !microphone.includes(name)) {
          setHearing(false);
          setMeterError('The voice changer could not be started in this browser. In a call you would sound like yourself.');
        } else {
          setMeterError('The microphone could not be opened. Check that the browser is allowed to use it.');
        }
      });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [inputDeviceId, noiseMode, echoCancellation, autoGain, hearing, suppress, voiceEffect]);

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

        <div className="settings-subhead">Noise suppression</div>
        <div className="voice-modes" role="radiogroup" aria-label="Noise suppression">
          {NOISE.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={noiseMode === mode.id}
              className={noiseMode === mode.id ? 'voice-mode active' : 'voice-mode'}
              onClick={() => voicePrefs.set({ noiseMode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="toggle-row">
          <span>
            {NOISE.find((mode) => mode.id === noiseMode)?.note}
            <span className="field-note">
              {noiseMode === 'strong' && (!canRunModel || modelFailed)
                ? 'This copy of the app cannot run the model yet, so it is using Standard. The next desktop update fixes that; the website already can.'
                : 'Use headphones to listen, or the speakers feed back into the microphone.'}
            </span>
          </span>
          <button type="button" className="button secondary inline" onClick={() => setHearing((on) => !on)}>
            {hearing ? 'Stop listening' : 'Hear it'}
          </button>
        </div>

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

        <div className="settings-subhead">Voice changer</div>
        <div className="voice-modes" role="radiogroup" aria-label="Voice changer">
          {VOICE_EFFECTS.map((effect) => (
            <button
              key={effect.id}
              type="button"
              role="radio"
              aria-checked={voiceEffect === effect.id}
              className={voiceEffect === effect.id ? 'voice-mode active' : 'voice-mode'}
              onClick={() => voicePrefs.set({ voiceEffect: effect.id })}
            >
              {effect.label}
            </button>
          ))}
        </div>
        {voiceEffect === 'none' ? (
          <p className="field-note">Robot, Chipmunk and Deep change your voice on this device, before it is encrypted and sent.</p>
        ) : (
          <div className="toggle-row">
            <span>
              {VOICE_EFFECTS.find((effect) => effect.id === voiceEffect)?.note}
              <span className="field-note">
                This is what everyone in the call hears. Use headphones to listen, or the speakers feed back into the microphone.
              </span>
            </span>
            <button type="button" className="button secondary inline" onClick={() => setHearing((on) => !on)}>
              {hearing ? 'Stop listening' : 'Hear it'}
            </button>
          </div>
        )}

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

        <div className="toggle-row">
          <span>
            Soundboard volume
            <span className="field-note">Every soundboard sound you hear, yours too. All the way down turns them off.</span>
          </span>
          <span className="voice-volume">
            <input
              type="range"
              className="voice-range"
              min={0}
              max={100}
              step={5}
              value={Math.round(prefs.soundboardVolume * 100)}
              onChange={(event) => voicePrefs.set({ soundboardVolume: Number(event.target.value) / 100 })}
              aria-label="Volume of soundboard sounds"
            />
            <span className="voice-volume-number">{prefs.soundboardVolume === 0 ? 'Off' : `${Math.round(prefs.soundboardVolume * 100)}%`}</span>
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

        <div className="settings-subhead">Camera quality</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            className="voice-select"
            aria-label="Camera resolution"
            value={prefs.cameraHeight}
            onChange={(event) => voicePrefs.set({ cameraHeight: Number(event.target.value) as CameraHeight })}
          >
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
          </select>
          <select
            className="voice-select"
            aria-label="Camera frames a second"
            value={prefs.cameraFps}
            onChange={(event) => voicePrefs.set({ cameraFps: Number(event.target.value) as CameraFps })}
          >
            <option value={30}>30 frames a second</option>
            <option value={60}>60 frames a second</option>
          </select>
        </div>
        <p className="field-note">
          {cameraCostLabel(prefs)} A camera that cannot do what is asked gives its best instead. Applies the next time you turn it on.
        </p>

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
          {shareCostLabel(prefs)} Applies the next time you start sharing. Each watcher can ask for less, below.
        </p>

        <div className="settings-subhead">Video you receive</div>
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
        <p className="field-note">
          {RECEIVE.find((choice) => choice.id === prefs.receiveQuality)?.note} Cameras and screens alike, in a call now
          and every call after. Nobody else is affected: they keep sending, and the server hands you the smaller copy.
        </p>
      </div>
    </Modal>
  );
}

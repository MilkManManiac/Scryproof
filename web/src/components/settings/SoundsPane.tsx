/**
 * The server's soundboard: upload, rename, remove, and play to hear one.
 *
 * Laid out like the Emoji page beside it. The list comes from the store, which
 * holds what arrived with the server and refreshes on the gateway's
 * `sounds_changed`, so two people editing at once see each other's work.
 *
 * Adding goes through the clipper (`SoundClipper.tsx`): any audio file, a
 * part of it up to the length limit, heard and given a volume before upload.
 * Each sound's volume can be changed here afterwards. The server checks size,
 * type and (for the clipper's Ogg files) length again, and decides.
 */

import { useEffect, useState } from 'react';
import { LIMITS, Permission, validateSoundName } from '@scryproof/shared';
import type { ServerDetail, Sound } from '@scryproof/shared';

import { ApiError, api } from '../../lib/api';
import { SOURCE_ACCEPT } from '../../lib/sound-cut';
import { previewSound } from '../../lib/sounds';
import { SoundClipper } from '../SoundClipper';
import type { Authority } from './authority';

const kilobytes = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function SoundsPane({ server, authority }: { server: ServerDetail; authority: Authority }) {
  const editable = authority.can(Permission.MANAGE_SERVER);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounting the file input is the only way to clear what it shows.
  const [inputKey, setInputKey] = useState(0);

  const sounds = server.sounds ?? [];
  const full = sounds.length >= LIMITS.soundsPerServer;

  function finish() {
    setFile(null);
    setInputKey((key) => key + 1);
  }

  async function remove(soundId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.sounds.remove(server.id, soundId);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not remove the sound.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Sounds</h2>
      {error ? <div className="error">{error}</div> : null}

      <p className="settings-note">
        Anyone in a call in this server can play these for everyone else in the call, from the speaker button beside
        mute. {sounds.length} of {LIMITS.soundsPerServer} used.
      </p>

      {sounds.length === 0 ? (
        <p className="settings-note">This server has no sounds yet.</p>
      ) : (
        <div className="emoji-rows">
          {sounds.map((sound) => (
            <SoundRow
              key={sound.id}
              server={server}
              sound={sound}
              editable={editable}
              busy={busy}
              onError={setError}
              onRemove={() => void remove(sound.id)}
            />
          ))}
        </div>
      )}

      {editable ? (
        <>
          <div className="settings-subhead">Add a sound</div>
          {full ? (
            <p className="settings-note">This server is holding as many sounds as it can. Remove one to add another.</p>
          ) : (
            <div className="emoji-add">
              <div className="field">
                <label htmlFor="sound-file">Sound</label>
                <input
                  key={inputKey}
                  id="sound-file"
                  type="file"
                  accept={SOURCE_ACCEPT}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="field-note">
                  Any sound or song file. You pick up to {LIMITS.soundSeconds} seconds of it next, and only that part is
                  uploaded.
                </p>
              </div>
              {file ? (
                <SoundClipper
                  key={`${file.name}-${inputKey}`}
                  file={file}
                  serverId={server.id}
                  serverName={server.name}
                  onDone={finish}
                  onCancel={finish}
                />
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

function SoundRow({
  server,
  sound,
  editable,
  busy,
  onError,
  onRemove,
}: {
  server: ServerDetail;
  sound: Sound;
  editable: boolean;
  busy: boolean;
  onError: (message: string | null) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(sound.name);
  const [loudness, setLoudness] = useState(sound.volume);
  useEffect(() => setLoudness(sound.volume), [sound.volume]);
  const [saving, setSaving] = useState(false);
  // Someone else renaming it, or this rename landing, resets what the box says.
  useEffect(() => setDraft(sound.name), [sound.name]);
  const changed = draft.trim() !== sound.name;
  const check = validateSoundName(draft);

  async function rename() {
    if (!changed || !check.ok) return;
    setSaving(true);
    onError(null);
    try {
      await api.sounds.rename(server.id, sound.id, draft.trim());
    } catch (problem) {
      onError(problem instanceof ApiError ? problem.message : 'Could not rename the sound.');
      setDraft(sound.name);
    } finally {
      setSaving(false);
    }
  }

  async function play() {
    onError(null);
    try {
      await previewSound(sound.url, loudness);
    } catch {
      onError('That sound could not be played in this browser.');
    }
  }

  /** Saved when the slider is let go, not on every step of it. */
  async function saveVolume() {
    if (loudness === sound.volume) return;
    onError(null);
    try {
      await api.sounds.setVolume(server.id, sound.id, loudness);
    } catch (problem) {
      onError(problem instanceof ApiError ? problem.message : 'Could not change the volume.');
      setLoudness(sound.volume);
    }
  }

  return (
    <div className="emoji-row sound-row">
      <button type="button" className="button secondary inline" onClick={() => void play()}>
        Play
      </button>
      <span className="sound-row-name">
        {editable ? (
          <input
            value={draft}
            maxLength={LIMITS.soundName.max}
            aria-label={`Name of ${sound.name}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void rename();
              if (event.key === 'Escape') setDraft(sound.name);
            }}
          />
        ) : (
          sound.name
        )}
      </span>
      {editable ? (
        <label className="sound-row-volume" title="How loud it plays for everyone">
          <input
            type="range"
            className="voice-range"
            min={LIMITS.soundVolume.min}
            max={LIMITS.soundVolume.max}
            step={5}
            value={loudness}
            aria-label={`Volume of ${sound.name}`}
            onChange={(event) => setLoudness(Number(event.target.value))}
            onPointerUp={() => void saveVolume()}
            onKeyUp={() => void saveVolume()}
            onBlur={() => void saveVolume()}
          />
          <span>{loudness}%</span>
        </label>
      ) : null}
      <span className="sound-row-size">{kilobytes(sound.bytes)}</span>
      {editable && changed ? (
        <button
          type="button"
          className="button inline"
          disabled={saving || !check.ok}
          title={check.ok ? undefined : check.error}
          onClick={() => void rename()}
        >
          Save
        </button>
      ) : null}
      {editable ? (
        <button type="button" className="button secondary inline" disabled={busy || saving} onClick={onRemove}>
          Remove
        </button>
      ) : null}
    </div>
  );
}

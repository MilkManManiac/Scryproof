/**
 * The server's soundboard: upload, rename, remove, and play to hear one.
 *
 * Laid out like the Emoji page beside it. The list comes from the store, which
 * holds what arrived with the server and refreshes on the gateway's
 * `sounds_changed`, so two people editing at once see each other's work.
 *
 * The length rule is checked here, by decoding the file, because the server
 * does not decode audio. The server checks the size and the type again and
 * decides; the checks here only save a pointless upload.
 */

import { useEffect, useState } from 'react';
import { LIMITS, Permission, validateSoundName } from '@scryproof/shared';
import type { ServerDetail, Sound } from '@scryproof/shared';

import { ApiError, api } from '../../lib/api';
import { SOUND_ACCEPT, SoundFileError, prepareSound, previewSound } from '../../lib/sounds';
import type { Authority } from './authority';

const kilobytes = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function SoundsPane({ server, authority }: { server: ServerDetail; authority: Authority }) {
  const editable = authority.can(Permission.MANAGE_SERVER);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounting the file input is the only way to clear what it shows.
  const [inputKey, setInputKey] = useState(0);

  const sounds = server.sounds ?? [];
  const full = sounds.length >= LIMITS.soundsPerServer;
  const check = name === '' ? null : validateSoundName(name);
  const ready = editable && !busy && !full && file !== null && check?.ok === true;

  async function add() {
    if (!file || !check?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const clip = await prepareSound(file);
      await api.sounds.add(server.id, name.trim(), clip);
      // The gateway event brings the new list, so nothing is set here.
      setName('');
      setFile(null);
      setInputKey((key) => key + 1);
    } catch (problem) {
      if (problem instanceof SoundFileError) setError(problem.message);
      else setError(problem instanceof ApiError ? problem.message : 'Could not add the sound.');
    } finally {
      setBusy(false);
    }
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

  function chooseFile(chosen: File | null) {
    setFile(chosen);
    // Most people want the tile to say what the file was called.
    if (chosen && name === '') {
      setName(chosen.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.soundName.max));
    }
  }

  return (
    <>
      <h2 className="settings-heading">Sounds</h2>
      {error ? <div className="error">{error}</div> : null}

      <p className="settings-note">
        Anyone in a call in this server can play these for everyone else in the call, from the
        speaker button beside mute. {sounds.length} of {LIMITS.soundsPerServer} used.
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
            <p className="settings-note">
              This server is holding as many sounds as it can. Remove one to add another.
            </p>
          ) : (
            <div className="emoji-add">
              <div className="field">
                <label htmlFor="sound-file">Sound</label>
                <input
                  key={inputKey}
                  id="sound-file"
                  type="file"
                  accept={SOUND_ACCEPT}
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                />
                <p className="field-note">
                  WebM, Ogg or MP3, up to {LIMITS.soundSeconds} seconds and{' '}
                  {Math.round(LIMITS.soundBytes / 1024 / 1024)} MB.
                </p>
              </div>

              <div className="field">
                <label htmlFor="sound-name">Name</label>
                <input
                  id="sound-name"
                  value={name}
                  maxLength={LIMITS.soundName.max}
                  placeholder="Airhorn"
                  onChange={(event) => setName(event.target.value)}
                />
                {check && !check.ok ? <p className="field-note">{check.error}</p> : null}
              </div>

              <button type="button" className="button inline" disabled={!ready} onClick={() => void add()}>
                {busy ? 'Adding' : 'Add'}
              </button>
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
      await previewSound(sound.url);
    } catch {
      onError('That sound could not be played in this browser.');
    }
  }

  return (
    <div className="emoji-row">
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

/**
 * The soundboard in a call: the server's sounds as a grid of tiles, and one
 * click plays it for everyone in the call and for you.
 *
 * Laid out like the board of faces (`Spawner.tsx`), with names in place of
 * faces. Playing goes through the call session, which puts the clip on its own
 * encrypted track; nothing here touches media or keys.
 *
 * The slider at the top is how loud everyone's soundboard is for you, down
 * to off: Discord's soundboard volume (Wes, 2026-09-25).
 *
 * Someone who can manage the server can add a sound from here too, without
 * leaving the call for Server settings (Wes, 2026-09-25). The last tile picks
 * a file; a name box and Add take its place until it is sent. The same checks
 * as the Sounds page run first, and the server checks again and decides.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LIMITS, Permission, validateSoundName } from '@scryproof/shared';
import type { ServerDetail } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { SOUND_ACCEPT, SoundFileError, prepareSound } from '../lib/sounds';
import { canOnServer } from '../lib/usePermissions';
import { voicePrefs } from '../lib/voice-prefs';
import { useStore } from '../state/store';
import { VoiceGlyph } from './glyphs';

export function SoundBoard({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const { voice, state } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const loudness = useSyncExternalStore(voicePrefs.subscribe, () => voicePrefs.get().soundboardVolume);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const timer = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const list = server.sounds ?? [];
  const manages = server.ownerId === state.user?.id || canOnServer(server, Permission.MANAGE_SERVER);
  const room = list.length < LIMITS.soundsPerServer;
  const check = name.trim() === '' ? null : validateSoundName(name);

  function choose(chosen: File | null) {
    setError(null);
    setFile(chosen);
    // The tile should say what the file was called unless told otherwise.
    setName(chosen ? chosen.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.soundName.max) : '');
    if (picker.current) picker.current.value = '';
  }

  async function add() {
    if (!file || !check?.ok) return;
    setAdding(true);
    setError(null);
    try {
      const clip = await prepareSound(file);
      await api.sounds.add(server.id, name.trim(), clip);
      // The gateway's sounds_changed brings the new tile.
      choose(null);
    } catch (problem) {
      if (problem instanceof SoundFileError) setError(problem.message);
      else setError(problem instanceof ApiError ? problem.message : 'Could not add the sound.');
    } finally {
      setAdding(false);
    }
  }

  async function play(soundId: string, url: string) {
    setError(null);
    setLoading(soundId);
    const result = await voice.playSound(url);
    setLoading((current) => (current === soundId ? null : current));
    if (!result.ok) setError(result.reason);
  }

  return (
    <div className="spawner soundboard" ref={box} role="dialog" aria-label="Play a sound into the call">
      <div className="spawner-title">Play into the call</div>
      {/* What this device hears of every soundboard, Discord's slider. Same setting as Voice settings. */}
      <label
        className="soundboard-volume"
        title="How loud soundboard sounds are for you. All the way down turns them off."
      >
        <span>Volume</span>
        <input
          type="range"
          className="voice-range"
          min={0}
          max={100}
          step={5}
          value={Math.round(loudness * 100)}
          onChange={(event) =>
            voicePrefs.set({
              soundboardVolume: Number(event.target.value) / 100,
            })
          }
          aria-label="Volume of soundboard sounds"
        />
        <span className="soundboard-volume-number">{loudness === 0 ? 'Off' : `${Math.round(loudness * 100)}%`}</span>
      </label>
      {error ? <div className="soundboard-error">{error}</div> : null}
      {list.length === 0 && !manages ? (
        <p className="soundboard-empty">
          {server.name} has no sounds yet. Someone who can manage the server adds them in Server settings, under Sounds.
        </p>
      ) : (
        <div className="spawner-grid">
          {list.map((sound) => (
            <button
              key={sound.id}
              type="button"
              className={loading === sound.id ? 'spawner-tile soundboard-tile loading' : 'spawner-tile soundboard-tile'}
              title={`Play "${sound.name}" for everyone in the call`}
              onClick={() => void play(sound.id, sound.url)}
            >
              <span className="soundboard-mark">
                <VoiceGlyph />
              </span>
              <span className="spawner-name">{sound.name}</span>
            </button>
          ))}
          {manages && room && !file ? (
            <button
              type="button"
              className="spawner-tile soundboard-tile soundboard-add"
              title={`Add a sound to ${server.name}`}
              onClick={() => picker.current?.click()}
            >
              <span className="soundboard-mark">+</span>
              <span className="spawner-name">Add sound</span>
            </button>
          ) : null}
        </div>
      )}
      {manages ? (
        <input
          ref={picker}
          type="file"
          accept={SOUND_ACCEPT}
          hidden
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
      ) : null}
      {file ? (
        <form
          className="soundboard-new"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            value={name}
            autoFocus
            maxLength={LIMITS.soundName.max}
            aria-label="Name of the new sound"
            placeholder="Airhorn"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Escape here drops the new sound, not the whole board.
              if (event.key === 'Escape') {
                event.stopPropagation();
                choose(null);
              }
            }}
          />
          <button type="submit" className="button inline" disabled={adding || !check?.ok}>
            {adding ? 'Adding' : 'Add'}
          </button>
          <button type="button" className="button secondary inline" disabled={adding} onClick={() => choose(null)}>
            Cancel
          </button>
          {check && !check.ok ? <p className="soundboard-note">{check.error}</p> : null}
          {check && !check.ok ? null : (
            <p className="soundboard-note">
              Up to {LIMITS.soundSeconds} seconds. Everyone in {server.name} can play it.
            </p>
          )}
        </form>
      ) : null}
    </div>
  );
}

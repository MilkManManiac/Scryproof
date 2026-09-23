/**
 * The soundboard in a call: the server's sounds as a grid of tiles, and one
 * click plays it for everyone in the call and for you.
 *
 * Laid out like the board of faces (`Spawner.tsx`), with names in place of
 * faces. Playing goes through the call session, which puts the clip on its own
 * encrypted track; nothing here touches media or keys.
 */

import { useEffect, useRef, useState } from 'react';
import type { ServerDetail } from '@scryproof/shared';

import { useStore } from '../state/store';
import { VoiceGlyph } from './glyphs';

export function SoundBoard({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const { voice } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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
      {error ? <div className="soundboard-error">{error}</div> : null}
      {list.length === 0 ? (
        <p className="soundboard-empty">
          {server.name} has no sounds yet. Someone who can manage the server adds them in Server
          settings, under Sounds.
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
        </div>
      )}
    </div>
  );
}

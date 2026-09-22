/**
 * The board of faces: every character, one click sends its jump.
 *
 * Wes, 2026-09-22: "it can kinda work like a soundboard where you open a
 * panel and can click which one you want to spawn." Same thing as typing
 * `/tang-jump`; this is for people who would rather look than remember.
 * Each tile shows the first frame of the sheet and the name under it.
 */

import { useEffect, useRef } from 'react';

import { CHARACTERS, sheetUrl, spawnCommand } from '../lib/commands';

export function Spawner({ onPick, onClose }: { onPick: (command: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

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

  return (
    <div className="spawner" ref={box} role="dialog" aria-label="Send a character across the room">
      <div className="spawner-title">Send one across the room</div>
      <div className="spawner-grid">
        {CHARACTERS.map((character) => (
          <button
            key={character.id}
            type="button"
            className="spawner-tile"
            title={spawnCommand(character)}
            onClick={() => onPick(spawnCommand(character))}
          >
            <span
              className="meepo-face"
              style={{ backgroundImage: `url(${sheetUrl(character.id)})`, backgroundSize: 'auto 100%' }}
            />
            <span className="spawner-name">{character.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

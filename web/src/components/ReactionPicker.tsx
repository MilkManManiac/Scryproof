/**
 * The emoji to react with.
 *
 * A short, chosen list rather than all 3,600: the ones people actually use to
 * answer a message, and a row for the table, because this is where a D&D group
 * lives. Whatever you use floats to the front, so after a week it is your list.
 * Kept in this browser only.
 */

import { useEffect, useRef, useState } from 'react';

const EVERYDAY = [
  '👍', '👎', '❤️', '😂', '😭', '😮', '😬', '🤔',
  '🙏', '🔥', '💀', '👀', '🎉', '✅', '❌', '💯',
  '😅', '🥲', '😤', '🫡', '🤝', '👏', '🙃', '😴',
];
const TABLE = ['🎲', '⚔️', '🛡️', '🐉', '🧙', '🗺️', '🏹', '🍺'];

const STORAGE_KEY = 'gooffline.reactions.recent.v1';

function recent(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberReaction(emoji: string): void {
  try {
    const next = [emoji, ...recent().filter((entry) => entry !== emoji)].slice(0, 8);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage. The order just does not stick.
  }
}

export function ReactionPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [mine] = useState(recent);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // On the next tick, or the click that opened this would close it.
    const timer = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const used = new Set(mine);
  const rows = [mine, EVERYDAY.filter((emoji) => !used.has(emoji)), TABLE.filter((emoji) => !used.has(emoji))];

  return (
    <div className="reaction-picker" ref={box} role="dialog" aria-label="Pick a reaction">
      {rows
        .filter((row) => row.length > 0)
        .map((row, index) => (
          <div className="reaction-picker-row" key={index}>
            {row.map((emoji) => (
              <button key={emoji} type="button" className="reaction-picker-emoji" onClick={() => onPick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

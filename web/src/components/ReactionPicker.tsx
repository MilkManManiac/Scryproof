/**
 * The emoji to react with.
 *
 * A short, chosen list rather than all 3,600: the ones people actually use to
 * answer a message, and a row for the table, because this is where a D&D group
 * lives. Whatever you use floats to the front, so after a week it is your list.
 * Kept in this browser only.
 *
 * The server's own emoji sit in a row above all that. They are picked as the
 * `:name:` the reaction is stored as, which is the same string a message body
 * carries, so there is one representation of a custom emoji everywhere.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { emojiToken, isEmojiToken } from '@scryproof/shared';
import type { Emoji } from '@scryproof/shared';
import { emojiSearchScore, searchShortcodes } from '../lib/emoji';

const EVERYDAY = [
  '👍', '👎', '❤️', '😂', '😭', '😮', '😬', '🤔',
  '🙏', '🔥', '💀', '👀', '🎉', '✅', '❌', '💯',
  '😅', '🥲', '😤', '🫡', '🤝', '👏', '🙃', '😴',
];
const TABLE = ['🎲', '⚔️', '🛡️', '🐉', '🧙', '🗺️', '🏹', '🍺'];

const STORAGE_KEY = 'scryproof.reactions.recent.v1';

const SEARCH_LIMIT = 48;

/** One row in the search grid: either a server's own emoji or a `SHORTCODES` entry. */
interface Hit {
  name: string;
  pick: string;
  render: React.ReactNode;
}

/** Every match for `query`, server emoji and `SHORTCODES` together, best first. */
function searchHits(query: string, emojis: Emoji[]): Hit[] {
  const custom = emojis
    .map((emoji) => ({ emoji, score: emojiSearchScore(emoji.name, query) }))
    .filter((entry): entry is { emoji: Emoji; score: 0 | 1 } => entry.score !== null)
    .map(({ emoji, score }) => ({
      name: emoji.name,
      pick: emojiToken(emoji.name),
      score,
      render: <img className="custom-emoji" src={emoji.url} alt={`:${emoji.name}:`} loading="lazy" />,
    }));
  const unicode = searchShortcodes(query, SEARCH_LIMIT).map((offer) => ({
    name: offer.name,
    pick: offer.emoji,
    score: emojiSearchScore(offer.name, query) ?? 1,
    render: offer.emoji,
  }));
  return [...custom, ...unicode]
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, SEARCH_LIMIT);
}

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

export function ReactionPicker({
  emojis = [],
  onPick,
  onClose,
  place = 'below-right',
  label = 'Pick a reaction',
}: {
  /** The server's own emoji, offered above the built-in rows. */
  emojis?: Emoji[];
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Which corner of its parent it hangs from. */
  place?: 'below-right' | 'below-left' | 'above-right';
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [mine] = useState(recent);
  const [query, setQuery] = useState('');

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

  // Focused as soon as the picker opens, so typing works without a click.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const trimmed = query.trim();
  const hits = useMemo(() => (trimmed ? searchHits(trimmed, emojis) : []), [trimmed, emojis]);

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Clear first; a second Escape (with the box already empty) reaches
      // the window listener above and closes the picker.
      if (query) {
        event.stopPropagation();
        setQuery('');
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = hits[0];
      if (first) onPick(first.pick);
    }
  }

  // A remembered `:name:` is left out of the recent row rather than drawn
  // there as literal text: the server's own row above already has it, and
  // recents are stored per browser so one can outlive the emoji it names.
  const recentUnicode = mine.filter((emoji) => !isEmojiToken(emoji));
  const used = new Set(recentUnicode);
  const rows = [
    recentUnicode,
    EVERYDAY.filter((emoji) => !used.has(emoji)),
    TABLE.filter((emoji) => !used.has(emoji)),
  ];

  return (
    <div className={`reaction-picker ${place}`} ref={box} role="dialog" aria-label={label}>
      <input
        ref={input}
        type="search"
        className="reaction-picker-search"
        placeholder="Search emoji"
        aria-label="Search emoji"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onSearchKeyDown}
      />

      {trimmed ? (
        <div className="reaction-picker-row reaction-picker-search-results">
          {hits.map((hit) => (
            <button
              key={hit.name}
              type="button"
              className="reaction-picker-emoji"
              title={`:${hit.name}:`}
              onClick={() => onPick(hit.pick)}
            >
              {hit.render}
            </button>
          ))}
          {hits.length === 0 ? <div className="reaction-picker-no-results">No emoji named that</div> : null}
        </div>
      ) : (
        <>
          {emojis.length > 0 ? (
            <div className="reaction-picker-group">
              <div className="reaction-picker-label">This server</div>
              <div className="reaction-picker-row">
                {emojis.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    className="reaction-picker-emoji"
                    title={`:${emoji.name}:`}
                    onClick={() => onPick(emojiToken(emoji.name))}
                  >
                    <img className="custom-emoji" src={emoji.url} alt={`:${emoji.name}:`} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
        </>
      )}
    </div>
  );
}

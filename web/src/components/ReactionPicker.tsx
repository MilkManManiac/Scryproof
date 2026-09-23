/**
 * The emoji picker: for reactions, and for the smiley beside Send.
 *
 * Every standard emoji in one scrolling grid, a sticky heading per category
 * and a row of tabs that jumps between them, the way Discord does it. What
 * you used last sits at the top, then the server's own emoji, then Unicode's
 * categories. Wes, 2026-09-23: "Most people don't want to just type to find
 * one." The search box is still there and still has the focus when it opens.
 *
 * About 1,900 emoji is a lot of buttons, so three things keep opening it
 * instant: only the first category is rendered on the first frame and the
 * rest on the next; each block of the grid has `content-visibility: auto`,
 * so the browser does not lay out or draw emoji nobody has scrolled to; and
 * clicks and hovers are handled once on the grid rather than per button.
 *
 * The server's own emoji are picked as the `:name:` the reaction is stored
 * as, which is the same string a message body carries, so there is one
 * representation of a custom emoji everywhere. Recents and the skin tone are
 * kept in this browser only.
 */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { emojiToken, isEmojiToken } from '@scryproof/shared';
import type { Emoji } from '@scryproof/shared';
import { emojiCatalog, emojiSearchScore, searchEmoji, withTone } from '../lib/emoji';
import type { SkinTone } from '../lib/emoji';

const STORAGE_KEY = 'scryproof.reactions.recent.v1';
const TONE_KEY = 'scryproof.emoji.tone.v1';

/** Two rows of the grid. */
const RECENT_LIMIT = 18;
const SEARCH_LIMIT = 200;
/** Emoji per block of the grid; each block is skipped by the browser while off screen. */
const BLOCK = 90;
/** One grid square, in pixels, for the height a block reserves before it is drawn. */
const CELL = 36;
const COLUMNS = 9;

/** The tab for each category: a plain emoji, drawn by the system font like the rest. */
const TAB_ICON: Record<string, string> = {
  recent: '🕘',
  server: '⭐',
  people: '😀',
  nature: '🐻',
  food: '🍔',
  activities: '⚽',
  travel: '✈️',
  objects: '💡',
  symbols: '🔣',
  flags: '🏁',
};

/** The hand that shows which skin tone is chosen, and the five to choose from. */
const TONE_HANDS = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];
const TONE_NAMES = ['Default', 'Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'];

/** One square in the grid. `src` is set for a server's own emoji. */
interface Cell {
  pick: string;
  name: string;
  src?: string;
}

interface Section {
  id: string;
  label: string;
  cells: Cell[];
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
    const next = [emoji, ...recent().filter((entry) => entry !== emoji)].slice(0, RECENT_LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage. The order just does not stick.
  }
}

function storedTone(): SkinTone {
  try {
    const value = Number(localStorage.getItem(TONE_KEY));
    return value >= 0 && value <= 5 && Number.isInteger(value) ? (value as SkinTone) : 0;
  } catch {
    return 0;
  }
}

function saveTone(tone: SkinTone): void {
  try {
    localStorage.setItem(TONE_KEY, String(tone));
  } catch {
    // Same as recents: it just does not stick.
  }
}

/**
 * The name to show for something picked before, which may be a toned
 * variant: found through its base emoji so the footer can still name it.
 */
function nameOf(pick: string): string {
  for (const group of emojiCatalog()) {
    for (const entry of group.emoji) {
      if (entry.emoji === pick || entry.tones?.includes(pick)) return entry.name;
    }
  }
  return '';
}

/** Every match for `query`, server emoji and standard ones together, best first. */
function searchCells(query: string, emojis: Emoji[], tone: SkinTone): Cell[] {
  // A server emoji's 0 or 1 lines up with the standard scale's 0 (starts
  // with) and 2 (contains), so the two lists interleave fairly.
  const custom = emojis
    .map((emoji) => ({ emoji, score: emojiSearchScore(emoji.name, query) }))
    .filter((entry): entry is { emoji: Emoji; score: 0 | 1 } => entry.score !== null)
    .map(({ emoji, score }) => ({
      cell: { pick: emojiToken(emoji.name), name: emoji.name, src: emoji.url },
      score: score * 2,
      length: emoji.name.length,
    }))
    .sort((a, b) => a.score - b.score || a.length - b.length);
  const standard = searchEmoji(query, SEARCH_LIMIT).map(({ entry, score }) => ({
    cell: { pick: withTone(entry, tone), name: entry.name },
    score,
  }));
  // A stable sort on the score alone: the server's own come first among
  // equals, and standard emoji keep the order `searchEmoji` gave them.
  return [...custom, ...standard]
    .sort((a, b) => a.score - b.score)
    .slice(0, SEARCH_LIMIT)
    .map(({ cell }) => cell);
}

/**
 * The grid squares for `cells`, in blocks the browser can skip while off
 * screen. Memoized on the `cells` array, so moving the pointer (which
 * changes the footer) does not re-render two thousand buttons.
 */
const Grid = memo(function Grid({ cells }: { cells: Cell[] }) {
  const blocks: Cell[][] = [];
  for (let at = 0; at < cells.length; at += BLOCK) blocks.push(cells.slice(at, at + BLOCK));
  return (
    <>
      {blocks.map((block, index) => (
        <div
          key={index}
          className="emoji-grid"
          style={{ containIntrinsicSize: `auto ${Math.ceil(block.length / COLUMNS) * CELL}px` }}
        >
          {block.map((cell) => (
            <button
              key={cell.pick}
              type="button"
              className="reaction-picker-emoji"
              data-pick={cell.pick}
              aria-label={`:${cell.name}:`}
            >
              {cell.src ? <img className="custom-emoji" src={cell.src} alt="" loading="lazy" /> : cell.pick}
            </button>
          ))}
        </div>
      ))}
    </>
  );
});

export function ReactionPicker({
  emojis = [],
  onPick,
  onClose,
  place = 'below-right',
  label = 'Pick a reaction',
}: {
  /** The server's own emoji, offered above the standard ones. */
  emojis?: Emoji[];
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Which corner of its parent it hangs from. */
  place?: 'below-right' | 'below-left' | 'above-right';
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [mine] = useState(recent);
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState<SkinTone>(storedTone);
  const [choosingTone, setChoosingTone] = useState(false);
  const [everything, setEverything] = useState(false);
  const [active, setActive] = useState('');
  const [hover, setHover] = useState<Cell | null>(null);
  // Which way it had to turn to fit on screen; see the layout effect below.
  const [flip, setFlip] = useState('');

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
  // The rest of the categories are drawn on the frame after, so the first
  // paint is only what is on screen.
  useEffect(() => {
    input.current?.focus();
    const frame = requestAnimationFrame(() => setEverything(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The picker is taller than the old one, so on a message near the bottom
  // of the list it would hang off the end and be cut off. Measured once,
  // before it is shown: turn it up (or down, or to the other side) when the
  // side it hangs from has no room and the other side has more. "Room" is
  // the window cut down by every scrolling box it sits inside, since those
  // clip it too. On a phone it is a sheet along the bottom and never turns.
  useLayoutEffect(() => {
    const element = box.current;
    const anchor = element?.parentElement;
    if (!element || !anchor || window.matchMedia('(max-width: 640px)').matches) return;
    let top = 0;
    let bottom = window.innerHeight;
    let left = 0;
    let right = window.innerWidth;
    for (let up: HTMLElement | null = anchor; up; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const clip = up.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
      left = Math.max(left, clip.left);
      right = Math.min(right, clip.right);
    }
    const rect = element.getBoundingClientRect();
    const hung = anchor.getBoundingClientRect();
    const above = hung.top - top;
    const below = bottom - hung.bottom;
    const turns: string[] = [];
    if (place === 'above-right' && rect.top < top && below > above) turns.push('flip-down');
    if (place !== 'above-right' && rect.bottom > bottom && above > below) turns.push('flip-up');
    if (rect.left < left) turns.push('flip-left');
    else if (rect.right > right) turns.push('flip-right');
    setFlip(turns.join(' '));
  }, [place]);

  const trimmed = query.trim();
  const hits = useMemo(() => (trimmed ? searchCells(trimmed, emojis, tone) : []), [trimmed, emojis, tone]);

  const sections = useMemo<Section[]>(() => {
    const byToken = new Map(emojis.map((emoji) => [emojiToken(emoji.name), emoji]));
    // A remembered `:name:` is shown only while this server still has it:
    // recents are stored per browser, so one can outlive the emoji it names
    // or belong to another server.
    const recents: Cell[] = mine.flatMap((pick) => {
      if (!isEmojiToken(pick)) return [{ pick, name: nameOf(pick) }];
      const custom = byToken.get(pick);
      return custom ? [{ pick, name: custom.name, src: custom.url }] : [];
    });
    const list: Section[] = [];
    if (recents.length > 0) list.push({ id: 'recent', label: 'Recently used', cells: recents });
    if (emojis.length > 0) {
      list.push({
        id: 'server',
        label: 'This server',
        cells: emojis.map((emoji) => ({ pick: emojiToken(emoji.name), name: emoji.name, src: emoji.url })),
      });
    }
    for (const group of emojiCatalog()) {
      list.push({
        id: group.id,
        label: group.label,
        cells: group.emoji.map((entry) => ({ pick: withTone(entry, tone), name: entry.name })),
      });
    }
    return list;
  }, [mine, emojis, tone]);

  const firstStandard = sections.findIndex((section) => section.id === 'people');

  function sectionElement(id: string): HTMLElement | null {
    return scroller.current?.querySelector<HTMLElement>(`[data-section="${id}"]`) ?? null;
  }

  function jump(id: string) {
    setEverything(true);
    // After the render that draws every category, so the target exists.
    requestAnimationFrame(() => {
      const target = sectionElement(id);
      if (target && scroller.current) scroller.current.scrollTop = target.offsetTop;
      setActive(id);
    });
  }

  function onScroll() {
    const view = scroller.current;
    if (!view) return;
    // The last heading at or above the top of the view is the one you are in.
    let current = sections[0]?.id ?? '';
    for (const section of sections) {
      const element = sectionElement(section.id);
      if (element && element.offsetTop - view.scrollTop <= 8) current = section.id;
    }
    if (current !== active) setActive(current);
  }

  function cellFrom(event: React.SyntheticEvent): Cell | null {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    const pick = button?.dataset.pick;
    if (!pick) return null;
    const custom = isEmojiToken(pick) ? emojis.find((emoji) => emojiToken(emoji.name) === pick) : undefined;
    const name = custom?.name ?? button.getAttribute('aria-label')?.slice(1, -1) ?? '';
    return { pick, name, src: custom?.url };
  }

  // Remembered here as well as by the callers that react, so an emoji put
  // into a message counts as recently used too. Remembering twice is harmless.
  function pick(emoji: string) {
    rememberReaction(emoji);
    onPick(emoji);
  }

  function onGridClick(event: React.MouseEvent) {
    const cell = cellFrom(event);
    if (cell) pick(cell.pick);
  }

  function onGridHover(event: React.SyntheticEvent) {
    const cell = cellFrom(event);
    if (cell && cell.pick !== hover?.pick) setHover(cell);
  }

  function chooseTone(next: SkinTone) {
    setTone(next);
    saveTone(next);
    setChoosingTone(false);
    input.current?.focus();
  }

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
      if (first) pick(first.pick);
    }
  }

  // The footer shows what the pointer is on; while searching with nothing
  // under the pointer, the first hit, which is what Enter picks.
  const shown = hover ?? (trimmed ? (hits[0] ?? null) : null);
  const current = active || sections[0]?.id;

  return (
    <div className={`reaction-picker ${place} ${flip}`} ref={box} role="dialog" aria-label={label}>
      <div className="emoji-picker-top">
        <input
          ref={input}
          type="search"
          className="reaction-picker-search"
          placeholder="Search emoji"
          aria-label="Search emoji"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHover(null);
            if (scroller.current) scroller.current.scrollTop = 0;
          }}
          onKeyDown={onSearchKeyDown}
        />
        <button
          type="button"
          className="emoji-tone-button"
          title={`Skin tone: ${TONE_NAMES[tone]}`}
          aria-expanded={choosingTone}
          onClick={() => setChoosingTone((open) => !open)}
        >
          {TONE_HANDS[tone]}
        </button>
        {choosingTone ? (
          <div className="emoji-tone-choices" role="menu" aria-label="Skin tone">
            {TONE_HANDS.map((hand, index) => (
              <button
                key={hand}
                type="button"
                role="menuitemradio"
                aria-checked={index === tone}
                className={index === tone ? 'reaction-picker-emoji on' : 'reaction-picker-emoji'}
                title={TONE_NAMES[index]}
                onClick={() => chooseTone(index as SkinTone)}
              >
                {hand}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {trimmed ? null : (
        <nav className="emoji-tabs" aria-label="Emoji categories">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={section.id === current ? 'emoji-tab on' : 'emoji-tab'}
              title={section.label}
              aria-label={section.label}
              aria-current={section.id === current ? 'true' : undefined}
              onClick={() => jump(section.id)}
            >
              {section.id === 'server' && emojis[0] ? (
                <img className="custom-emoji" src={emojis[0].url} alt="" />
              ) : (
                TAB_ICON[section.id]
              )}
            </button>
          ))}
        </nav>
      )}

      <div
        className="emoji-scroll"
        ref={scroller}
        onScroll={trimmed ? undefined : onScroll}
        onClick={onGridClick}
        onMouseOver={onGridHover}
        onFocus={onGridHover}
        onMouseLeave={() => setHover(null)}
      >
        {trimmed ? (
          hits.length > 0 ? (
            <Grid cells={hits} />
          ) : (
            <div className="reaction-picker-no-results">No emoji named that</div>
          )
        ) : (
          sections.map((section, index) =>
            everything || index <= firstStandard ? (
              <section key={section.id} data-section={section.id} className="emoji-section">
                <h3 className="reaction-picker-label emoji-heading">{section.label}</h3>
                <Grid cells={section.cells} />
              </section>
            ) : null,
          )
        )}
      </div>

      <div className="emoji-footer">
        {shown ? (
          <>
            <span className="emoji-footer-big">
              {shown.src ? <img className="custom-emoji" src={shown.src} alt="" /> : shown.pick}
            </span>
            <span className="emoji-footer-name">{shown.name ? `:${shown.name}:` : ''}</span>
          </>
        ) : (
          <span className="emoji-footer-hint">{label}</span>
        )}
      </div>
    </div>
  );
}

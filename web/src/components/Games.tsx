/**
 * The games folder: one tile in the rail for every daily game (Wes,
 * 2026-09-29: "put those basically in like a folder at the top left... so
 * it doesn't get out of hand with just a shit ton of games clogging
 * everything up").
 *
 * The tile carries how many of today's you have not started. Opening it
 * lists the games, each with where you stand today; picking one opens it.
 * A new game is a new line in `GAMES`.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { BEE, BEE_RANKS, PURDLE, QUEENS, THRICE, THRICE_MAX, TRAVLE, queensClock } from '@scryproof/shared';
import { createPortal } from 'react-dom';

import { bee } from '../lib/bee';
import { cuntections } from '../lib/cuntections';
import { queens, thrice, travle } from '../lib/daily';
import { purdle } from '../lib/purdle';
import { useStore } from '../state/store';

/** Where you stand in a game today. `fresh`: not started. Null: not heard from the server yet. */
interface Standing {
  fresh: boolean;
  says: string;
  done: boolean;
}

interface Game {
  id: string;
  name: string;
  about: string;
  glyph: ReactNode;
  store: { subscribe: (listener: () => void) => () => void; get: () => { open: boolean }; load: () => Promise<void>; open: () => void };
  standing: () => Standing | null;
}

const glyph = (children: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

const GAMES: readonly Game[] = [
  {
    id: 'purdle',
    name: 'Purdle',
    about: 'Guess the word',
    glyph: glyph(
      <>
        <rect x="2" y="2" width="9" height="9" rx="2" fill="#538d4e" />
        <rect x="13" y="2" width="9" height="9" rx="2" fill="#b59f3b" />
        <rect x="2" y="13" width="9" height="9" rx="2" fill="currentColor" opacity="0.45" />
        <rect x="13" y="13" width="9" height="9" rx="2" fill="#538d4e" />
      </>,
    ),
    store: purdle,
    standing() {
      const today = purdle.get().today;
      if (!today) return null;
      const tries = today.guesses.length;
      if (today.state === 'won') return { fresh: false, done: true, says: `Got it in ${tries}` };
      if (today.state === 'lost') return { fresh: false, done: true, says: 'Missed it' };
      return { fresh: tries === 0, done: false, says: tries === 0 ? 'Not played' : `${tries} of ${PURDLE.tries} tries used` };
    },
  },
  {
    id: 'cuntections',
    name: 'Cuntections',
    about: 'Four groups of four',
    glyph: glyph(
      <>
        <rect x="2" y="2.5" width="20" height="4" rx="1.5" fill="#f9df6d" />
        <rect x="2" y="7.5" width="20" height="4" rx="1.5" fill="#a0c35a" />
        <rect x="2" y="12.5" width="20" height="4" rx="1.5" fill="#b0c4ef" />
        <rect x="2" y="17.5" width="20" height="4" rx="1.5" fill="#ba81c5" />
      </>,
    ),
    store: cuntections,
    standing() {
      const today = cuntections.get().today;
      if (!today) return null;
      const misses = `${today.mistakes} miss${today.mistakes === 1 ? '' : 'es'}`;
      if (today.state === 'won') return { fresh: false, done: true, says: today.mistakes === 0 ? 'Perfect' : `Solved, ${misses}` };
      if (today.state === 'lost') return { fresh: false, done: true, says: 'Lost' };
      const fresh = today.found.length === 0 && today.mistakes === 0;
      return { fresh, done: false, says: fresh ? 'Not played' : `${today.found.length} of 4 found, ${misses}` };
    },
  },
  {
    id: 'bee',
    name: BEE.name,
    about: 'Words from seven letters',
    glyph: glyph(<path d="M7 3.4h10L22 12l-5 8.6H7L2 12z" fill="#f7da21" />),
    store: bee,
    standing() {
      const today = bee.get().today;
      if (!today) return null;
      if (today.words.length === 0) return { fresh: true, done: false, says: 'Not played' };
      return { fresh: false, done: false, says: `${BEE_RANKS[today.rank]!.name}, ${today.score} points` };
    },
  },
  {
    id: 'queens',
    name: QUEENS.name,
    about: 'A queen in every colour, against the clock',
    glyph: glyph(
      <>
        <path d="M3 8l4.2 3.6L12 4.5l4.8 7.1L21 8l-1.8 9.5H4.8z" fill="#c9a3e6" />
        <rect x="4.8" y="18.8" width="14.4" height="2.2" rx="1.1" fill="#c9a3e6" />
      </>,
    ),
    store: queens,
    standing() {
      const today = queens.get().today;
      if (!today) return null;
      if (today.state === 'done') return { fresh: false, done: true, says: `Solved in ${queensClock(today.seconds ?? 0)}` };
      if (today.state === 'playing') return { fresh: false, done: false, says: 'Your clock is running' };
      return { fresh: true, done: false, says: 'Not played' };
    },
  },
  {
    id: 'travle',
    name: TRAVLE.name,
    about: 'One country to another, by land',
    glyph: glyph(
      <>
        <circle cx="12" cy="12" r="9" fill="none" stroke="#6fb3d9" strokeWidth="2" />
        <path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18" fill="none" stroke="#6fb3d9" strokeWidth="1.6" />
      </>,
    ),
    store: travle,
    standing() {
      const today = travle.get().today;
      if (!today) return null;
      const said = today.guesses.length;
      const extra = said - today.between;
      if (today.state === 'won') return { fresh: false, done: true, says: extra === 0 ? 'Perfect' : `Made it, +${extra}` };
      if (today.state === 'lost') return { fresh: false, done: true, says: 'Lost on the way' };
      return { fresh: said === 0, done: false, says: said === 0 ? 'Not played' : `${today.allowed - said} guesses left` };
    },
  },
  {
    id: 'thrice',
    name: THRICE.name,
    about: 'Five questions, three clues each',
    glyph: glyph(
      <>
        <circle cx="6" cy="12" r="3.6" fill="#e8835a" />
        <circle cx="12" cy="12" r="3.6" fill="#e8835a" opacity="0.7" />
        <circle cx="18" cy="12" r="3.6" fill="#e8835a" opacity="0.4" />
      </>,
    ),
    store: thrice,
    standing() {
      const today = thrice.get().today;
      if (!today) return null;
      if (today.state === 'done') return { fresh: false, done: true, says: `${today.score} of ${THRICE_MAX}` };
      const closed = today.questions.filter((question) => question.points !== null).length;
      const fresh = closed === 0 && (today.questions[0]?.tries.length ?? 0) === 0;
      return { fresh, done: false, says: fresh ? 'Not played' : `On question ${Math.min(closed + 1, THRICE.questions)} of ${THRICE.questions}` };
    },
  },
];

/** Every game's state, as one thing to subscribe to. */
function subscribeAll(listener: () => void): () => void {
  const stops = GAMES.map((game) => game.store.subscribe(listener));
  return () => stops.forEach((stop) => stop());
}
let stamp = 0;
let last: unknown[] = [];
/** A number that changes whenever any game's state does. */
function snapshotAll(): number {
  const now = GAMES.map((game) => game.store.get());
  if (now.some((view, at) => view !== last[at])) {
    last = now;
    stamp += 1;
  }
  return stamp;
}

export function GamesButton() {
  useSyncExternalStore(subscribeAll, snapshotAll);
  const { state } = useStore();
  const signedIn = Boolean(state.user);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (signedIn) for (const game of GAMES) void game.store.load();
  }, [signedIn]);

  // Beside the tile, and never off the bottom of the window.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const tile = button.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight ?? 0;
    setPlace({ left: tile.right + 12, top: Math.max(8, Math.min(tile.top, window.innerHeight - height - 8)) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const standings = GAMES.map((game) => game.standing());
  const fresh = standings.filter((standing) => standing?.fresh).length;
  const playing = GAMES.some((game) => game.store.get().open);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`rail-item rail-games${open || playing ? ' active' : ''}`}
        title={fresh > 0 ? `Games: ${fresh} of today's not played` : 'Games'}
        aria-label="Games"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="2" width="9" height="9" rx="2.5" fill="#538d4e" />
          <rect x="13" y="2" width="9" height="9" rx="2.5" fill="#f7da21" />
          <rect x="2" y="13" width="9" height="9" rx="2.5" fill="#ba81c5" />
          <rect x="13" y="13" width="9" height="9" rx="2.5" fill="#6fb3d9" />
        </svg>
        {fresh > 0 ? <span className="badge rail-games-badge">{fresh}</span> : null}
      </button>
      {open
        ? createPortal(
            <div
              ref={menu}
              className="games-menu"
              role="menu"
              aria-label="Games"
              style={place ? { left: place.left, top: place.top } : { visibility: 'hidden' }}
            >
              <div className="games-menu-head">
                <span>Games</span>
                <span className="games-menu-sub">New ones at midnight Eastern</span>
              </div>
              {GAMES.map((game, at) => {
                const standing = standings[at];
                return (
                  <button
                    key={game.id}
                    type="button"
                    role="menuitem"
                    className="games-menu-item"
                    onClick={() => {
                      setOpen(false);
                      game.store.open();
                    }}
                  >
                    <span className="games-menu-glyph">{game.glyph}</span>
                    <span className="games-menu-text">
                      <span className="games-menu-name">{game.name}</span>
                      <span className="games-menu-about">{game.about}</span>
                    </span>
                    <span className={`games-menu-standing${standing?.fresh ? ' fresh' : standing?.done ? ' done' : ''}`}>
                      {standing?.says ?? ''}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

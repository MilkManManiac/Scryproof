/**
 * Purdle: Wordle, one word a day for everyone here (Wes, 2026-09-27). Opened
 * from the tile under the bell in the rail.
 *
 * It plays like Wordle on purpose, because that is the ask and everybody
 * already knows how: six rows, green for right place, yellow for right letter,
 * letters flip over one at a time, a shake for a word it does not know, and
 * the grid of squares to share. The Scryproof part is underneath: the server
 * holds the word and marks each guess, and each server shows who has done
 * today's and in how many (never the letters), live as they finish.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PURDLE, PURDLE_PRAISE, purdleShare } from '@scryproof/shared';
import type { PurdleFinish, PurdleMark, PurdleStanding, PurdleToday } from '@scryproof/shared';
import { createPortal } from 'react-dom';

import { ApiError, api } from '../lib/api';
import { useLayer } from '../lib/back';
import { channelDrafts } from '../lib/drafts';
import { nameOf } from '../lib/mentions';
import { purdle } from '../lib/purdle';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { GameBoard, average } from './GameBoard';

/** How long each tile takes to turn over, and the gap before the next starts. */
const FLIP_MS = 500;
const STAGGER_MS = 300;
const REVEAL_MS = STAGGER_MS * (PURDLE.length - 1) + FLIP_MS;

const ROWS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
const RANK: Record<PurdleMark, number> = { miss: 0, near: 1, hit: 2 };

export function PurdleGate() {
  const view = useSyncExternalStore(purdle.subscribe, purdle.get);
  return view.open ? <Purdle today={view.today} /> : null;
}

function Purdle({ today }: { today: PurdleToday | null }) {
  const { state } = useStore();
  const dms = useDms();
  const [typed, setTyped] = useState('');
  const [words, setWords] = useState<Set<string> | null>(null);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<{ text: string; long: boolean } | null>(null);
  /** The row turning over right now, and until it has, the keyboard keeps its old colours. */
  const [revealing, setRevealing] = useState<number | null>(null);
  const [winning, setWinning] = useState(false);
  /** A beat after the last row turns over, for the bounce or the answer, before the result slides in. */
  const [pausing, setPausing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayer(purdle.close);

  // The list of words is 50 KB, so it comes when the game opens, not with the app.
  useEffect(() => {
    let live = true;
    void import('@scryproof/shared/purdle-words').then(({ purdleWords }) => {
      if (live) setWords(purdleWords());
    });
    return () => {
      live = false;
    };
  }, []);

  const say = useCallback((text: string, long = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, long });
    toastTimer.current = setTimeout(() => setToast(null), long ? 4000 : 1400);
  }, []);

  const shake = useCallback((text: string) => {
    setShaking(true);
    say(text);
    setTimeout(() => setShaking(false), 600);
  }, [say]);

  const guesses = today?.guesses ?? [];
  const playing = today?.state === 'playing';
  const settled = revealing === null;

  async function submit() {
    if (!today || !playing || busy || !settled) return;
    if (typed.length < PURDLE.length) return shake('Not enough letters');
    if (words && !words.has(typed)) return shake('Not in the word list');
    setBusy(true);
    try {
      const next = await api.purdle.guess(typed);
      const row = next.guesses.length - 1;
      setTyped('');
      setRevealing(row);
      purdle.apply(next);
      if (next.state !== 'playing') setPausing(true);
      setTimeout(() => {
        setRevealing(null);
        if (next.state !== 'playing') setTimeout(() => setPausing(false), 1600);
        if (next.state === 'won') {
          setWinning(true);
          say(PURDLE_PRAISE[row] ?? 'Got it');
        } else if (next.state === 'lost') {
          say((next.answer ?? '').toUpperCase(), true);
        }
      }, REVEAL_MS);
    } catch (problem) {
      shake(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const press = (key: string) => {
    if (!playing || !settled) return;
    if (key === 'enter') return void submit();
    if (key === 'back') return setTyped((now) => now.slice(0, -1));
    if (/^[a-z]$/.test(key)) setTyped((now) => (now.length < PURDLE.length ? now + key : now));
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') return purdle.close();
      const key = event.key === 'Enter' ? 'enter' : event.key === 'Backspace' ? 'back' : event.key.toLowerCase();
      if (key === 'enter' || key === 'back' || /^[a-z]$/.test(key)) {
        event.preventDefault();
        pressRef.current(key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keys take their colour once the tiles showing it have turned over.
  const keys = useMemo(() => {
    const best = new Map<string, PurdleMark>();
    const shown = revealing === null ? guesses : guesses.slice(0, revealing);
    for (const guess of shown) {
      guess.word.split('').forEach((letter, at) => {
        const mark = guess.marks[at]!;
        const before = best.get(letter);
        if (!before || RANK[mark] > RANK[before]) best.set(letter, mark);
      });
    }
    return best;
  }, [guesses, revealing]);

  // Where "Put in chat" would put it: the text channel open behind the game.
  const server = state.selectedServerId ? state.servers[state.selectedServerId] : undefined;
  const channel = !dms.state.active && server ? server.channels.find((entry) => entry.id === state.selectedChannelId) : undefined;
  const chatChannel = channel?.type === 'text' ? channel : undefined;
  const boardServer = server ?? (state.serverOrder[0] ? state.servers[state.serverOrder[0]] : undefined);

  const over = today !== null && !playing && settled && !pausing;
  const share = today && over ? purdleShare(today.day, guesses.map((guess) => guess.marks), today.state === 'won') : '';

  return createPortal(
    <div className="purdle-backdrop" role="presentation" onMouseDown={() => purdle.close()}>
      <div className={over ? 'purdle done' : 'purdle'} role="dialog" aria-modal="true" aria-label="Purdle" onMouseDown={(event) => event.stopPropagation()}>
        <header className="purdle-head">
          <div className="purdle-title">
            Purdle{today ? <span className="purdle-number">#{today.day}</span> : null}
          </div>
          <button type="button" className="icon-button purdle-close" aria-label="Close" title="Close" onClick={() => purdle.close()}>
            &#10005;
          </button>
        </header>

        {toast ? (
          <div className={toast.long ? 'purdle-toast long' : 'purdle-toast'} role="status">
            {toast.text}
          </div>
        ) : null}

        {today === null ? (
          <div className="purdle-loading">
            <div className="spinner" />
          </div>
        ) : (
          <>
            <div className="purdle-grid" aria-label="Your guesses">
              {Array.from({ length: PURDLE.tries }, (_, row) => {
                const guess = guesses[row];
                const current = !guess && row === guesses.length && playing;
                const classes = ['purdle-row'];
                if (current && shaking) classes.push('shake');
                if (guess && row === revealing) classes.push('flipping');
                if (winning && guess && today.state === 'won' && row === guesses.length - 1) classes.push('winning');
                return (
                  <div className={classes.join(' ')} key={row}>
                    {Array.from({ length: PURDLE.length }, (_, at) => {
                      const letter = guess ? guess.word[at] : current ? typed[at] : undefined;
                      const mark = guess?.marks[at];
                      const tile = ['purdle-tile'];
                      if (mark) tile.push(mark);
                      else if (letter) tile.push('filled');
                      return (
                        <div className={tile.join(' ')} key={at} style={{ ['--at' as string]: at }}>
                          {letter ?? ''}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {over ? (
              <Result today={today} share={share} chatChannel={chatChannel?.id ?? null} chatName={chatChannel?.name ?? null} onCopied={() => say('Copied')} />
            ) : (
              <div className="purdle-keys" aria-label="Keyboard">
                {ROWS.map((row) => (
                  <div className="purdle-key-row" key={row}>
                    {row.split('').map((key) =>
                      key === '+' ? (
                        <button type="button" key="enter" className="purdle-key wide" onClick={() => press('enter')}>
                          Enter
                        </button>
                      ) : key === '-' ? (
                        <button type="button" key="back" className="purdle-key wide" aria-label="Delete" onClick={() => press('back')}>
                          &#9003;
                        </button>
                      ) : (
                        <button type="button" key={key} className={`purdle-key ${keys.get(key) ?? ''}`} onClick={() => press(key)}>
                          {key}
                        </button>
                      ),
                    )}
                  </div>
                ))}
              </div>
            )}

            {boardServer ? <ServerToday serverId={boardServer.id} serverName={boardServer.name} day={today.day} /> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Result({
  today,
  share,
  chatChannel,
  chatName,
  onCopied,
}: {
  today: PurdleToday;
  share: string;
  chatChannel: string | null;
  chatName: string | null;
  onCopied: () => void;
}) {
  const left = useCountdown(today.nextAt);
  const won = today.state === 'won';
  const tries = today.guesses.length;
  const { stats } = today;
  const tallest = Math.max(1, ...stats.spread);

  return (
    <div className="purdle-result">
      <div className="purdle-verdict">
        {won ? PURDLE_PRAISE[tries - 1] : 'The word was'}
        {won ? null : <span className="purdle-answer">{today.answer}</span>}
      </div>

      <div className="purdle-stats">
        <Stat value={stats.played} label="Played" />
        <Stat value={stats.played ? Math.round((stats.wins / stats.played) * 100) : 0} label="Win %" />
        <Stat value={stats.streak} label="Streak" />
        <Stat value={stats.best} label="Best" />
      </div>

      <div className="purdle-spread" aria-label="How many tries your wins took">
        {stats.spread.map((count, at) => (
          <div className="purdle-spread-row" key={at}>
            <span className="purdle-spread-n">{at + 1}</span>
            <span
              className={won && tries === at + 1 ? 'purdle-bar today' : 'purdle-bar'}
              style={{ width: `${Math.max(8, (count / tallest) * 100)}%` }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>

      <div className="purdle-actions">
        <button
          type="button"
          className="button inline"
          onClick={() => void navigator.clipboard.writeText(share).then(onCopied, () => undefined)}
        >
          Copy result
        </button>
        {chatChannel ? (
          <button
            type="button"
            className="button secondary inline"
            title="Puts it in the message box there, for you to send"
            onClick={() => {
              channelDrafts.set(chatChannel, share);
              purdle.close();
            }}
          >
            Put in #{chatName}
          </button>
        ) : null}
      </div>
      <div className="purdle-next">
        Next word in <b>{left}</b>
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="purdle-stat">
      <span className="purdle-stat-value">{value}</span>
      <span className="purdle-stat-label">{label}</span>
    </div>
  );
}

/** Time left until `until`, ticking; `onZero` runs once it gets there. */
export function useCountdown(until: string, onZero: () => void = () => void purdle.load()): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  useEffect(() => {
    if (left === 0) onZero();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Who in this server has done today's, live as they finish, and everyone's record here. */
function ServerToday({ serverId, serverName, day }: { serverId: string; serverName: string; day: number }) {
  const { state } = useStore();
  const [finishes, setFinishes] = useState<PurdleFinish[] | null>(null);
  const [standings, setStandings] = useState<PurdleStanding[] | null>(null);

  useEffect(() => {
    let live = true;
    setFinishes(null);
    setStandings(null);
    const fetchBoard = () =>
      api.purdle
        .server(serverId)
        .then((result) => {
          if (!live) return;
          setFinishes(result.day === day ? result.finishes : []);
          setStandings(result.standings);
        })
        .catch(() => {
          if (live) setFinishes((now) => now ?? []);
        });
    void fetchBoard();
    const stop = purdle.onDone((done) => {
      if (done.serverId !== serverId || done.day !== day) return;
      setFinishes((now) => [
        ...(now ?? []).filter((entry) => entry.userId !== done.userId),
        { userId: done.userId, tries: done.tries, solved: done.solved, streak: done.streak },
      ]);
      // Someone's record moved: the all-time numbers come fresh.
      void fetchBoard();
    });
    return () => {
      live = false;
      stop();
    };
  }, [serverId, day]);

  const members = state.members[serverId] ?? [];
  const ordered = [...(finishes ?? [])].sort(
    (a, b) => Number(b.solved) - Number(a.solved) || a.tries - b.tries || b.streak - a.streak,
  );

  // Most wins first; between equal wins, fewer tries on average.
  const ranked =
    standings === null
      ? null
      : [...standings]
          .sort((a, b) => b.wins - a.wins || (a.averageTries ?? 9) - (b.averageTries ?? 9) || b.best - a.best)
          .map((entry) => ({
            userId: entry.userId,
            cells: [`${entry.wins}/${entry.played}`, average(entry.averageTries), entry.streak, entry.best],
          }));

  const today =
    finishes === null ? null : ordered.length === 0 ? (
      <p className="purdle-board-empty">Nobody here has done today&apos;s yet.</p>
    ) : (
      <ul className="purdle-board-list">
        {ordered.map((entry) => {
          const member = members.find((candidate) => candidate.userId === entry.userId);
          if (!member) return null;
          return (
            <li key={entry.userId} className="purdle-board-row">
              <Avatar user={member.user} name={nameOf(member)} small />
              <span className="purdle-board-name">{nameOf(member)}</span>
              {entry.streak > 1 ? <span className="purdle-board-streak">{entry.streak} in a row</span> : null}
              <span className={entry.solved ? 'purdle-board-score' : 'purdle-board-score lost'}>
                {entry.solved ? entry.tries : 'X'}/{PURDLE.tries}
              </span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <GameBoard
      serverId={serverId}
      serverName={serverName}
      today={today}
      columns={['Won', 'Avg tries', 'Streak', 'Best']}
      standings={ranked}
    />
  );
}

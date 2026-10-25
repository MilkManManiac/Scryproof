/**
 * Queefs: Queens, one board a day for everyone here (Wes, 2026-09-29).
 * Opened from the games folder in the rail, or `/queefs`.
 *
 * Tap a square once for a cross (not here), twice for a queen, again to
 * clear it; drag to cross off a run. The clock is the server's: it starts
 * when you ask for the board and stops when the server has checked your
 * queens, so closing this does not pause it. Where your marks are is kept
 * on this device only.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QUEENS, queensClashes, queensClock, queensShare } from '@scryproof/shared';
import type { QueensToday } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { queens } from '../lib/daily';
import { average } from './GameBoard';
import { GameShell, ResultActions, ServerBoard, StatText, useToast } from './GameShell';

type Mark = 0 | 1 | 2;
const NONE: Mark = 0;
const CROSS: Mark = 1;
const QUEEN: Mark = 2;

const key = (day: number) => `scryproof.queens.${day}`;

/** The regions' colours by number, as `.qn-cell.c0` and on have them. */
const COLOURS = ['Purple', 'Orange', 'Blue', 'Green', 'Grey', 'Red', 'Yellow', 'Teal', 'Pink'];

/**
 * The first row, column or colour that has no queen and no square left open
 * for one. Nothing is said about where the mistake is: only that there is one.
 */
function stuck(regions: number[][], marks: Mark[]): string | null {
  const size = regions.length;
  const lines: { name: string; cells: number[] }[] = [];
  for (let at = 0; at < size; at += 1) {
    const colour: number[] = [];
    regions.forEach((row, r) => row.forEach((region, c) => region === at && colour.push(r * size + c)));
    lines.push({ name: COLOURS[at] ?? `Colour ${at + 1}`, cells: colour });
  }
  for (let at = 0; at < size; at += 1) {
    lines.push({ name: `Row ${at + 1}`, cells: Array.from({ length: size }, (_, c) => at * size + c) });
    lines.push({ name: `Column ${at + 1}`, cells: Array.from({ length: size }, (_, r) => r * size + at) });
  }
  const shut = lines.find((line) => line.cells.length > 0 && line.cells.every((cell) => marks[cell] === CROSS));
  return shut ? shut.name : null;
}

function kept(day: number, cells: number): Mark[] {
  try {
    const marks = JSON.parse(localStorage.getItem(key(day)) ?? 'null') as unknown;
    if (Array.isArray(marks) && marks.length === cells) return marks.map((mark) => (mark === 1 || mark === 2 ? mark : 0));
  } catch {
    // Nothing kept, or not ours: start clean.
  }
  return Array.from({ length: cells }, () => NONE);
}

export function QueensGate() {
  const view = useSyncExternalStore(queens.subscribe, queens.get);
  return view.open ? <Queens today={view.today} /> : null;
}

function Queens({ today }: { today: QueensToday | null }) {
  const { toast, say } = useToast();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      queens.apply(await api.queens.start());
    } catch (problem) {
      say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameShell game="queens" name={QUEENS.name} kind="qn" day={today?.day ?? null} toast={toast} loading={today === null} onClose={queens.close}>
      {today === null ? null : today.state === 'waiting' ? (
        <div className="qn-door">
          <p>
            One queen in every row, every column and every colour. No two queens touching, not even at a corner. There is only one way to
            do it.
          </p>
          <p>It is a race. The clock starts when you see the board, and it does not stop if you close this.</p>
          <button type="button" className="button inline" disabled={busy} onClick={() => void start()}>
            Start the clock
          </button>
        </div>
      ) : (
        <Board key={today.day} today={today} say={say} />
      )}
      {today ? (
        <ServerBoard
          game={queens}
          load={api.queens.server}
          day={today.day}
          mine={today.state}
          finishes={(result) =>
            [...result.finishes].sort((a, b) => a.seconds - b.seconds).map((entry) => ({ userId: entry.userId, score: queensClock(entry.seconds) }))
          }
          columns={['Fastest', 'Days', 'Avg', 'Best']}
          // Most days quickest here; then more days done; then the better average.
          standings={(result) =>
            [...result.standings]
              .sort((a, b) => b.firsts - a.firsts || b.played - a.played || (a.average ?? 1e9) - (b.average ?? 1e9))
              .map((entry) => ({
                userId: entry.userId,
                cells: [
                  entry.firsts,
                  entry.played,
                  entry.average === null ? average(null) : queensClock(entry.average),
                  entry.best === null ? average(null) : queensClock(entry.best),
                ],
              }))
          }
          empty="Nobody here has solved today’s yet."
        />
      ) : null}
    </GameShell>
  );
}

function Board({ today, say }: { today: QueensToday; say: (text: string, good?: boolean) => void }) {
  const regions = today.regions!;
  const size = regions.length;
  const done = today.state === 'done';
  const [marks, setMarks] = useState<Mark[]>(() => kept(today.day, size * size));
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  /** While a finger or the mouse is down on the board: where it went down, and whether it has moved off it. */
  const stroke = useRef<{ first: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (done) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [done]);

  useEffect(() => {
    if (done) return;
    try {
      localStorage.setItem(key(today.day), JSON.stringify(marks));
    } catch {
      // A full or closed store only means the marks do not outlive the tab.
    }
  }, [marks, done, today.day]);

  const solved = new Set(today.queens ?? []);
  const placed = done ? [...solved] : marks.flatMap((mark, cell) => (mark === QUEEN ? [cell] : []));
  const clashes = done ? new Set<number>() : queensClashes(regions, placed);

  // All of them down and none at odds: that is the answer, and the server is asked to say so.
  const ready = !done && placed.length === size && clashes.size === 0;
  useEffect(() => {
    if (!ready || sending) return;
    setSending(true);
    api.queens
      .solve(placed)
      .then((next) => {
        queens.apply(next);
        say(`Solved in ${queensClock(next.seconds ?? 0)}`, true);
      })
      .catch((problem) => say(problem instanceof ApiError ? problem.message : 'That did not go through.'))
      .finally(() => setSending(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const cellAt = (event: React.PointerEvent): number | null => {
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const cell = under instanceof HTMLElement ? under.dataset.cell : undefined;
    return cell === undefined ? null : Number(cell);
  };

  // A tap is a click, which a keyboard makes too. The pointer is only watched for a drag.
  const down = (event: React.PointerEvent) => {
    const cell = cellAt(event);
    stroke.current = done || cell === null ? null : { first: cell, moved: false };
  };
  const move = (event: React.PointerEvent) => {
    const cell = cellAt(event);
    if (!stroke.current || event.buttons === 0 || cell === null || cell === stroke.current.first) return;
    // Dragging crosses off what it passes over, the square it started on too, and never touches a queen.
    const first = stroke.current.first;
    stroke.current.moved = true;
    setMarks((before) => before.map((mark, at) => ((at === cell || at === first) && mark === NONE ? CROSS : mark)));
  };
  const tap = (cell: number) => {
    const dragged = stroke.current?.moved;
    stroke.current = null;
    if (done || dragged) return;
    setMarks((before) => before.map((mark, at) => (at === cell ? (((mark + 1) % 3) as Mark) : mark)));
  };

  const shut = done || clashes.size > 0 ? null : stuck(regions, marks);

  const elapsed = done ? today.seconds ?? 0 : Math.max(0, (now - new Date(today.startedAt!).getTime()) / 1000);

  return (
    <>
      <div className="qn-top">
        <span className="qn-clock">{queensClock(elapsed)}</span>
        {done ? null : (
          <>
            <span className="qn-count">
              {placed.length} of {size}
            </span>
            <button type="button" className="button secondary inline" onClick={() => setMarks(marks.map(() => NONE))}>
              Clear
            </button>
          </>
        )}
      </div>

      <div
        className={`qn-grid${done ? ' done' : ''}`}
        style={{ ['--n' as string]: size }}
        onPointerDown={down}
        onPointerMove={move}
      >
        {regions.flatMap((row, r) =>
          row.map((region, c) => {
            const cell = r * size + c;
            const queen = done ? solved.has(cell) : marks[cell] === QUEEN;
            const classes = [`qn-cell c${region}`];
            // A heavier line wherever the colour changes.
            if (r === 0 || regions[r - 1]![c] !== region) classes.push('t');
            if (c === 0 || row[c - 1] !== region) classes.push('l');
            if (r === size - 1) classes.push('b');
            if (c === size - 1) classes.push('r');
            if (queen) classes.push('queen');
            if (clashes.has(cell)) classes.push('clash');
            return (
              <button
                type="button"
                key={cell}
                data-cell={cell}
                className={classes.join(' ')}
                disabled={done}
                onClick={() => tap(cell)}
                aria-label={`Row ${r + 1}, column ${c + 1}: ${queen ? 'queen' : marks[cell] === CROSS ? 'crossed off' : 'empty'}`}
              >
                {queen ? <Crown /> : !done && marks[cell] === CROSS ? <span className="qn-cross" aria-hidden="true" /> : null}
              </button>
            );
          }),
        )}
      </div>

      {done ? (
        <div className="purdle-result">
          <div className="purdle-verdict">{queensClock(today.seconds ?? 0)}</div>
          <div className="purdle-stats">
            <StatText value={today.stats.played} label="Solved" />
            <StatText value={today.stats.best === null ? '–' : queensClock(today.stats.best)} label="Best" />
            <StatText value={today.stats.average === null ? '–' : queensClock(today.stats.average)} label="Average" />
          </div>
          <ResultActions
            share={queensShare(today.day, today.seconds ?? 0)}
            nextAt={today.nextAt}
            what="Next board"
            say={say}
            onClose={queens.close}
            onTurnover={() => void queens.load()}
          />
        </div>
      ) : clashes.size > 0 ? (
        <p className="qn-hint bad" role="status">
          The red queens break a rule: same row, column or colour, or touching.
        </p>
      ) : shut ? (
        <p className="qn-hint bad" role="status">
          {shut} has no queen and no square left for one. A queen or a cross is in the wrong place.
        </p>
      ) : (
        <p className="qn-hint">Tap once to cross a square off, twice for a queen. Drag to cross off a run.</p>
      )}
    </>
  );
}

function Crown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="qn-crown">
      <path d="M3 8.5l4.2 3.6L12 5l4.8 7.1L21 8.5 19.2 18H4.8z" />
      <rect x="4.8" y="19.2" width="14.4" height="1.8" rx="0.9" />
    </svg>
  );
}

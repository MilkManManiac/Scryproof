/**
 * Conveyor (Wes, 2026-11-17): "like 20 items come by on the screen. Like a
 * picture and the text. It goes through and then you have a minute to recite
 * how many you saw." Opened from the games folder, or `/conveyor`.
 *
 * Three screens off one clock, the server's: the belt (twenty things ride
 * past once), the minute (name them), and the result (the whole belt again,
 * the ones you got lit). The belt is CSS animation with each item's delay
 * worked out from the server's start stamp, so a reload picks up mid-belt.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  CONVEYOR,
  CONVEYOR_CROSS_MS,
  conveyorFound,
  conveyorHit,
  conveyorPhase,
  conveyorRepeat,
  conveyorShare,
} from '@scryproof/shared';
import type { ConveyorItem, ConveyorToday } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { conveyor } from '../lib/daily';
import { average } from './GameBoard';
import { GameShell, ResultActions, ServerBoard, StatText, useToast, type Say } from './GameShell';

const picture = (item: ConveyorItem) => `/conveyor/${item.file}`;

function verdict(score: number): string {
  if (score === CONVEYOR.items) return 'Perfect';
  if (score >= 16) return 'Sharp';
  if (score >= 12) return 'Good';
  if (score >= 8) return 'Not bad';
  return 'Rough';
}

export function ConveyorGate() {
  const view = useSyncExternalStore(conveyor.subscribe, conveyor.get);
  return view.open ? <Conveyor today={view.today} /> : null;
}

/** Ms since the server's start stamp, on the server's clock, ticking while the day is live. */
function useElapsed(today: ConveyorToday | null): number {
  const [now, setNow] = useState(() => Date.now());
  const live = today?.state === 'playing';
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [live]);
  if (!today?.startedAt) return 0;
  const skew = Date.parse(today.now) - Date.now();
  return Math.max(now, Date.now()) + skew - Date.parse(today.startedAt);
}

function Conveyor({ today }: { today: ConveyorToday | null }) {
  const { toast, say } = useToast();
  const elapsed = useElapsed(today);
  const phase = !today ? null : today.state === 'fresh' ? 'fresh' : today.state === 'done' ? 'done' : conveyorPhase(elapsed);

  return (
    <GameShell game="conveyor" name={CONVEYOR.name} kind="cv" day={today?.day ?? null} toast={toast} loading={today === null} onClose={conveyor.close}>
      {today === null ? null : (
        <>
          {phase === 'fresh' ? <Start say={say} /> : null}
          {phase === 'belt' ? <Belt items={today.items} elapsed={elapsed} /> : null}
          {phase === 'recall' || phase === 'over' ? (
            <Recall key={today.day} today={today} left={CONVEYOR.beltMs + CONVEYOR.recallMs - elapsed} say={say} />
          ) : null}
          {phase === 'done' ? <Result today={today} say={say} /> : null}
          {phase === 'belt' ? null : (
            <ServerBoard
              game={conveyor}
              load={api.conveyor.server}
              day={today.day}
              mine={today.state}
              finishes={(result) =>
                [...result.finishes].sort((a, b) => b.score - a.score).map((entry) => ({ userId: entry.userId, score: `${entry.score}/${CONVEYOR.items}` }))
              }
              columns={['Days', 'Avg', 'Best', 'Streak']}
              standings={(result) =>
                [...result.standings]
                  .sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.played - a.played)
                  .map((entry) => ({ userId: entry.userId, cells: [entry.played, average(entry.average), entry.best, entry.streak] }))
              }
            />
          )}
        </>
      )}
    </GameShell>
  );
}

function Start({ say }: { say: Say }) {
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="cv-start">
      <p>{CONVEYOR.items} things ride past on the belt, once. Watch them go.</p>
      <p>Then you have a minute to name as many as you can.</p>
      <button
        ref={button}
        type="button"
        className="button cv-go"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          api.conveyor.start().then(conveyor.apply, (problem: unknown) => {
            setBusy(false);
            say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
          });
        }}
      >
        Start
      </button>
    </div>
  );
}

/**
 * The belt. Every item runs the same CSS ride; its delay puts it where the
 * clock says it should be, worked out once when the belt is first drawn.
 */
function Belt({ items, elapsed }: { items: ConveyorItem[]; elapsed: number }) {
  const [since] = useState(elapsed);
  const track = useRef<HTMLDivElement>(null);
  const [roll, setRoll] = useState(1000);
  const on = Math.min(CONVEYOR.items, Math.max(1, Math.floor(elapsed / CONVEYOR.gapMs) + 1));

  // The belt's stripes move at the items' speed: one stripe gap in the time an item covers it.
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return undefined;
    const measure = () => {
      const item = element.querySelector<HTMLElement>('.cv-item');
      const distance = element.clientWidth + (item?.offsetWidth ?? 110);
      setRoll((40 * CONVEYOR_CROSS_MS) / distance);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="cv-stage">
      <div className="cv-count" aria-live="off">
        {on} / {CONVEYOR.items}
      </div>
      <div className="cv-track" ref={track} style={{ ['--cv-roll' as string]: `${roll}ms` }}>
        <div className="cv-belt" aria-hidden="true" />
        <div className="cv-roller left" aria-hidden="true" />
        <div className="cv-roller right" aria-hidden="true" />
        {items.map((item, at) => (
          <figure
            key={item.id}
            className="cv-item"
            style={{ animationDuration: `${CONVEYOR_CROSS_MS}ms`, animationDelay: `${at * CONVEYOR.gapMs - since}ms` }}
          >
            <div className="cv-tray">
              <img src={picture(item)} alt="" draggable={false} />
            </div>
            <figcaption>{item.name}</figcaption>
          </figure>
        ))}
      </div>
      <p className="cv-hint">Watch. The minute starts when the belt is empty.</p>
    </div>
  );
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Recall({ today, left, say }: { today: ConveyorToday; left: number; say: Say }) {
  const items = today.items;
  const [guesses, setGuesses] = useState<string[]>(today.guesses);
  const [said, setSaid] = useState('');
  const [shaking, setShaking] = useState(false);
  const [ending, setEnding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const found = conveyorFound(items, guesses);
  const foundSet = new Set(found);
  const over = left <= 0;

  useEffect(() => input.current?.focus(), []);

  function finish() {
    if (ending) return;
    setEnding(true);
    // After every guess already on its way.
    queue.current = queue.current
      .then(() => api.conveyor.finish())
      .then(conveyor.apply, (problem: unknown) => {
        setEnding(false);
        say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
      });
  }

  useEffect(() => {
    if (over) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = said.trim();
    if (!text || over || ending) return;
    const hit = conveyorHit(items, foundSet, text);
    if (hit) {
      setGuesses((now) => [...now, text]);
      setSaid('');
      queue.current = queue.current
        .then(() => api.conveyor.guess(text))
        .catch((problem: unknown) => say(problem instanceof ApiError ? problem.message : 'A name did not go through.'));
      return;
    }
    if (conveyorRepeat(items, foundSet, text)) {
      say('Already got it');
      setSaid('');
      return;
    }
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  }

  return (
    <div className="cv-recall">
      <div className={`cv-timer${left < 10_000 ? ' low' : ''}`} aria-label="Time left">
        {clock(left)}
      </div>
      <div className="cv-score">
        <b>{found.length}</b> / {CONVEYOR.items}
      </div>
      <form className={`cv-form${shaking ? ' shake' : ''}`} onSubmit={submit}>
        <input
          ref={input}
          className="game-input"
          value={said}
          maxLength={60}
          placeholder="Name one you saw"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={over || ending}
          onChange={(event) => setSaid(event.target.value)}
        />
        <button type="button" className="button secondary inline" disabled={ending} onClick={finish}>
          Done
        </button>
      </form>
      <ul className="cv-found" aria-label="Named so far">
        {found.map((id) => {
          const item = items.find((entry) => entry.id === id)!;
          return (
            <li key={id} title={item.name}>
              <img src={picture(item)} alt={item.name} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Result({ today, say }: { today: ConveyorToday; say: Say }) {
  const found = new Set(conveyorFound(today.items, today.guesses));
  const marks = today.items.map((item) => found.has(item.id));
  return (
    <div className="purdle-result">
      <div className="purdle-verdict">
        {verdict(today.score)}
        <span className="cv-total">
          {today.score} / {CONVEYOR.items}
        </span>
      </div>
      <ol className="cv-reveal" aria-label="The belt, in order">
        {today.items.map((item, at) => (
          <li key={item.id} className={found.has(item.id) ? 'got' : 'missed'} style={{ animationDelay: `${at * 45}ms` }}>
            <img src={picture(item)} alt="" />
            <span>{item.name}</span>
          </li>
        ))}
      </ol>
      <div className="purdle-stats">
        <StatText value={today.stats.played} label="Played" />
        <StatText value={average(today.stats.average)} label="Average" />
        <StatText value={today.stats.best} label="Best" />
        <StatText value={today.stats.streak} label="Streak" />
      </div>
      <ResultActions
        share={conveyorShare(today.day, marks)}
        nextAt={today.nextAt}
        what="New belt"
        say={say}
        onClose={conveyor.close}
        onTurnover={() => void conveyor.load()}
      />
    </div>
  );
}

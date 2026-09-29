/**
 * Cuntections: Connections, one puzzle a day for everyone here (Wes,
 * 2026-09-28). Opened from the games folder in the rail, or `/cuntections`.
 *
 * Plays like Connections because everybody already knows how: pick four,
 * Submit, a found group becomes a coloured bar, "one away" when three of the
 * four belong together, four mistakes and the rest are shown. The server
 * holds the groups and marks each four; this draws what it says. Under the
 * board, the same Today / All time board as Purdle's.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CUNTECTIONS, CUNTECTIONS_PRAISE, cuntectionsShare } from '@scryproof/shared';
import type { CuntectionsFinish, CuntectionsGroupShown, CuntectionsLevel, CuntectionsStanding, CuntectionsToday } from '@scryproof/shared';
import { createPortal } from 'react-dom';

import { ApiError, api } from '../lib/api';
import { useLayer } from '../lib/back';
import { cuntections } from '../lib/cuntections';
import { channelDrafts } from '../lib/drafts';
import { nameOf } from '../lib/mentions';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { GameBoard, average } from './GameBoard';
import { Stat, useCountdown } from './Purdle';

/** The four picked tiles hop one after another while the guess goes in. */
const HOP_STAGGER_MS = 90;
const HOP_MS = 320;
const HOPS_MS = HOP_STAGGER_MS * (CUNTECTIONS.size - 1) + HOP_MS;
/** On a loss, the groups not found come in one at a time. */
const REVEAL_EACH_MS = 750;

const LEVEL_CLASS = ['yellow', 'green', 'blue', 'purple'] as const;

const sameFour = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((word) => b.includes(word));

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(Math.random() * (at + 1));
    [out[at], out[other]] = [out[other]!, out[at]!];
  }
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CuntectionsGate() {
  const view = useSyncExternalStore(cuntections.subscribe, cuntections.get);
  return view.open ? <Cuntections today={view.today} /> : null;
}

function Cuntections({ today }: { today: CuntectionsToday | null }) {
  const { state } = useStore();
  const dms = useDms();
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hopping, setHopping] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** The group that just turned into a bar, to bring it in. */
  const [arrived, setArrived] = useState<CuntectionsLevel | null>(null);
  /** On a loss seen live, how many of the groups not found are showing so far. Null: all of them. */
  const [revealed, setRevealed] = useState<number | null>(null);
  const [pausing, setPausing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayer(cuntections.close);

  // A new day's deal (or the first one) replaces the tiles; a shuffle is this device's own.
  const day = today?.day;
  useEffect(() => {
    if (today) setOrder(today.words);
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cuntections.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const say = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const playing = today?.state === 'playing';
  const found = today?.found ?? [];
  const foundWords = new Set(found.flatMap((group) => group.words));
  const rest = today?.groups?.filter((group) => !found.some((mine) => mine.level === group.level)) ?? [];
  const bars: CuntectionsGroupShown[] = [...found, ...(revealed === null ? rest : rest.slice(0, revealed))];
  const barWords = new Set(bars.flatMap((group) => group.words));
  const tiles = order.filter((word) => !barWords.has(word) && !foundWords.has(word));

  const toggle = (word: string) => {
    if (!playing || busy) return;
    setSelected((now) =>
      now.includes(word) ? now.filter((entry) => entry !== word) : now.length < CUNTECTIONS.size ? [...now, word] : now,
    );
  };

  async function submit() {
    if (!today || !playing || busy || selected.length !== CUNTECTIONS.size) return;
    if (today.misses.some((miss) => sameFour(miss, selected))) return say('Already guessed');
    setBusy(true);
    setHopping(true);
    try {
      const [next] = await Promise.all([api.cuntections.guess(selected), wait(HOPS_MS)]);
      setHopping(false);
      if (next.outcome === 'right') {
        setArrived(next.found[next.found.length - 1]?.level ?? null);
        setSelected([]);
        cuntections.apply(next);
        if (next.state === 'won') {
          setPausing(true);
          setTimeout(() => {
            say(CUNTECTIONS_PRAISE[next.mistakes] ?? 'Done');
            setPausing(false);
          }, 1100);
        }
        return;
      }
      setShaking(true);
      if (next.outcome === 'one_away') say('One away…');
      await wait(500);
      setShaking(false);
      if (next.state === 'lost') {
        // The rest come in one by one, then the result.
        const missing = (next.groups ?? []).filter((group) => !next.found.some((mine) => mine.level === group.level)).length;
        setSelected([]);
        setRevealed(0);
        setPausing(true);
        cuntections.apply(next);
        for (let count = 1; count <= missing; count += 1) {
          await wait(REVEAL_EACH_MS);
          setRevealed(count);
        }
        await wait(1200);
        setRevealed(null);
        setPausing(false);
        return;
      }
      cuntections.apply(next);
    } catch (problem) {
      setHopping(false);
      say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // Where "Put in chat" would put it: the text channel open behind the game.
  const server = state.selectedServerId ? state.servers[state.selectedServerId] : undefined;
  const channel = !dms.state.active && server ? server.channels.find((entry) => entry.id === state.selectedChannelId) : undefined;
  const chatChannel = channel?.type === 'text' ? channel : undefined;
  const boardServer = server ?? (state.serverOrder[0] ? state.servers[state.serverOrder[0]] : undefined);

  const over = today !== null && !playing && !pausing;
  const left = CUNTECTIONS.mistakes - (today?.mistakes ?? 0);

  return createPortal(
    <div className="purdle-backdrop" role="presentation" onMouseDown={() => cuntections.close()}>
      <div
        className="purdle cx"
        role="dialog"
        aria-modal="true"
        aria-label="Cuntections"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="purdle-head">
          <div className="purdle-title">
            Cuntections{today ? <span className="purdle-number">#{today.day}</span> : null}
          </div>
          <button type="button" className="icon-button purdle-close" aria-label="Close" title="Close" onClick={() => cuntections.close()}>
            &#10005;
          </button>
        </header>

        {toast ? (
          <div className="purdle-toast" role="status">
            {toast}
          </div>
        ) : null}

        {today === null ? (
          <div className="purdle-loading">
            <div className="spinner" />
          </div>
        ) : (
          <>
            {playing ? <p className="cx-hint">Make four groups of four.</p> : null}

            <div className="cx-board">
              {bars.map((group) => (
                <div
                  key={group.level}
                  className={`cx-bar ${LEVEL_CLASS[group.level]}${group.level === arrived || (revealed !== null && !found.includes(group)) ? ' arrive' : ''}`}
                >
                  <div className="cx-bar-name">{group.name}</div>
                  <div className="cx-bar-words">{group.words.join(', ')}</div>
                </div>
              ))}
              {tiles.length > 0 ? (
                <div className="cx-grid">
                  {tiles.map((word) => {
                    const at = selected.indexOf(word);
                    const classes = ['cx-tile'];
                    if (at >= 0) classes.push('picked');
                    if (at >= 0 && hopping) classes.push('hop');
                    if (at >= 0 && shaking) classes.push('shake');
                    if (word.length > 10) classes.push('longer');
                    else if (word.length > 7) classes.push('long');
                    return (
                      <button
                        type="button"
                        key={word}
                        className={classes.join(' ')}
                        style={{ ['--at' as string]: at }}
                        aria-pressed={at >= 0}
                        disabled={!playing}
                        onClick={() => toggle(word)}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {playing || pausing ? (
              <>
                <div className="cx-mistakes" aria-label={`${left} mistakes left`}>
                  Mistakes left
                  <span className="cx-dots">
                    {Array.from({ length: CUNTECTIONS.mistakes }, (_, at) => (
                      <span key={at} className={at < left ? 'cx-dot' : 'cx-dot gone'} />
                    ))}
                  </span>
                </div>
                <div className="cx-actions">
                  <button
                    type="button"
                    className="button secondary inline"
                    disabled={!playing || busy}
                    onClick={() => setOrder((now) => shuffled(now))}
                  >
                    Shuffle
                  </button>
                  <button
                    type="button"
                    className="button secondary inline"
                    disabled={!playing || busy || selected.length === 0}
                    onClick={() => setSelected([])}
                  >
                    Deselect all
                  </button>
                  <button
                    type="button"
                    className="button inline"
                    disabled={!playing || busy || selected.length !== CUNTECTIONS.size}
                    onClick={() => void submit()}
                  >
                    Submit
                  </button>
                </div>
              </>
            ) : null}

            {over ? <Result today={today} chatChannel={chatChannel?.id ?? null} chatName={chatChannel?.name ?? null} onCopied={() => say('Copied')} /> : null}

            {boardServer ? <ServerBoard serverId={boardServer.id} serverName={boardServer.name} day={today.day} /> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Result({
  today,
  chatChannel,
  chatName,
  onCopied,
}: {
  today: CuntectionsToday;
  chatChannel: string | null;
  chatName: string | null;
  onCopied: () => void;
}) {
  const left = useCountdown(today.nextAt, () => void cuntections.load());
  const won = today.state === 'won';
  const { stats } = today;
  const grid = today.grid ?? [];
  const share = cuntectionsShare(today.day, grid);

  return (
    <div className="purdle-result">
      <div className="purdle-verdict">{won ? CUNTECTIONS_PRAISE[today.mistakes] : 'Next time'}</div>

      <div className="cx-share" aria-label="Your guesses, as colours">
        {grid.map((row, at) => (
          <div className="cx-share-row" key={at}>
            {row.map((level, index) => (
              <span key={index} className={`cx-share-cell ${LEVEL_CLASS[level]}`} />
            ))}
          </div>
        ))}
      </div>

      <div className="purdle-stats">
        <Stat value={stats.played} label="Played" />
        <Stat value={stats.played ? Math.round((stats.wins / stats.played) * 100) : 0} label="Win %" />
        <Stat value={stats.streak} label="Streak" />
        <Stat value={stats.perfect} label="Perfect" />
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
              cuntections.close();
            }}
          >
            Put in #{chatName}
          </button>
        ) : null}
      </div>
      <div className="purdle-next">
        Next puzzle in <b>{left}</b>
      </div>
    </div>
  );
}

/** Who in this server has done today's, live as they finish, and everyone's record here. */
function ServerBoard({ serverId, serverName, day }: { serverId: string; serverName: string; day: number }) {
  const { state } = useStore();
  const [finishes, setFinishes] = useState<CuntectionsFinish[] | null>(null);
  const [standings, setStandings] = useState<CuntectionsStanding[] | null>(null);

  useEffect(() => {
    let live = true;
    setFinishes(null);
    setStandings(null);
    const fetchBoard = () =>
      api.cuntections
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
    const stop = cuntections.onDone((done) => {
      if (done.serverId !== serverId || done.day !== day) return;
      setFinishes((now) => [
        ...(now ?? []).filter((entry) => entry.userId !== done.userId),
        { userId: done.userId, mistakes: done.mistakes, solved: done.solved, streak: done.streak },
      ]);
      void fetchBoard();
    });
    return () => {
      live = false;
      stop();
    };
  }, [serverId, day]);

  const members = state.members[serverId] ?? [];
  const ordered = [...(finishes ?? [])].sort(
    (a, b) => Number(b.solved) - Number(a.solved) || a.mistakes - b.mistakes || b.streak - a.streak,
  );

  // Most wins first; then more perfect days; then fewer mistakes on average.
  const ranked =
    standings === null
      ? null
      : [...standings]
          .sort(
            (a, b) =>
              b.wins - a.wins || b.perfect - a.perfect || (a.averageMistakes ?? 9) - (b.averageMistakes ?? 9) || b.best - a.best,
          )
          .map((entry) => ({
            userId: entry.userId,
            cells: [`${entry.wins}/${entry.played}`, entry.perfect, average(entry.averageMistakes), entry.streak],
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
              <span className={entry.solved ? 'purdle-board-score cx-score' : 'purdle-board-score lost'}>
                {entry.solved ? (entry.mistakes === 0 ? 'Perfect' : `${entry.mistakes} miss${entry.mistakes === 1 ? '' : 'es'}`) : 'Lost'}
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
      columns={['Won', 'Perfect', 'Avg misses', 'Streak']}
      standings={ranked}
    />
  );
}

/**
 * The bee: Spelling Bee, one board a day for everyone here (Wes, 2026-09-29).
 * Opened from the games folder in the rail, or `/pee`.
 *
 * Plays like Spelling Bee because everybody already knows how: seven letters
 * in a honeycomb, the middle one in every word, type or tap, Enter. It does
 * not end; the board under it is the race. The server holds the word list
 * and says yes or no to each word; this draws what it says.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BEE, BEE_RANKS, BEE_REFUSALS, beeRankAt, beeRefusal, beeShare, isPangram } from '@scryproof/shared';
import type { BeeRefusal, BeeScore, BeeStanding, BeeTaken, BeeToday, BeeYesterday } from '@scryproof/shared';
import { createPortal } from 'react-dom';

import { ApiError, api } from '../lib/api';
import { useLayer } from '../lib/back';
import { bee } from '../lib/bee';
import { channelDrafts } from '../lib/drafts';
import { nameOf } from '../lib/mentions';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { GameBoard, average } from './GameBoard';
import { useCountdown } from './Purdle';

/** No word in the list is longer, and the line has to fit a phone. */
const LONGEST = 19;

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(Math.random() * (at + 1));
    [out[at], out[other]] = [out[other]!, out[at]!];
  }
  return out;
}

function praise(taken: BeeTaken): string {
  if (taken.pangram) return `All seven! +${taken.points}`;
  if (taken.extra) return `Deep cut +${taken.points}`;
  const word = taken.points >= 7 ? 'Awesome' : taken.points >= 5 ? 'Nice' : 'Good';
  return `${word} +${taken.points}`;
}

export function BeeGate() {
  const view = useSyncExternalStore(bee.subscribe, bee.get);
  return view.open ? <Bee today={view.today} /> : null;
}

function Bee({ today }: { today: BeeToday | null }) {
  const { state } = useStore();
  const dms = useDms();
  const [typed, setTyped] = useState('');
  const [outer, setOuter] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [turning, setTurning] = useState(false);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [showing, setShowing] = useState<'play' | 'yesterday'>('play');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayer(bee.close);

  // A new day's letters (or the first ones) replace the comb; a shuffle is this device's own.
  const day = today?.day;
  useEffect(() => {
    if (today) setOuter(today.letters.slice(1));
    setTyped('');
    setShowing('play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const say = useCallback((text: string, good = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, good });
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const refused = useCallback(
    (why: BeeRefusal | string) => {
      say(why in BEE_REFUSALS ? BEE_REFUSALS[why as BeeRefusal] : why);
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setTyped('');
      }, 450);
    },
    [say],
  );

  const press = useCallback((letter: string) => setTyped((now) => (now.length < LONGEST ? now + letter : now)), []);

  const shuffle = useCallback(() => {
    setTurning(true);
    setTimeout(() => {
      setOuter((now) => shuffled(now));
      setTurning(false);
    }, 180);
  }, []);

  const enter = useCallback(async () => {
    if (!today || busy || typed.length === 0) return;
    const early = beeRefusal(typed, today.letters, today.words);
    if (early) return refused(early);
    setBusy(true);
    try {
      const next = await api.bee.word(typed);
      const before = today.rank;
      bee.apply(next);
      setTyped('');
      say(next.rank > before ? `${BEE_RANKS[next.rank]!.name}! +${next.taken.points}` : praise(next.taken), true);
    } catch (problem) {
      refused(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }, [today, busy, typed, refused, say]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return bee.close();
      if (event.ctrlKey || event.metaKey || event.altKey || showing !== 'play') return;
      if (event.key === 'Enter') {
        event.preventDefault();
        void enter();
      } else if (event.key === 'Backspace') {
        setTyped((now) => now.slice(0, -1));
      } else if (event.key === ' ') {
        event.preventDefault();
        shuffle();
      } else if (/^[a-z]$/i.test(event.key)) {
        press(event.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enter, press, shuffle, showing]);

  // Where "Put in chat" would put it: the text channel open behind the game.
  const server = state.selectedServerId ? state.servers[state.selectedServerId] : undefined;
  const channel = !dms.state.active && server ? server.channels.find((entry) => entry.id === state.selectedChannelId) : undefined;
  const chatChannel = channel?.type === 'text' ? channel : undefined;
  const boardServer = server ?? (state.serverOrder[0] ? state.servers[state.serverOrder[0]] : undefined);

  const centre = today?.letters[0] ?? '';
  const found = today ? [...today.words].reverse() : [];

  return createPortal(
    <div className="purdle-backdrop" role="presentation" onMouseDown={() => bee.close()}>
      <div className="purdle bee" role="dialog" aria-modal="true" aria-label={BEE.name} onMouseDown={(event) => event.stopPropagation()}>
        <header className="purdle-head">
          <div className="purdle-title">
            {BEE.name}
            {today ? <span className="purdle-number">#{today.day}</span> : null}
          </div>
          <button type="button" className="icon-button purdle-close" aria-label="Close" title="Close" onClick={() => bee.close()}>
            &#10005;
          </button>
        </header>

        {toast ? (
          <div className={`purdle-toast${toast.good ? ' bee-toast-good' : ''}`} role="status">
            {toast.text}
          </div>
        ) : null}

        {today === null ? (
          <div className="purdle-loading">
            <div className="spinner" />
          </div>
        ) : showing === 'yesterday' && today.yesterday ? (
          <Yesterday yesterday={today.yesterday} onBack={() => setShowing('play')} />
        ) : (
          <>
            <Rank today={today} />

            <button type="button" className={`bee-found${listOpen ? ' open' : ''}`} aria-expanded={listOpen} onClick={() => setListOpen((now) => !now)}>
              {listOpen ? (
                <span className="bee-found-count">
                  {today.words.length} of {today.answers} words
                  {today.extra.length > 0 ? `, ${today.extra.length} of them deep cuts` : ''}
                </span>
              ) : found.length === 0 ? (
                <span className="bee-found-count">Your words go here</span>
              ) : (
                <span className="bee-found-line">
                  {found.map((word) => (
                    <span key={word} className={isPangram(word) ? 'all' : undefined}>
                      {word}
                    </span>
                  ))}
                </span>
              )}
              <span className="bee-found-arrow" aria-hidden="true" />
            </button>

            {listOpen ? (
              <ul className="bee-words">
                {[...today.words].sort().map((word) => (
                  <li key={word} className={isPangram(word) ? 'all' : today.extra.includes(word) ? 'extra' : undefined}>
                    {word}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div className={`bee-typed${shaking ? ' shake' : ''}`} aria-live="polite" aria-label={typed || 'Nothing typed'}>
                  {typed.length === 0 ? <span className="bee-typed-hint">Type or tap</span> : null}
                  {[...typed].map((letter, at) => (
                    <span key={at} className={letter === centre ? 'centre' : today.letters.includes(letter) ? undefined : 'bad'}>
                      {letter}
                    </span>
                  ))}
                  {typed.length > 0 ? <span className="bee-caret" aria-hidden="true" /> : null}
                </div>

                <div className={`bee-comb${turning ? ' turning' : ''}`}>
                  <button type="button" className="bee-cell centre" onClick={() => press(centre)}>
                    {centre}
                  </button>
                  {outer.map((letter, at) => (
                    <button type="button" key={letter} className={`bee-cell at-${at}`} onClick={() => press(letter)}>
                      {letter}
                    </button>
                  ))}
                </div>

                <div className="bee-actions">
                  <button type="button" className="button secondary inline" disabled={typed.length === 0} onClick={() => setTyped((now) => now.slice(0, -1))}>
                    Delete
                  </button>
                  <button type="button" className="button secondary inline bee-shuffle" aria-label="Shuffle" title="Shuffle (space)" onClick={shuffle}>
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button type="button" className="button inline" disabled={busy || typed.length === 0} onClick={() => void enter()}>
                    Enter
                  </button>
                </div>
              </>
            )}

            <Foot
              today={today}
              chatChannel={chatChannel?.id ?? null}
              chatName={chatChannel?.name ?? null}
              onCopied={() => say('Copied', true)}
              onYesterday={() => setShowing('yesterday')}
            />

            {boardServer ? <ServerBoard serverId={boardServer.id} serverName={boardServer.name} day={today.day} /> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Where you are, and the ranks still ahead as stops along a line. */
function Rank({ today }: { today: BeeToday }) {
  const top = BEE_RANKS.length - 1;
  const next = today.rank < top ? today.rank + 1 : null;
  return (
    <div className="bee-rank">
      <div className="bee-rank-name">{BEE_RANKS[today.rank]!.name}</div>
      <div className="bee-rank-line" aria-hidden="true">
        {BEE_RANKS.slice(0, top).map((rank, at) => (
          <span key={rank.name} className={at < today.rank ? 'stop past' : at === today.rank ? 'stop here' : 'stop'}>
            {at === today.rank || (today.rank >= top && at === top - 1) ? today.score : null}
          </span>
        ))}
        <span className={today.rank >= top ? 'stop last past' : 'stop last'} />
      </div>
      <div className="bee-rank-next">
        {next === null
          ? 'Every word the day needed.'
          : `${beeRankAt(next, today.max) - today.score} to ${BEE_RANKS[next]!.name}`}
      </div>
    </div>
  );
}

function Foot({
  today,
  chatChannel,
  chatName,
  onCopied,
  onYesterday,
}: {
  today: BeeToday;
  chatChannel: string | null;
  chatName: string | null;
  onCopied: () => void;
  onYesterday: () => void;
}) {
  const left = useCountdown(today.nextAt, () => void bee.load());
  const share = beeShare(today);
  return (
    <div className="bee-foot">
      <div className="purdle-actions">
        <button
          type="button"
          className="button secondary inline"
          disabled={today.words.length === 0}
          onClick={() => void navigator.clipboard.writeText(share).then(onCopied, () => undefined)}
        >
          Copy result
        </button>
        {chatChannel ? (
          <button
            type="button"
            className="button secondary inline"
            disabled={today.words.length === 0}
            title="Puts it in the message box there, for you to send"
            onClick={() => {
              channelDrafts.set(chatChannel, share);
              bee.close();
            }}
          >
            Put in #{chatName}
          </button>
        ) : null}
        {today.yesterday ? (
          <button type="button" className="button secondary inline" onClick={onYesterday}>
            Yesterday
          </button>
        ) : null}
      </div>
      <div className="purdle-next">
        New letters in <b>{left}</b>
      </div>
    </div>
  );
}

/** Yesterday's board with every word it had, yours marked. */
function Yesterday({ yesterday, onBack }: { yesterday: BeeYesterday; onBack: () => void }) {
  const mine = new Set(yesterday.found);
  const got = yesterday.answers.filter((word) => mine.has(word)).length;
  const extra = yesterday.found.filter((word) => !yesterday.answers.includes(word)).sort();
  return (
    <div className="bee-yesterday">
      <div className="bee-yesterday-head">
        <span>Yesterday, #{yesterday.day}</span>
        <button type="button" className="button secondary inline" onClick={onBack}>
          Back to today
        </button>
      </div>
      <div className="bee-yesterday-letters">
        {yesterday.letters.map((letter, at) => (
          <span key={letter} className={at === 0 ? 'centre' : undefined}>
            {letter}
          </span>
        ))}
      </div>
      <p className="bee-yesterday-count">
        You found {got} of {yesterday.answers.length}
        {extra.length > 0 ? `, and ${extra.length} nobody needed` : ''}.
      </p>
      <ul className="bee-words whole">
        {yesterday.answers.map((word) => (
          <li key={word} className={`${isPangram(word) ? 'all' : ''}${mine.has(word) ? '' : ' missed'}`}>
            {word}
          </li>
        ))}
        {extra.map((word) => (
          <li key={word} className="extra">
            {word}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Where everyone in this server is today, live as they find words, and everyone's record here. */
function ServerBoard({ serverId, serverName, day }: { serverId: string; serverName: string; day: number }) {
  const { state } = useStore();
  const [scores, setScores] = useState<BeeScore[] | null>(null);
  const [standings, setStandings] = useState<BeeStanding[] | null>(null);

  useEffect(() => {
    let live = true;
    setScores(null);
    setStandings(null);
    const fetchBoard = () =>
      api.bee
        .server(serverId)
        .then((result) => {
          if (!live) return;
          setScores(result.day === day ? result.scores : []);
          setStandings(result.standings);
        })
        .catch(() => {
          if (live) setScores((now) => now ?? []);
        });
    void fetchBoard();
    const stop = bee.onMoved((moved) => {
      if (moved.serverId !== serverId || moved.day !== day) return;
      setScores((now) => [
        ...(now ?? []).filter((entry) => entry.userId !== moved.userId),
        { userId: moved.userId, score: moved.score, words: moved.words, rank: moved.rank },
      ]);
    });
    return () => {
      live = false;
      stop();
    };
  }, [serverId, day]);

  // Your own words move your own line without waiting on the gateway.
  const mine = useSyncExternalStore(bee.subscribe, bee.get).today;
  const me = state.user?.id;
  const current =
    scores === null
      ? null
      : mine && me && mine.day === day && mine.words.length > 0
        ? [...scores.filter((entry) => entry.userId !== me), { userId: me, score: mine.score, words: mine.words.length, rank: mine.rank }]
        : scores;

  const members = state.members[serverId] ?? [];
  const ordered = [...(current ?? [])].sort((a, b) => b.score - a.score || a.words - b.words);

  // Most points since they started; then more Genius days; then the better average.
  const ranked =
    standings === null
      ? null
      : [...standings]
          .sort((a, b) => b.total - a.total || b.genius - a.genius || (b.average ?? 0) - (a.average ?? 0))
          .map((entry) => ({
            userId: entry.userId,
            cells: [entry.total, entry.played, entry.genius, average(entry.average), entry.best],
          }));

  const today =
    current === null ? null : ordered.length === 0 ? (
      <p className="purdle-board-empty">Nobody here has a word yet.</p>
    ) : (
      <ul className="purdle-board-list">
        {ordered.map((entry) => {
          const member = members.find((candidate) => candidate.userId === entry.userId);
          if (!member) return null;
          return (
            <li key={entry.userId} className="purdle-board-row">
              <Avatar user={member.user} name={nameOf(member)} small />
              <span className="purdle-board-name">{nameOf(member)}</span>
              <span className="purdle-board-streak">
                {BEE_RANKS[entry.rank]!.name}, {entry.words} word{entry.words === 1 ? '' : 's'}
              </span>
              <span className="purdle-board-score bee-score">{entry.score}</span>
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
      columns={['Points', 'Days', 'Genius', 'Avg', 'Best']}
      standings={ranked}
    />
  );
}

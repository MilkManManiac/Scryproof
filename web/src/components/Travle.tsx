/**
 * Travhole: Travle, one route a day for everyone here (Wes, 2026-09-29).
 * Opened from the games folder in the rail, or `/travhole`.
 *
 * Two countries lit on a map. Type the ones between them; each lights up
 * green, amber or red, and the map widens to take it in. The day is won when
 * what you have named joins the two by land. The outlines are a big file,
 * so they are fetched only when the game is opened.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { TRAVLE, TRAVLE_COUNTRIES, travleCountry, travleRoute, travleShare } from '@scryproof/shared';
import type { TravleMark, TravleToday } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { travle } from '../lib/daily';
import { pinAt, type Outlines } from '../lib/travle-pin';
import { average } from './GameBoard';
import { GameShell, ResultActions, ServerBoard, StatText, useToast, type Say } from './GameShell';
import { Chart } from './MapChart';

const nameOf = (code: string) => travleCountry(code)?.name ?? code;

/** How a name is compared with what is typed: no accents, no case, no punctuation. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '');

/** What people type for the ones whose name is not what people type. */
const ALSO: Record<string, string[]> = {
  USA: ['usa', 'america', 'us'],
  GBR: ['uk', 'britain', 'great britain', 'england'],
  ARE: ['uae'],
  COD: ['drc', 'democratic republic of the congo', 'congo kinshasa'],
  COG: ['republic of the congo', 'congo brazzaville'],
  CZE: ['czech republic'],
  TUR: ['turkiye'],
  MMR: ['burma'],
  CIV: ['cote divoire', 'ivory coast'],
  SWZ: ['swaziland'],
  MKD: ['macedonia'],
  PRK: ['north korea'],
  KOR: ['south korea'],
  NLD: ['holland'],
  VAT: ['vatican'],
  TLS: ['east timor'],
  BIH: ['bosnia'],
};

export function TravleGate() {
  const view = useSyncExternalStore(travle.subscribe, travle.get);
  return view.open ? <Travle today={view.today} /> : null;
}

function Travle({ today }: { today: TravleToday | null }) {
  const { toast, say } = useToast();
  const [outlines, setOutlines] = useState<Outlines | null>(null);

  useEffect(() => {
    let live = true;
    void import('../lib/travle-map').then((loaded) => live && setOutlines(loaded.TRAVLE_MAP as Outlines));
    return () => {
      live = false;
    };
  }, []);

  return (
    <GameShell game="travle" name={TRAVLE.name} kind="tv" day={today?.day ?? null} toast={toast} loading={today === null} onClose={travle.close}>
      {today === null ? null : (
        <>
          <p className="tv-ask">
            Get from <b>{nameOf(today.from)}</b> to <b>{nameOf(today.to)}</b>
          </p>
          <Map today={today} outlines={outlines} />
          {today.state === 'playing' ? <Guess today={today} say={say} /> : null}
          <Guesses today={today} />
          {today.state === 'playing' ? null : <Result today={today} say={say} />}
          <ServerBoard
            game={travle}
            load={api.travle.server}
            day={today.day}
            mine={today.state}
            finishes={(result) =>
              [...result.finishes]
                .sort((a, b) => Number(b.solved) - Number(a.solved) || a.extra - b.extra)
                .map((entry) => ({
                  userId: entry.userId,
                  score: entry.solved ? (entry.extra === 0 ? 'Perfect' : `+${entry.extra}`) : 'Lost',
                  lost: !entry.solved,
                }))
            }
            columns={['Won', 'Perfect', 'Avg extra', 'Streak']}
            // Most wins first; then more perfect days; then fewer guesses to spare.
            standings={(result) =>
              [...result.standings]
                .sort((a, b) => b.wins - a.wins || b.perfect - a.perfect || (a.averageExtra ?? 99) - (b.averageExtra ?? 99))
                .map((entry) => ({
                  userId: entry.userId,
                  cells: [`${entry.wins}/${entry.played}`, entry.perfect, average(entry.averageExtra), entry.streak],
                }))
            }
          />
        </>
      )}
    </GameShell>
  );
}

/** The part of the world the day is in: the two ends and whatever has been named near them. */
function Map({ today, outlines }: { today: TravleToday; outlines: Outlines | null }) {
  const lit = useMemo(() => {
    const out = new globalThis.Map<string, string>();
    for (const guess of today.guesses) out.set(guess.code, guess.mark);
    for (const code of today.route ?? []) if (!out.has(code)) out.set(code, 'route');
    out.set(today.from, 'end');
    out.set(today.to, 'end');
    return out;
  }, [today]);

  // A small country at the end is a speck at the day's frame (Wes, 2026-09-29: "it was hard to tell where you were supposed to go").
  const pins = useMemo(
    () => (outlines ? [today.from, today.to].filter((code) => outlines[code]).map((code) => ({ code, name: nameOf(code), ...pinAt(code, outlines) })) : []),
    [today.from, today.to, outlines],
  );

  if (!outlines) {
    return (
      <div className="tv-map loading">
        <div className="spinner" />
      </div>
    );
  }

  // A red guess on the far side of the world would shrink the day to a dot, so those do not move the frame.
  const framed = [...lit].filter(([, mark]) => mark !== 'off').map(([code]) => outlines[code]?.box);
  let [left, top, right, bottom] = [180, 90, -180, -90];
  for (const box of framed) {
    if (!box) continue;
    left = Math.min(left, box[0]);
    top = Math.min(top, box[1]);
    right = Math.max(right, box[2]);
    bottom = Math.max(bottom, box[3]);
  }
  const pad = Math.max(3, (right - left) * 0.08, (bottom - top) * 0.08);
  let width = right - left + pad * 2;
  let height = bottom - top + pad * 2;
  // The frame on screen is three wide and two high.
  if (width / height > 1.5) height = width / 1.5;
  else width = height * 1.5;
  const x = (left + right) / 2 - width / 2;
  const y = (top + bottom) / 2 - height / 2;

  return (
    // A new guess can move the frame, and a zoom into the old one would be a zoom into nowhere.
    <Chart key={`${x} ${y} ${width}`} frame={{ x, y, width, height }} pins={pins}>
      {Object.entries(outlines).map(([code, shape]) => (lit.has(code) ? null : <path key={code} d={shape.d} className="land" />))}
      {[...lit].map(([code, mark]) => {
        const shape = outlines[code];
        return shape ? (
          <path key={code} d={shape.d} className={`land ${mark}`}>
            <title>{nameOf(code)}</title>
          </path>
        ) : null;
      })}
    </Chart>
  );
}

function Guess({ today, say }: { today: TravleToday; say: Say }) {
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const taken = new Set([today.from, today.to, ...today.guesses.map((guess) => guess.code)]);
  const wanted = plain(typed).trim();
  const offers = useMemo(() => {
    if (!wanted) return [];
    const scored = TRAVLE_COUNTRIES.flatMap((country) => {
      const names = [plain(country.name), ...(ALSO[country.code] ?? [])];
      const rank = names.some((name) => name === wanted)
        ? 0
        : names.some((name) => name.startsWith(wanted))
          ? 1
          : names.some((name) => name.includes(` ${wanted}`))
            ? 2
            : names.some((name) => wanted.length > 2 && name.includes(wanted))
              ? 3
              : -1;
      return rank < 0 ? [] : [{ country, rank }];
    });
    return scored.sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name)).slice(0, 6).map((entry) => entry.country);
  }, [wanted]);

  async function guess(code: string) {
    if (busy) return;
    if (taken.has(code)) return say(code === today.from || code === today.to ? 'That is one of the two ends' : 'You already said that one');
    setBusy(true);
    try {
      const next = await api.travle.guess(code);
      travle.apply(next);
      setTyped('');
      setPicked(0);
      const mark = next.guesses[next.guesses.length - 1]?.mark;
      if (next.state === 'won') say(next.guesses.length === next.between ? 'Perfect' : 'You made it', true);
      else if (next.state === 'playing') say(mark === 'good' ? 'On the way' : mark === 'near' ? 'Close, but out of the way' : 'No help', mark === 'good');
    } catch (problem) {
      say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <div className="tv-guess">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const offer = offers[picked] ?? offers[0];
          if (offer) void guess(offer.code);
          else if (wanted) say('No country by that name');
        }}
      >
        <input
          ref={input}
          className="game-input"
          value={typed}
          maxLength={40}
          placeholder="Name a country"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={offers.length > 0}
          aria-controls="tv-offers"
          onChange={(event) => {
            setTyped(event.target.value);
            setPicked(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setPicked((now) => (offers.length ? (now + step + offers.length) % offers.length : 0));
            }
          }}
        />
        <button type="submit" className="button inline" disabled={busy || !wanted}>
          Guess
        </button>
      </form>
      {offers.length > 0 ? (
        <ul className="tv-offers" id="tv-offers" role="listbox">
          {offers.map((country, index) => (
            <li key={country.code} role="option" aria-selected={index === picked}>
              <button
                type="button"
                className={`${index === picked ? 'picked' : ''}${taken.has(country.code) ? ' taken' : ''}`}
                onMouseEnter={() => setPicked(index)}
                onClick={() => void guess(country.code)}
              >
                {country.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="tv-left">
        {today.allowed - today.guesses.length} of {today.allowed} guesses left. The shortest way is {today.between} countr
        {today.between === 1 ? 'y' : 'ies'}.
      </div>
    </div>
  );
}

const MARK_SAYS: Record<TravleMark, string> = { good: 'on the way', near: 'out of the way', off: 'no help' };

function Guesses({ today }: { today: TravleToday }) {
  if (today.guesses.length === 0) return null;
  return (
    <ol className="tv-guesses">
      {today.guesses.map((guess) => (
        <li key={guess.code} className={guess.mark} title={MARK_SAYS[guess.mark]}>
          {nameOf(guess.code)}
        </li>
      ))}
    </ol>
  );
}

function Result({ today, say }: { today: TravleToday; say: Say }) {
  const won = today.state === 'won';
  const extra = today.guesses.length - today.between;
  // The way you went, if you got there; a shortest way either way.
  const open = new Set(today.guesses.map((guess) => guess.code));
  const mine = won ? travleRoute(today.from, today.to, open) : [];
  const shortest = today.route ?? [];
  const same = mine.length === shortest.length;
  return (
    <div className="purdle-result">
      <div className="purdle-verdict">{won ? (extra === 0 ? 'Perfect' : `Made it, +${extra}`) : 'Lost on the way'}</div>
      {won ? <Way label={same ? 'Your way, and none is shorter' : 'Your way'} codes={mine} /> : null}
      {won && same ? null : <Way label={won ? 'A shorter way' : 'A way there'} codes={shortest} />}
      <div className="purdle-stats">
        <StatText value={today.stats.played} label="Played" />
        <StatText value={today.stats.played ? Math.round((today.stats.wins / today.stats.played) * 100) : 0} label="Win %" />
        <StatText value={today.stats.streak} label="Streak" />
        <StatText value={today.stats.perfect} label="Perfect" />
      </div>
      <ResultActions
        share={travleShare(today)}
        nextAt={today.nextAt}
        what="Next route"
        say={say}
        onClose={travle.close}
        onTurnover={() => void travle.load()}
      />
    </div>
  );
}

function Way({ label, codes }: { label: string; codes: string[] }) {
  return (
    <div className="tv-way">
      <span className="tv-way-label">{label}</span>
      <span>{codes.map(nameOf).join(' → ')}</span>
    </div>
  );
}

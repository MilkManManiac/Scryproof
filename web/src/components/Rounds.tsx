/**
 * Whereabouts and Lowball: five photos a day, one guess each (Wes,
 * 2026-09-29: "add a geoguesser and a house price guesser"). Opened from the
 * games folder in the rail, or `/whereabouts` and `/lowball`.
 *
 * Whereabouts is a street somewhere in the world with a small map in the
 * corner, the way GeoGuessr lays it out: the map grows when you go to it,
 * a click drops your pin, Guess sends it. Lowball is a home, its facts and a
 * box for a price.
 *
 * The server has the places and the prices and sends each only with your
 * guess; this shows what it has been given, and holds each answer up until
 * you move on. The photos come from our own box, never from Panoramax or
 * Redfin.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LOWBALL, ROUND_MAX, ROUNDS_MAX, WHEREABOUTS, parsePrice, priceText, roundsShare, travleCountry } from '@scryproof/shared';
import type { HomeRound, LatLng, LowballToday, RoundsFinish, RoundsGame, RoundsStanding, RoundsToday, WhereRound, WhereToday } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { lowball, whereabouts, type Daily } from '../lib/daily';
import type { Outlines } from '../lib/travle-pin';
import { useStreamZoom, ZOOM_STEP } from '../lib/useStreamZoom';
import { MAX_SCALE } from '../lib/zoom';
import { GameShell, ResultActions, ServerBoard, StatText, useToast, type Say } from './GameShell';
import { Chart, type Frame, type Pin } from './MapChart';

export function WhereaboutsGate() {
  const view = useSyncExternalStore(whereabouts.subscribe, whereabouts.get);
  return view.open ? <Whereabouts today={view.today} /> : null;
}

export function LowballGate() {
  const view = useSyncExternalStore(lowball.subscribe, lowball.get);
  return view.open ? <Lowball today={view.today} /> : null;
}

/* ------------------------------------------------------------ both games */

const thousands = (value: number) => value.toLocaleString('en-US');

/** Scored in kilometres, shown in miles (Wes, 2026-09-30: "we go by freedom units here"). */
function milesOff(km: number): string {
  const miles = Math.round(km / 1.609344);
  return `${thousands(miles)} ${miles === 1 ? 'mile' : 'miles'}`;
}

/** A round's colour, by the same bands as the shared squares. */
const band = (points: number) => (points >= 4500 ? 'b3' : points >= 3000 ? 'b2' : points >= 1000 ? 'b1' : 'b0');

function verdict(score: number): string {
  if (score >= ROUNDS_MAX) return 'Perfect';
  if (score >= 22_000) return 'Superb';
  if (score >= 17_000) return 'Sharp';
  if (score >= 12_000) return 'Good';
  if (score >= 7_000) return 'Not bad';
  return 'Rough';
}

function Pips({ rounds, at }: { rounds: { points: number | null }[]; at: number }) {
  return (
    <div className="tw-pips rd-pips" aria-label="The five rounds">
      {Array.from({ length: 5 }, (_, index) => {
        const points = rounds[index]?.points ?? null;
        return (
          <span
            key={index}
            className={`tw-pip${points === null ? '' : ` ${band(points)}`}${index === at ? ' here' : ''}`}
            title={points === null ? undefined : `${thousands(points)} points`}
          >
            {points === null ? index + 1 : (points / 1000).toFixed(1)}
          </span>
        );
      })}
    </div>
  );
}

/** The part both games share: the card, the pips, a round at a time, the result, the board. */
function RoundsCard<Round extends { points: number | null }>({
  game,
  store,
  today,
  kind,
  load,
  renderRound,
  recap,
  what,
}: {
  game: RoundsGame;
  store: Daily<RoundsToday<Round>>;
  today: RoundsToday<Round> | null;
  kind: string;
  load: (serverId: string) => Promise<{ day: number; finishes: RoundsFinish[]; standings: RoundsStanding[] }>;
  renderRound: (props: { round: Round; number: number; last: boolean; say: Say; onShown: () => void; onNext: () => void }) => ReactNode;
  recap: (round: Round) => { main: string; aside: string };
  what: string;
}) {
  const { toast, say } = useToast();
  /** The round on screen. It stays on one just guessed until you move on. */
  const [at, setAt] = useState<number | null>(null);
  const name = game === 'whereabouts' ? WHEREABOUTS.name : LOWBALL.name;

  const day = today?.day;
  useEffect(() => setAt(null), [day]);

  const rounds = today?.rounds ?? [];
  const open = rounds.findIndex((round) => round.points === null);
  const showing = at ?? (open >= 0 ? open : rounds.length);
  const round = rounds[showing];

  return (
    <GameShell game={game} name={name} kind={`rd ${kind}`} day={today?.day ?? null} toast={toast} loading={today === null} onClose={store.close}>
      {today === null ? null : (
        <>
          <Pips rounds={rounds} at={round ? showing : -1} />
          {round ? (
            <div className="rd-round" key={showing}>
              {renderRound({
                round,
                number: showing + 1,
                last: showing === 4,
                say,
                onShown: () => setAt(showing),
                onNext: () => setAt(showing + 1),
              })}
            </div>
          ) : (
            <div className="purdle-result">
              <div className="purdle-verdict">
                {verdict(today.score)}
                <span className="tw-total">
                  {thousands(today.score)}/{thousands(ROUNDS_MAX)}
                </span>
              </div>
              <ul className="tw-recap rd-recap">
                {rounds.map((entry, index) => {
                  const line = recap(entry);
                  return (
                    <li key={index}>
                      <span className={`tw-pip ${band(entry.points ?? 0)}`}>{((entry.points ?? 0) / 1000).toFixed(1)}</span>
                      <span className="tw-recap-answer">{line.main}</span>
                      <span className="tw-recap-category">{line.aside}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="purdle-stats">
                <StatText value={today.stats.played} label="Played" />
                <StatText value={today.stats.average === null ? '–' : thousands(today.stats.average)} label="Average" />
                <StatText value={thousands(today.stats.best)} label="Best" />
              </div>
              <ResultActions
                share={roundsShare(game, today.day, rounds.map((entry) => entry.points ?? 0))}
                nextAt={today.nextAt}
                what={what}
                say={say}
                onClose={store.close}
                onTurnover={() => void store.load()}
              />
            </div>
          )}
          <ServerBoard
            game={store}
            load={load}
            day={today.day}
            mine={today.state}
            finishes={(result) =>
              [...result.finishes]
                .sort((a, b) => b.score - a.score)
                .map((entry) => ({
                  userId: entry.userId,
                  note: entry.points.map((points) => (points / 1000).toFixed(1)).join(' '),
                  score: thousands(entry.score),
                }))
            }
            columns={['Points', 'Days', 'Avg', 'Best']}
            standings={(result) =>
              [...result.standings]
                .sort((a, b) => b.total - a.total || (b.average ?? 0) - (a.average ?? 0))
                .map((entry) => ({
                  userId: entry.userId,
                  cells: [thousands(entry.total), entry.played, entry.average === null ? '–' : thousands(entry.average), thousands(entry.best)],
                }))
            }
          />
        </>
      )}
    </GameShell>
  );
}

/**
 * A photo that zooms like a stream does: the wheel, a drag once zoomed,
 * two fingers, a double-click, and the − % + in its corner.
 */
function ZoomPhoto({ src, size, alt, children }: { src: string; size: { width: number; height: number } | null; alt: string; children?: ReactNode }) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const zoom = useStreamZoom(size ?? natural, src);
  return (
    <div className="rd-photo">
      <div
        ref={zoom.frameRef}
        className={`rd-photo-frame${zoom.zoomed ? ' zoomed' : ''}${zoom.dragging ? ' dragging' : ''}`}
        title={zoom.zoomed ? undefined : 'Scroll or double-click to zoom in'}
        {...zoom.handlers}
      >
        <div className="rd-photo-layer" style={{ transform: `translate(${zoom.view.x}px, ${zoom.view.y}px) scale(${zoom.view.scale})` }}>
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        </div>
      </div>
      <div className="rd-zoom">
        <button type="button" title="Zoom out" aria-label="Zoom out" disabled={!zoom.zoomed} onClick={() => zoom.zoomBy(1 / ZOOM_STEP)}>
          &minus;
        </button>
        <button type="button" className="level" title="Back to the whole photo" disabled={!zoom.zoomed} onClick={zoom.reset}>
          {Math.round(zoom.view.scale * 100)}%
        </button>
        <button type="button" title="Zoom in" aria-label="Zoom in" disabled={zoom.view.scale >= MAX_SCALE} onClick={() => zoom.zoomBy(ZOOM_STEP)}>
          +
        </button>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ Whereabouts */

const countryName = (code: string | null) => (code ? (travleCountry(code)?.name ?? null) : null);

/** "CC-BY-SA-4.0" as people write it: "CC BY-SA 4.0". */
const licenseText = (license: string) => license.replace(/^CC-/, 'CC ').replace(/-(\d)/, ' $1');

/** The photo's page on Panoramax, for a look at the street around it once the round is over. */
function viewerUrl(source: string): string {
  try {
    const url = new URL(source);
    const id = /\/items\/([^/?#]+)/.exec(url.pathname)?.[1];
    return id ? `${url.origin}/#focus=pic&pic=${id}` : url.origin;
  } catch {
    return 'https://panoramax.xyz';
  }
}

function Whereabouts({ today }: { today: WhereToday | null }) {
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  useEffect(() => {
    let live = true;
    void import('../lib/travle-map').then((loaded) => live && setOutlines(loaded.TRAVLE_MAP as Outlines));
    return () => {
      live = false;
    };
  }, []);

  return (
    <RoundsCard
      game="whereabouts"
      store={whereabouts}
      today={today}
      kind="rd-where"
      load={api.whereabouts.server}
      what="New places"
      renderRound={(props) => <WhereRoundView key={props.round.photo} {...props} outlines={outlines} />}
      recap={(round) => ({
        main: countryName(round.answer?.country ?? null) ?? 'Somewhere',
        aside: round.km === null ? '' : `${milesOff(round.km)} off`,
      })}
    />
  );
}

/** The whole world, three wide and two high like every map here. */
const WORLD: Frame = { x: -180, y: -120, width: 360, height: 240 };
/**
 * The map in the corner is wider than that: from the top of Greenland to
 * Cape Horn and no further, twelve wide and five high to match its box
 * (`.rd-minimap .tv-map`), so none of it is empty sea.
 */
const WORLD_WIDE: Frame = { x: -180, y: -86, width: 360, height: 150 };

/** A frame around both pins, never tighter than a small country. */
function frameAround(a: LatLng, b: LatLng): Frame {
  const [left, right] = [Math.min(a.lng, b.lng), Math.max(a.lng, b.lng)];
  const [top, bottom] = [Math.min(-a.lat, -b.lat), Math.max(-a.lat, -b.lat)];
  let width = Math.max(8, (right - left) * 1.5);
  let height = Math.max(5, (bottom - top) * 1.5);
  if (width / height > 1.5) height = width / 1.5;
  else width = height * 1.5;
  if (width > WORLD.width) return WORLD;
  // A pin stands up from its spot, name and all: a little more room above than below.
  return { x: (left + right) / 2 - width / 2, y: (top + bottom) / 2 - height / 2 - height * 0.06, width, height };
}

function WhereRoundView({
  round,
  number,
  last,
  say,
  onShown,
  onNext,
  outlines,
}: {
  round: WhereRound;
  number: number;
  last: boolean;
  say: Say;
  onShown: () => void;
  onNext: () => void;
  outlines: Outlines | null;
}) {
  const [pick, setPick] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  /** On a phone there is no hover to grow the map: a button opens it. */
  const [mapOpen, setMapOpen] = useState(false);
  const next = useRef<HTMLButtonElement>(null);
  const closed = round.points !== null;

  useEffect(() => {
    if (closed) next.current?.focus();
  }, [closed]);

  async function guess() {
    if (!pick || busy || closed) return;
    setBusy(true);
    onShown();
    try {
      const after = await api.whereabouts.guess(pick);
      whereabouts.apply(after);
      const points = after.rounds[number - 1]?.points ?? 0;
      say(`+${thousands(points)}`, points >= 2500);
    } catch (problem) {
      say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const land = useMemo(
    () => (outlines ? Object.entries(outlines).map(([code, shape]) => <path key={code} d={shape.d} className={`land${closed && round.answer?.country === code ? ' end' : ''}`} />) : null),
    [outlines, closed, round.answer?.country],
  );

  const mine = closed ? round.guess : pick;
  const truth = round.answer;
  const pins: Pin[] = [];
  if (mine) pins.push({ code: 'mine', name: closed ? 'You' : '', x: mine.lng, y: -mine.lat, kind: 'rd-mine' });
  if (truth) pins.push({ code: 'truth', name: countryName(truth.country) ?? 'Here', x: truth.lng, y: -truth.lat, kind: 'rd-truth' });

  const map = outlines ? (
    <Chart
      key={closed ? 'after' : 'before'}
      frame={closed && mine && truth ? frameAround(mine, truth) : WORLD_WIDE}
      pins={pins}
      label={closed ? 'Where you guessed, and where it was' : 'Click where you think this is'}
      fitLabel="Back to the whole map"
      onPick={
        closed
          ? undefined
          : ({ x, y }) => setPick({ lat: Math.max(-85, Math.min(85, -y)), lng: ((((x + 180) % 360) + 360) % 360) - 180 })
      }
    >
      {land}
      {closed && mine && truth ? <line className="rd-line" x1={mine.lng} y1={-mine.lat} x2={truth.lng} y2={-truth.lat} /> : null}
    </Chart>
  ) : (
    <div className="tv-map loading">
      <div className="spinner" />
    </div>
  );

  if (closed && truth) {
    return (
      <>
        <div className={`tw-answer rd-answer ${band(round.points!)}`}>
          <span className="tw-answer-label">+{thousands(round.points!)}</span>
          <span className="tw-answer-text">
            {countryName(truth.country) ?? 'Out there'}
            <span className="rd-answer-sub">{round.km !== null && round.km < 1 ? 'Right on it' : `${milesOff(round.km ?? 0)} away`}</span>
          </span>
          <button type="button" ref={next} className="button inline" onClick={onNext}>
            {last ? 'See how you did' : 'Next place'}
          </button>
        </div>
        <div className="rd-after">
          {map}
          <ZoomPhoto src={round.photo} size={round} alt={`Photo ${number}`} />
        </div>
        <p className="rd-credit">
          Photo {truth.credit ? `by ${truth.credit}, ` : ''}
          {licenseText(truth.license)}, from{' '}
          <a href={viewerUrl(truth.source)} target="_blank" rel="noreferrer noopener">
            Panoramax
          </a>
          {truth.captured ? `, ${truth.captured.slice(0, 7)}` : ''}
        </p>
      </>
    );
  }

  return (
    <>
      <ZoomPhoto src={round.photo} size={round} alt={`Photo ${number}: where is this?`}>
        <div className={`rd-minimap${mapOpen ? ' open' : ''}${pick ? ' picked' : ''}`}>
          {map}
          <div className="rd-minimap-bar">
            <button type="button" className="button inline" disabled={!pick || busy} onClick={() => void guess()}>
              {pick ? 'Guess' : 'Click the map'}
            </button>
          </div>
        </div>
        <button type="button" className="button secondary inline rd-map-toggle" onClick={() => setMapOpen((was) => !was)}>
          {mapOpen ? 'Photo' : 'Map'}
        </button>
      </ZoomPhoto>
    </>
  );
}

/* ----------------------------------------------------------------- Lowball */

function Lowball({ today }: { today: LowballToday | null }) {
  return (
    <RoundsCard
      game="lowball"
      store={lowball}
      today={today}
      kind="rd-home"
      load={api.lowball.server}
      what="New homes"
      renderRound={(props) => <HomeRoundView key={props.round.photos[0]} {...props} />}
      recap={(round) => ({
        main: round.answer ? priceText(round.answer.price) : '',
        aside: `${round.city}, ${round.state}${round.guess === null ? '' : ` · you said ${priceText(round.guess)}`}`,
      })}
    />
  );
}

function facts(round: HomeRound): string[] {
  const out: string[] = [];
  if (round.beds !== null) out.push(`${round.beds} bed${round.beds === 1 ? '' : 's'}`);
  if (round.baths !== null) out.push(`${round.baths} bath${round.baths === 1 ? '' : 's'}`);
  if (round.sqft !== null) out.push(`${thousands(round.sqft)} sq ft`);
  if (round.lotSqft !== null) {
    const acres = round.lotSqft / 43_560;
    out.push(acres >= 0.25 ? `${acres >= 10 ? Math.round(acres) : acres.toFixed(acres >= 1 ? 1 : 2)} acre lot` : `${thousands(round.lotSqft)} sq ft lot`);
  }
  if (round.yearBuilt !== null) out.push(`built ${round.yearBuilt}`);
  return out;
}

/** "16% low", "2.3× high", "spot on". */
function howFar(guess: number, price: number): string {
  const ratio = guess / price;
  if (Math.abs(ratio - 1) < 0.005) return 'spot on';
  if (ratio >= 2 || ratio <= 0.5) return ratio > 1 ? `${ratio.toFixed(1)}× too high` : `${(1 / ratio).toFixed(1)}× too low`;
  return `${Math.round(Math.abs(ratio - 1) * 100)}% ${ratio > 1 ? 'high' : 'low'}`;
}

function HomeRoundView({
  round,
  number,
  last,
  say,
  onShown,
  onNext,
}: {
  round: HomeRound;
  number: number;
  last: boolean;
  say: Say;
  onShown: () => void;
  onNext: () => void;
}) {
  const [photo, setPhoto] = useState(0);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const closed = round.points !== null;
  const price = parsePrice(typed);

  useEffect(() => {
    if (closed) next.current?.focus();
    else input.current?.focus();
  }, [closed]);

  async function guess() {
    if (busy || closed) return;
    if (price === null) {
      setShaking(true);
      setTimeout(() => setShaking(false), 450);
      return;
    }
    setBusy(true);
    onShown();
    try {
      const after = await api.lowball.guess(price);
      lowball.apply(after);
      const points = after.rounds[number - 1]?.points ?? 0;
      say(`+${thousands(points)}`, points >= 2500);
    } catch (problem) {
      say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rd-home-where">
        <b>
          {round.city}, {round.state}
        </b>
        <span>{round.propertyType}</span>
      </div>
      <ZoomPhoto src={round.photos[photo]!} size={null} alt={`Home ${number}, photo ${photo + 1} of ${round.photos.length}`} />
      <div className="rd-thumbs" role="tablist" aria-label="Photos of this home">
        {round.photos.map((src, index) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={index === photo}
            aria-label={`Photo ${index + 1}`}
            className={`rd-thumb${index === photo ? ' on' : ''}`}
            onClick={() => setPhoto(index)}
          >
            <img src={src} alt="" draggable={false} />
          </button>
        ))}
      </div>
      <div className="rd-facts">
        {facts(round).map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </div>

      {closed && round.answer ? (
        <div className={`tw-answer rd-answer ${band(round.points!)}`}>
          <span className="tw-answer-label">+{thousands(round.points!)}</span>
          <span className="tw-answer-text">
            {priceText(round.answer.price)}
            <span className="rd-answer-sub">
              {round.answer.priceKind === 'sold' ? `Sold${round.answer.soldDate ? ` ${round.answer.soldDate.slice(0, 7)}` : ''}` : 'Asking price'}
              {round.guess === null ? '' : `. You said ${priceText(round.guess)}, ${howFar(round.guess, round.answer.price)}.`}
            </span>
          </span>
          <button type="button" ref={next} className="button inline" onClick={onNext}>
            {last ? 'See how you did' : 'Next home'}
          </button>
        </div>
      ) : (
        <form
          className={`tw-form rd-price${shaking ? ' shake' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            void guess();
          }}
        >
          <input
            ref={input}
            className="game-input"
            value={typed}
            inputMode="decimal"
            maxLength={20}
            placeholder="What did it go for? 450k, 1.2m…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button type="submit" className="button inline" disabled={busy || price === null}>
            Guess
          </button>
          <span className="rd-price-read" aria-live="polite">
            {typed.trim() ? (price === null ? 'Not a price yet' : priceText(price)) : `Up to ${thousands(ROUND_MAX)} points`}
          </span>
        </form>
      )}
    </>
  );
}

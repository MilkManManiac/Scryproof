/**
 * Purdle: Wordle, for everyone on this instance, one word a day (Wes,
 * 2026-09-27: "Make a game called purdle that acts like wordle that everyone
 * can play once a day").
 *
 * The rules live here so the server (which knows the answer and checks every
 * guess) and the app (which draws the board) cannot disagree. The answer never
 * reaches a device before its owner has finished the day.
 *
 * One day for everybody, cut at midnight Eastern: the group is in one place,
 * and a word that changes at different times for different people is a word
 * someone spoils.
 */

export type PurdleMark = 'hit' | 'near' | 'miss';

export const PURDLE = {
  length: 5,
  tries: 6,
  zone: 'America/New_York',
  /** Purdle #1. */
  firstDay: '2026-09-27',
} as const;

/**
 * Wordle's marking, repeated letters included: a letter is `hit` in the right
 * place, `near` if the answer has one more of it not already accounted for,
 * `miss` otherwise. Guess "speed" against "abide": the first e is `near`, the
 * second a `miss`, because "abide" has one e.
 */
export function markGuess(guess: string, answer: string): PurdleMark[] {
  const marks: PurdleMark[] = Array.from({ length: guess.length }, () => 'miss');
  const spare = new Map<string, number>();
  for (let at = 0; at < guess.length; at += 1) {
    if (guess[at] === answer[at]) marks[at] = 'hit';
    else spare.set(answer[at]!, (spare.get(answer[at]!) ?? 0) + 1);
  }
  for (let at = 0; at < guess.length; at += 1) {
    if (marks[at] === 'hit') continue;
    const left = spare.get(guess[at]!) ?? 0;
    if (left > 0) {
      marks[at] = 'near';
      spare.set(guess[at]!, left - 1);
    }
  }
  return marks;
}

/** The calendar date in `zone`, as `YYYY-MM-DD`. */
function dateIn(zone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function utcDays(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Which day of a daily game it is at this moment, counting `first` as 1.
 * Every daily game here turns over at the same midnight, Purdle's.
 */
export function dailyNumber(first: string, at: Date = new Date()): number {
  return utcDays(dateIn(PURDLE.zone, at)) - utcDays(first) + 1;
}

/** Which Purdle it is at this moment: 1 on the first day. */
export function purdleDay(at: Date = new Date()): number {
  return dailyNumber(PURDLE.firstDay, at);
}

/** Minutes `zone` is ahead of UTC at this moment (negative in America). */
function offsetMinutes(zone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** When the next Purdle starts: the coming midnight in the zone, clock changes included. */
export function nextPurdleAt(at: Date = new Date()): Date {
  const midnight = (utcDays(dateIn(PURDLE.zone, at)) + 1) * 86_400_000;
  let guess = midnight - offsetMinutes(PURDLE.zone, at) * 60_000;
  // On the night the clocks change, midnight is on the other side of it.
  guess = midnight - offsetMinutes(PURDLE.zone, new Date(guess)) * 60_000;
  return new Date(guess);
}

/** The line under a finished board, by how many tries it took. */
export const PURDLE_PRAISE = ['Unreal', 'Brilliant', 'Sharp', 'Solid', 'Close one', 'Phew'] as const;

/**
 * What "Share" copies: the colours and nothing else, so it can go straight
 * into chat without giving the word away. The squares are the format every
 * Wordle player already reads.
 */
export function purdleShare(day: number, rows: readonly (readonly PurdleMark[])[], solved: boolean): string {
  const square = { hit: '🟩', near: '🟨', miss: '⬛' } as const;
  const grid = rows.map((row) => row.map((mark) => square[mark]).join('')).join('\n');
  return `Purdle ${day} ${solved ? rows.length : 'X'}/${PURDLE.tries}\n\n${grid}`;
}

export interface PurdleGuess {
  word: string;
  marks: PurdleMark[];
}

export interface PurdleStats {
  /** Days finished, won or lost. */
  played: number;
  wins: number;
  /** Days won in a row, up to today (or yesterday, while today is still open). */
  streak: number;
  best: number;
  /** How many wins took 1, 2, ... 6 tries. */
  spread: number[];
}

/** Your day, as the server has it. `answer` only once you have finished. */
export interface PurdleToday {
  day: number;
  guesses: PurdleGuess[];
  state: 'playing' | 'won' | 'lost';
  answer: string | null;
  /** When the next word starts, ISO. */
  nextAt: string;
  stats: PurdleStats;
}

/**
 * Someone's record since they started, for the all-time board. `averageTries`
 * counts wins only (a loss has no number of tries); null before the first win.
 */
export interface PurdleStanding {
  userId: string;
  played: number;
  wins: number;
  streak: number;
  best: number;
  averageTries: number | null;
}

export function purdleStanding(userId: string, stats: PurdleStats): PurdleStanding {
  const tries = stats.spread.reduce((sum, count, at) => sum + count * (at + 1), 0);
  return {
    userId,
    played: stats.played,
    wins: stats.wins,
    streak: stats.streak,
    best: stats.best,
    averageTries: stats.wins ? Math.round((tries / stats.wins) * 100) / 100 : null,
  };
}

/** Someone in a server who has finished today's word. Never their letters. */
export interface PurdleFinish {
  userId: string;
  tries: number;
  solved: boolean;
  streak: number;
}

/**
 * Streak and totals from someone's finished days. `days` maps a day number
 * to whether it was won. A lost or missed day breaks the streak; today not
 * yet played does not.
 */
export function purdleStats(days: ReadonlyMap<number, { solved: boolean; tries: number }>, today: number): PurdleStats {
  const spread = Array.from({ length: PURDLE.tries }, () => 0);
  let wins = 0;
  for (const entry of days.values()) {
    if (!entry.solved) continue;
    wins += 1;
    spread[entry.tries - 1]! += 1;
  }

  let streak = 0;
  let day = days.get(today)?.solved ? today : today - 1;
  while (days.get(day)?.solved) {
    streak += 1;
    day -= 1;
  }

  let best = 0;
  let run = 0;
  const ordered = [...days.keys()].sort((a, b) => a - b);
  let previous = Number.NaN;
  for (const number of ordered) {
    run = days.get(number)!.solved ? (number === previous + 1 ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    previous = number;
  }

  return { played: days.size, wins, streak, best: Math.max(best, streak), spread };
}

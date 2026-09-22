/**
 * `/roll` parsing and rolling.
 *
 * Parsing is pure and has no opinion about where the numbers come from.
 * Rolling takes a die-roller as an argument rather than reaching for
 * `Math.random` itself, so a test can fix the outcome and the server can hand
 * it something backed by real entropy. Nothing here is trustworthy on its
 * own: the server is the one that calls `roll`, and the client only ever
 * sees the result it sends back.
 */

export const DICE_LIMITS = {
  /** Across every dice term in one roll, not per term. */
  maxDice: 100,
  minSides: 2,
  maxSides: 1000,
} as const;

const PARSE_ERROR = 'That is not a roll I understand. Try 2d6+3.';

export type DiceTerm = {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  /** `kh3` keeps the three highest, `kl1` the one lowest, and so on. */
  keep?: { mode: 'kh' | 'kl'; count: number };
};

export type FlatTerm = { kind: 'flat'; sign: 1 | -1; value: number };

export type RollTerm = DiceTerm | FlatTerm;

export interface ParsedRoll {
  /** The expression normalised back to text, for what gets stored and shown. */
  text: string;
  terms: RollTerm[];
}

export type ParseRollResult = { ok: true; roll: ParsedRoll } | { ok: false; error: string };

/**
 * One term: a sign, then either a dice term (`2d6`, `d20`, `4d6kh3`),
 * `adv`/`dis`, or a flat number. Only the very first term (anchored with `^`)
 * may omit its sign; every term after it needs an explicit `+` or `-`, so
 * `d6 d4` is refused rather than read as `d6+d4`. Whitespace is allowed
 * around a sign; a gap anywhere else falls through as unmatched text.
 */
const TERM_SOURCE = String.raw`(?:^|\s*([+-])\s*)(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(adv|dis)|(\d+))`;

function diceTermText(term: DiceTerm): string {
  const keep = term.keep ? `${term.keep.mode}${term.keep.count}` : '';
  return `${term.count}d${term.sides}${keep}`;
}

function termText(term: RollTerm, first: boolean): string {
  const sign = term.sign === -1 ? '-' : first ? '' : '+';
  const body = term.kind === 'flat' ? String(term.value) : diceTermText(term);
  return `${sign}${body}`;
}

export function parseRoll(input: string): ParseRollResult {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: PARSE_ERROR };

  const pattern = new RegExp(TERM_SOURCE, 'gi');
  const terms: RollTerm[] = [];
  let cursor = 0;
  let totalDice = 0;

  for (const match of trimmed.matchAll(pattern)) {
    const at = match.index ?? 0;
    // A gap here is a character the pattern could not absorb into a sign or a
    // term, which means the roll is not shaped the way we understand it.
    if (at !== cursor) return { ok: false, error: PARSE_ERROR };
    cursor = at + match[0].length;

    const sign: 1 | -1 = match[1] === '-' ? -1 : 1;
    const sides = match[3];
    const shorthand = match[6];
    const flat = match[7];

    if (sides !== undefined) {
      const count = match[2] ? Number(match[2]) : 1;
      const sidesN = Number(sides);
      if (count < 1 || count > DICE_LIMITS.maxDice) {
        return { ok: false, error: `A roll can use at most ${DICE_LIMITS.maxDice} dice.` };
      }
      if (sidesN < DICE_LIMITS.minSides || sidesN > DICE_LIMITS.maxSides) {
        return {
          ok: false,
          error: `Dice sides must be between ${DICE_LIMITS.minSides} and ${DICE_LIMITS.maxSides}.`,
        };
      }
      totalDice += count;

      let keep: DiceTerm['keep'];
      const keepMode = match[4] as 'kh' | 'kl' | undefined;
      if (keepMode) {
        const keepCount = match[5] ? Number(match[5]) : NaN;
        if (!(keepCount >= 1) || keepCount > count) return { ok: false, error: PARSE_ERROR };
        keep = { mode: keepMode, count: keepCount };
      }

      terms.push({ kind: 'dice', sign, count, sides: sidesN, keep });
      continue;
    }

    if (shorthand !== undefined) {
      // adv/dis is 2d20, keep the one that favours or disfavours the roller.
      terms.push({
        kind: 'dice',
        sign,
        count: 2,
        sides: 20,
        keep: { mode: shorthand === 'adv' ? 'kh' : 'kl', count: 1 },
      });
      totalDice += 2;
      continue;
    }

    terms.push({ kind: 'flat', sign, value: Number(flat) });
  }

  if (cursor !== trimmed.length || terms.length === 0) return { ok: false, error: PARSE_ERROR };
  if (totalDice > DICE_LIMITS.maxDice) {
    return { ok: false, error: `A roll can use at most ${DICE_LIMITS.maxDice} dice.` };
  }

  const text = terms.map((term, index) => termText(term, index === 0)).join('');
  return { ok: true, roll: { text, terms } };
}

/** A random integer from 1 to `sides`, inclusive. */
export type DieRoller = (sides: number) => number;

export interface DieResult {
  sides: number;
  value: number;
  /** False for a die a `kh`/`kl` term dropped. It is still shown, just not counted. */
  kept: boolean;
}

export interface TermResult {
  sign: 1 | -1;
  dice: DieResult[];
  flat?: number;
}

export interface RollResult {
  total: number;
  terms: TermResult[];
}

export function roll(parsed: ParsedRoll, random: DieRoller): RollResult {
  let total = 0;
  const terms: TermResult[] = parsed.terms.map((term) => {
    if (term.kind === 'flat') {
      total += term.sign * term.value;
      return { sign: term.sign, dice: [], flat: term.value };
    }

    const dice: DieResult[] = Array.from({ length: term.count }, () => ({
      sides: term.sides,
      value: random(term.sides),
      kept: true,
    }));

    if (term.keep) {
      const ranked = [...dice].sort((a, b) => b.value - a.value);
      const kept = new Set(
        term.keep.mode === 'kh' ? ranked.slice(0, term.keep.count) : ranked.slice(-term.keep.count),
      );
      for (const die of dice) die.kept = kept.has(die);
    }

    const sum = dice.filter((die) => die.kept).reduce((acc, die) => acc + die.value, 0);
    total += term.sign * sum;
    return { sign: term.sign, dice };
  });

  return { total, terms };
}

/**
 * The line stored and shown for a roll: the expression, the total, every
 * face rolled (a dropped `kh`/`kl` die in parentheses), and any flat
 * modifiers spelled out at the end.
 */
export function formatRoll(parsed: ParsedRoll, result: RollResult): string {
  const faces = result.terms
    .flatMap((term) => term.dice.map((die) => (die.kept ? `${die.value}` : `(${die.value})`)))
    .join(', ');

  const modifiers = result.terms
    .filter((term) => term.flat !== undefined)
    .map((term) => ` ${term.sign === -1 ? '-' : '+'}${term.flat}`)
    .join('');

  return `${parsed.text} = ${result.total}${faces ? `  [${faces}]` : ''}${modifiers}`;
}

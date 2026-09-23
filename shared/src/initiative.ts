/**
 * The initiative tracker's turn arithmetic.
 *
 * Pure, like `dice.ts` and `polls.ts`: no database, no clock, no randomness.
 * The server calls these to change a tracker and stores what comes back; the
 * client only draws what the server sends. Keeping the rules here means the
 * one test file can pin down every edge (the wrap into a new round, a
 * removal on the current turn, a newcomer who rolled higher than whoever is
 * acting) without a request in sight.
 */

import type { Snowflake, Timestamp } from './types.js';

export const INITIATIVE_LIMITS = {
  /** A big fight, not an army. Past this the list stops being readable. */
  maxEntries: 40,
  name: { min: 1, max: 40 },
  note: { max: 80 },
  /** For a number typed in. A roll's total is whatever the dice said. */
  initiative: { min: -99, max: 999 },
} as const;

export interface TrackerEntry {
  id: string;
  name: string;
  /** The member this combatant is, or null for a monster or anyone else. */
  userId: Snowflake | null;
  initiative: number;
  /** A roll written out (`1d20+3 = 15  [12] +3`) so the table can trust it, or empty. */
  note: string;
}

/** One channel's tracker, whole, as every viewer of the channel sees it. */
export interface Tracker {
  channelId: Snowflake;
  startedBy: Snowflake;
  /** Starts at 1. */
  round: number;
  /** Index into `entries` of whoever is acting now. */
  turn: number;
  entries: TrackerEntry[];
  updatedAt: Timestamp;
}

export interface TurnState {
  round: number;
  turn: number;
  entries: TrackerEntry[];
}

/** Whoever is acting now, or null when nobody is in the order. */
export function currentEntry(state: TurnState): TrackerEntry | null {
  return state.entries[state.turn] ?? null;
}

/**
 * Before anyone has had a go, the turn belongs to the top of the order,
 * whoever that turns out to be once everyone has rolled. After that it
 * belongs to a person, and changes to the list must not hand it to someone
 * else.
 */
function stillSettingUp(state: TurnState): boolean {
  return state.round === 1 && state.turn === 0;
}

/** Keeps `turn` in range. An empty order has turn 0. */
function clampTurn(turn: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(0, turn), length - 1);
}

/** The next turn, and a new round when the last in the order has gone. */
export function nextTurn(state: TurnState): { round: number; turn: number } {
  if (state.entries.length === 0) return { round: state.round, turn: 0 };
  const turn = state.turn + 1;
  if (turn >= state.entries.length) return { round: state.round + 1, turn: 0 };
  return { round: state.round, turn };
}

/**
 * A newcomer goes after everyone with a higher initiative and after anyone
 * already there with the same number, so a tie is settled by who was in
 * first. Whoever was acting keeps the turn: someone who joins mid-round with
 * a higher number acts from the next round on, not by stealing this one.
 */
export function insertByInitiative(state: TurnState, entry: TrackerEntry): { entries: TrackerEntry[]; turn: number } {
  const at = state.entries.findIndex((existing) => existing.initiative < entry.initiative);
  const index = at === -1 ? state.entries.length : at;
  const entries = [...state.entries.slice(0, index), entry, ...state.entries.slice(index)];

  if (stillSettingUp(state) || state.entries.length === 0) return { entries, turn: 0 };
  const turn = index <= state.turn ? state.turn + 1 : state.turn;
  return { entries, turn };
}

/**
 * Take someone out of the order. If it was their turn, it passes to whoever
 * was next, which is a new round if they were last. Returns null when there
 * is nobody by that id.
 */
export function removeEntry(state: TurnState, id: string): TurnState | null {
  const index = state.entries.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const entries = state.entries.filter((entry) => entry.id !== id);

  if (entries.length === 0) return { round: state.round, turn: 0, entries };
  if (index < state.turn) return { round: state.round, turn: state.turn - 1, entries };
  if (index === state.turn && index >= entries.length) {
    // The last in the order left on their own turn: the top of the next round is up.
    return { round: state.round + 1, turn: 0, entries };
  }
  return { round: state.round, turn: clampTurn(state.turn, entries.length), entries };
}

/**
 * Put the same people in a new order, given as their ids. Whoever was acting
 * keeps the turn wherever they land, except while setting up, when the turn
 * stays at the top. Returns null unless `ids` names every entry exactly once:
 * a reorder is not a way to add or drop anyone.
 */
export function reorderEntries(state: TurnState, ids: readonly string[]): { entries: TrackerEntry[]; turn: number } | null {
  if (ids.length !== state.entries.length || new Set(ids).size !== ids.length) return null;
  const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
  const entries: TrackerEntry[] = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) return null;
    entries.push(entry);
  }

  if (stillSettingUp(state)) return { entries, turn: 0 };
  const acting = currentEntry(state);
  const turn = acting ? entries.findIndex((entry) => entry.id === acting.id) : 0;
  return { entries, turn: clampTurn(turn, entries.length) };
}

/** "Initiative ended after 4 rounds." The round in progress counts as one. */
export function endedLine(round: number): string {
  return `Initiative ended after ${round} ${round === 1 ? 'round' : 'rounds'}.`;
}

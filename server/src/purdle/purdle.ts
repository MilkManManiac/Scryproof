/**
 * Which word is Purdle's on a given day.
 *
 * The answers, in an order shuffled once with a key derived from the
 * server's session secret, then one a day down the list. The list is in the
 * public source; the order is not, so nobody can read tomorrow's word off the
 * code, and nothing about the answer reaches a device before its owner has
 * finished the day.
 */

import { createHmac } from 'node:crypto';

import { config } from '../config.js';
import { ANSWERS } from './answers.js';

let order: string[] | null = null;

function shuffled(): string[] {
  if (order) return order;
  const list = [...ANSWERS];
  // Fisher-Yates, with each swap drawn from the secret rather than Math.random.
  for (let at = list.length - 1; at > 0; at -= 1) {
    const draw = createHmac('sha256', config.sessionSecret).update(`purdle-order:${at}`).digest().readUInt32BE(0);
    const other = draw % (at + 1);
    [list[at], list[other]] = [list[other]!, list[at]!];
  }
  order = list;
  return list;
}

export function answerFor(day: number): string {
  const list = shuffled();
  return list[(((day - 1) % list.length) + list.length) % list.length]!;
}

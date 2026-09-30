/**
 * The pins on Travhole's two ends. A pin in the sea, or on the neighbour,
 * points a player who does not know the country at the wrong place, which is
 * worse than no pin.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { TRAVLE_MAP } from '../lib/travle-map';
import { across, pinAt, type Outlines } from '../lib/travle-pin';

const outlines = TRAVLE_MAP as Outlines;
const inside = (d: string, x: number, y: number) => across(d, y).some(([a, b]) => x > a && x < b);
/** Countries inside another's outline (Andorra only because France's thinned outline overlaps it). An end is drawn over the rest, so its pin is still on it. */
const WITHIN: Record<string, string> = { LSO: 'ZAF', SMR: 'ITA', VAT: 'ITA', MCO: 'FRA', AND: 'FRA' };

describe('Travhole pins', () => {
  it('puts every country’s pin on that country, and on no other', () => {
    const wrong: string[] = [];
    for (const [code, shape] of Object.entries(outlines)) {
      const { x, y } = pinAt(code, outlines);
      if (!inside(shape.d, x, y)) wrong.push(`${code} off its own land`);
      for (const [other, them] of Object.entries(outlines)) {
        if (other !== code && other !== WITHIN[code] && inside(them.d, x, y)) wrong.push(`${code} on ${other}`);
      }
    }
    assert.deepEqual(wrong, []);
  });

  it('keeps South Africa’s pin out of Lesotho', () => {
    const { x, y } = pinAt('ZAF', outlines);
    assert.ok(!inside(outlines.LSO!.d, x, y));
  });
});

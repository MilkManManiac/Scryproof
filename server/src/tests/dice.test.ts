/**
 * `/roll` parsing and rolling.
 *
 * The roller is pure, so a fixed sequence of "dice" stands in for
 * `crypto.randomInt` and every assertion here is exact rather than a range
 * check.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { formatRoll, parseRoll, roll } from '@scryproof/shared';
import type { DieRoller } from '@scryproof/shared';

/** Hands out the given faces in order, then complains if asked for more. */
function fixedDice(faces: number[]): DieRoller {
  let index = 0;
  return () => {
    const value = faces[index];
    index += 1;
    if (value === undefined) throw new Error('fixedDice ran out of faces');
    return value;
  };
}

describe('parseRoll', () => {
  it('reads NdS with a flat modifier', () => {
    const result = parseRoll('2d6+3');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.roll.text, '2d6+3');
    assert.deepEqual(result.roll.terms, [
      { kind: 'dice', sign: 1, count: 2, sides: 6, keep: undefined },
      { kind: 'flat', sign: 1, value: 3 },
    ]);
  });

  it('defaults the count for a bare dS', () => {
    const result = parseRoll('d20');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.roll.terms, [{ kind: 'dice', sign: 1, count: 1, sides: 20, keep: undefined }]);
  });

  it('reads several terms, mixed signs', () => {
    const result = parseRoll('2d6+1d4-1');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.roll.terms, [
      { kind: 'dice', sign: 1, count: 2, sides: 6, keep: undefined },
      { kind: 'dice', sign: 1, count: 1, sides: 4, keep: undefined },
      { kind: 'flat', sign: -1, value: 1 },
    ]);
  });

  it('reads adv and dis as 2d20 keep highest or lowest', () => {
    const adv = parseRoll('adv');
    assert.equal(adv.ok, true);
    if (adv.ok) {
      assert.deepEqual(adv.roll.terms, [
        { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { mode: 'kh', count: 1 } },
      ]);
      assert.equal(adv.roll.text, '2d20kh1');
    }

    const dis = parseRoll('dis');
    assert.equal(dis.ok, true);
    if (dis.ok) {
      assert.deepEqual(dis.roll.terms, [
        { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { mode: 'kl', count: 1 } },
      ]);
    }
  });

  it('reads keep-highest on an explicit dice term', () => {
    const result = parseRoll('4d6kh3');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.roll.terms, [
      { kind: 'dice', sign: 1, count: 4, sides: 6, keep: { mode: 'kh', count: 3 } },
    ]);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    const result = parseRoll('  2D6 + 3  ');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.roll.text, '2d6+3');
  });

  it('refuses nonsense with a plain-English error', () => {
    for (const bad of ['', 'hello', '2d6x3', 'd6 d4', '2d']) {
      const result = parseRoll(bad);
      assert.equal(result.ok, false, bad);
      if (!result.ok) assert.equal(result.error, 'That is not a roll I understand. Try 2d6+3.');
    }
  });

  it('refuses more than 100 dice, in one term or spread across several', () => {
    assert.equal(parseRoll('101d6').ok, false);
    assert.equal(parseRoll('60d6+60d6').ok, false);
    assert.equal(parseRoll('100d6').ok, true);
  });

  it('refuses sides outside 2 to 1000', () => {
    assert.equal(parseRoll('1d1').ok, false);
    assert.equal(parseRoll('1d1001').ok, false);
    assert.equal(parseRoll('1d2').ok, true);
    assert.equal(parseRoll('1d1000').ok, true);
  });

  it('refuses keeping more dice than were rolled', () => {
    assert.equal(parseRoll('2d6kh3').ok, false);
  });
});

describe('roll', () => {
  it('totals a simple NdS+modifier roll with a fixed die', () => {
    const parsed = parseRoll('2d6+3');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([4, 4]));
    assert.equal(result.total, 11);
    assert.deepEqual(result.terms[0]?.dice.map((die) => die.value), [4, 4]);
    assert.equal(result.terms[1]?.flat, 3);
  });

  it('sums several terms with different signs', () => {
    const parsed = parseRoll('2d6+1d4-1');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    // 2d6 -> 4,4 (8); 1d4 -> 3; flat -1
    const result = roll(parsed.roll, fixedDice([4, 4, 3]));
    assert.equal(result.total, 10);
  });

  it('keeps only the highest die for adv, but shows both', () => {
    const parsed = parseRoll('adv');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([5, 17]));
    assert.equal(result.total, 17);
    const dice = result.terms[0]?.dice ?? [];
    assert.deepEqual(
      dice.map((die) => [die.value, die.kept]),
      [
        [5, false],
        [17, true],
      ],
    );
  });

  it('keeps only the lowest die for dis', () => {
    const parsed = parseRoll('dis');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([5, 17]));
    assert.equal(result.total, 5);
  });

  it('keeps the highest three of four for kh3', () => {
    const parsed = parseRoll('4d6kh3');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([6, 1, 4, 5]));
    // Kept: 6, 4, 5 = 15. Dropped: 1.
    assert.equal(result.total, 15);
    const dice = result.terms[0]?.dice ?? [];
    assert.deepEqual(
      dice.map((die) => die.kept),
      [true, false, true, true],
    );
  });
});

describe('formatRoll', () => {
  it('writes the expression, total, faces and modifier plainly', () => {
    const parsed = parseRoll('2d6+3');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([4, 4]));
    assert.equal(formatRoll(parsed.roll, result), '2d6+3 = 11  [4, 4] +3');
  });

  it('parenthesises a die a kh/kl term dropped', () => {
    const parsed = parseRoll('adv');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([5, 17]));
    assert.equal(formatRoll(parsed.roll, result), '2d20kh1 = 17  [(5), 17]');
  });

  it('has no faces line for a purely flat expression', () => {
    // Not a normal /roll, but the formatter should not fall over on it.
    const parsed = parseRoll('5');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = roll(parsed.roll, fixedDice([]));
    assert.equal(formatRoll(parsed.roll, result), '5 = 5 +5');
  });
});

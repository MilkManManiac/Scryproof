/**
 * Lady of the Lake's water map. The picture is checked by eye; this guards
 * the points the scene leans on: the sword comes up on water, every fish
 * lane starts and ends on water, and the stone, the tree and the big column
 * are not water.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isWater } from '../components/lake-scene';

describe('isWater', () => {
  it('holds the pool, the basin and the side channels', () => {
    for (const [x, y] of [
      [705, 626], // where the sword comes up
      [650, 610],
      [560, 260],
      [960, 380],
      [640, 380], // the fountain's basin
      [270, 470],
      [1100, 470],
    ] as const) {
      assert.ok(isWater(x, y), `${x},${y} should be water`);
    }
  });

  it('keeps out stone, the tree, the column and the forest', () => {
    for (const [x, y] of [
      [712, 190], // the tree
      [716, 340], // the fountain's plinth
      [600, 440], // the fountain's rim
      [330, 400], // the big column
      [540, 700], // the carved stone in front
      [1000, 640], // the statue
      [200, 480], // the path
      [700, 60], // the forest
    ] as const) {
      assert.ok(!isWater(x, y), `${x},${y} should not be water`);
    }
  });
});

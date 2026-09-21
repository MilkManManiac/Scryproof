/**
 * Draws the app icon: an amber ring with a dot in it on the app's own dark
 * background. Written out by hand so the icon has no source file anybody has
 * to find later, and no drawing program in the way of changing it.
 *
 *   node desktop/assets/make-icon.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const SIZE = 512;
const BACK = [20, 22, 28];
const AMBER = [232, 166, 66];

const pixels = Buffer.alloc((SIZE * 4 + 1) * SIZE);
const centre = (SIZE - 1) / 2;
/** How much of a pixel is covered, from its signed distance to an edge. */
const cover = (distance) => Math.max(0, Math.min(1, 0.5 - distance));

for (let y = 0; y < SIZE; y += 1) {
  const row = y * (SIZE * 4 + 1);
  pixels[row] = 0;
  for (let x = 0; x < SIZE; x += 1) {
    const dx = Math.abs(x - centre);
    const dy = Math.abs(y - centre);
    // A rounded square, by distance to its corner circles.
    const half = SIZE * 0.46;
    const radius = SIZE * 0.22;
    const qx = Math.max(dx - (half - radius), 0);
    const qy = Math.max(dy - (half - radius), 0);
    const plate = cover(Math.hypot(qx, qy) - radius);

    const r = Math.hypot(x - centre, y - centre);
    const ring = cover(Math.abs(r - SIZE * 0.25) - SIZE * 0.045);
    const dot = cover(r - SIZE * 0.085);
    const mark = Math.max(ring, dot);

    const at = row + 1 + x * 4;
    for (let c = 0; c < 3; c += 1) pixels[at + c] = Math.round(BACK[c] * (1 - mark) + AMBER[c] * mark);
    pixels[at + 3] = Math.round(plate * 255);
  }
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.set([8, 6, 0, 0, 0], 8);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icon.png'), png);
console.log('icon.png written');

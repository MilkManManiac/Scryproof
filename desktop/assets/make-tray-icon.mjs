/**
 * Draws the menu-bar icon for macOS: the app icon's ring and dot, black on
 * transparent. macOS treats an image whose file name ends in `Template` as a
 * template and tints it for the light or dark menu bar, so the colour here
 * does not matter, only the shape (the alpha). `trayTemplate.png` is 16 px and
 * `trayTemplate@2x.png` 32 px; Electron picks the `@2x` file on a Retina bar.
 *
 *   node desktop/assets/make-tray-icon.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
/** Samples per pixel edge, so the ring is smooth at 16 px. */
const SAMPLES = 8;

function draw(size) {
  const scale = size / 16;
  const centre = size / 2;
  const ringRadius = 6.1 * scale;
  const ringHalfWidth = 0.95 * scale;
  const dotRadius = 2 * scale;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const r = Math.hypot(x + (sx + 0.5) / SAMPLES - centre, y + (sy + 0.5) / SAMPLES - centre);
          if (Math.abs(r - ringRadius) <= ringHalfWidth || r <= dotRadius) covered += 1;
        }
      }
      const at = y * (size * 4 + 1) + 1 + x * 4;
      rows[at + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255); // black, with the shape as alpha
    }
  }
  return rows;
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(draw(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(here, 'trayTemplate.png'), png(16));
writeFileSync(join(here, 'trayTemplate@2x.png'), png(32));

// Paints the hall behind the app (web/public/backdrops/hall.svg): a candle-lit
// stone hall with a hearth at the far end and a long table in front of it,
// the room the party meets in. The composition sits in the upper middle and
// the bottom third is dark, because that is where the panels sit. Flat
// shapes, gradients and two small blur filters, the way Hearth's backdrop
// scripts work. Deterministic (seeded PRNG), so running it twice writes the
// same bytes and the repo does not churn.
//
//   node web/scripts/gen-backdrop.mjs
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'backdrops', 'hall.svg');

const W = 2560;
const H = 1440;

// The hearth is the one bright thing. Everything else leads the eye to it.
const HEARTH_X = 1280;
const HEARTH_FLOOR = 800;

// Mulberry32: a tiny seeded PRNG. No Math.random anywhere in this file.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

// ---- the back wall: coursed stone ------------------------------------------
// Low contrast on purpose. The wall gets dimmed three stops under the panels,
// so anything busier than a faint grid would either vanish or fight the UI.
function masonry() {
  const rand = rng(0x5701e);
  const tints = ['#241a14', '#281d17', '#211811', '#2b2019', '#1f1610'];
  const out = [];
  const rowH = 58;
  let row = 0;
  for (let y = 170; y < HEARTH_FLOOR + 30; y += rowH, row += 1) {
    let x = row % 2 === 0 ? 0 : -70 - rand() * 60;
    while (x < W) {
      const w = 110 + rand() * 70;
      const fill = tints[Math.floor(rand() * tints.length)];
      out.push(
        `<rect x="${r2(x + 2)}" y="${r2(y + 2)}" width="${r2(w - 4)}" height="${rowH - 4}" rx="2" fill="${fill}"/>`,
      );
      x += w;
    }
  }
  return out.join('\n    ');
}

// ---- a candle: stick, flame, and the glow it throws ------------------------
function candle(x, y, h, scale = 1) {
  const w = 12 * scale;
  return `
    <circle cx="${r2(x)}" cy="${r2(y - h - 6)}" r="${r2(70 * scale)}" fill="url(#cglow)"/>
    <rect x="${r2(x - w / 2)}" y="${r2(y - h)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(2 * scale)}" fill="#cbb892"/>
    <rect x="${r2(x - w / 2)}" y="${r2(y - h)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(2 * scale)}" fill="url(#wax)"/>
    <ellipse cx="${r2(x)}" cy="${r2(y - h - 12 * scale)}" rx="${r2(5 * scale)}" ry="${r2(11 * scale)}" fill="url(#flame)"/>`;
}

// ---- the iron candle wheel hanging from the rafters ------------------------
function wheel(cx, cy, rx, ry, count, seed) {
  const rand = rng(seed);
  const out = [];
  out.push(
    `<line x1="${cx}" y1="0" x2="${cx}" y2="${cy - ry}" stroke="#120c08" stroke-width="5"/>`,
    `<line x1="${cx - rx}" y1="${cy}" x2="${cx}" y2="${cy - ry - 40}" stroke="#120c08" stroke-width="3"/>`,
    `<line x1="${cx + rx}" y1="${cy}" x2="${cx}" y2="${cy - ry - 40}" stroke="#120c08" stroke-width="3"/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#17100a" stroke-width="9"/>`,
    `<ellipse cx="${cx}" cy="${cy - 3}" rx="${rx}" ry="${ry}" fill="none" stroke="#3a281b" stroke-width="2" opacity="0.6"/>`,
  );
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    out.push(candle(x, y - 2, 22 + rand() * 10, 0.6));
  }
  return out.join('\n    ');
}

// ---- sparks lifting off the fire -------------------------------------------
function sparks() {
  const rand = rng(0x5a4c);
  const out = [];
  for (let i = 0; i < 34; i += 1) {
    const x = HEARTH_X + (rand() - 0.5) * 260;
    const y = 420 + rand() * 300;
    const r = 1.2 + rand() * 2;
    const o = 0.25 + rand() * 0.55;
    out.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="#f7b55a" opacity="${r2(o)}"/>`);
  }
  return out.join('\n    ');
}

// ---- tankards and a bottle, so the table reads as used ---------------------
function tankard(x, y, s = 1) {
  return `
    <rect x="${r2(x - 22 * s)}" y="${r2(y - 62 * s)}" width="${r2(44 * s)}" height="${r2(62 * s)}" rx="${r2(5 * s)}" fill="#1b100a"/>
    <path d="M ${r2(x + 22 * s)} ${r2(y - 48 * s)} a ${r2(16 * s)} ${r2(16 * s)} 0 0 1 0 ${r2(30 * s)}" fill="none" stroke="#1b100a" stroke-width="${r2(7 * s)}"/>
    <rect x="${r2(x - 22 * s)}" y="${r2(y - 62 * s)}" width="${r2(6 * s)}" height="${r2(62 * s)}" rx="${r2(3 * s)}" fill="#6a4426" opacity="0.5"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#120c09"/>
      <stop offset="0.35" stop-color="#1d1410"/>
      <stop offset="0.6" stop-color="#1a120e"/>
      <stop offset="1" stop-color="#0b0706"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c120c"/>
      <stop offset="0.5" stop-color="#110b08"/>
      <stop offset="1" stop-color="#070403"/>
    </linearGradient>
    <linearGradient id="tabletop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2416"/>
      <stop offset="1" stop-color="#1e120b"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d0806" stop-opacity="0"/>
      <stop offset="1" stop-color="#0d0806" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="wax" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>
    <!-- The hearth's light on the room. Wide, warm, and the brightest thing. -->
    <radialGradient id="hearthlight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f0903a" stop-opacity="0.55"/>
      <stop offset="0.35" stop-color="#d8702a" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#b0501c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="floorlight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e88a3c" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#e88a3c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f6c66a" stop-opacity="0.34"/>
      <stop offset="0.5" stop-color="#e9a34a" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#e9a34a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="flame" cx="0.5" cy="0.65" r="0.6">
      <stop offset="0" stop-color="#fff6d8"/>
      <stop offset="0.45" stop-color="#f7c65e"/>
      <stop offset="1" stop-color="#e2762a" stop-opacity="0.7"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.72">
      <stop offset="0.4" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.62"/>
    </radialGradient>
    <!-- Blurs are scoped to the fire and the smoke; a filter across the whole
         canvas is slow to paint and this is drawn behind a live chat. -->
    <filter id="fire" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    <filter id="smoke" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="40"/>
    </filter>
  </defs>

  <!-- back wall, then the stone courses on it -->
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <g>
    ${masonry()}
  </g>

  <!-- ceiling and rafters -->
  <rect x="0" y="0" width="${W}" height="176" fill="#0d0907"/>
  <rect x="0" y="52" width="${W}" height="38" fill="#080503"/>
  <rect x="0" y="150" width="${W}" height="30" fill="#090604"/>
  <rect x="0" y="86" width="${W}" height="4" fill="#2a1c12" opacity="0.5"/>

  <!-- the hearth's light across the wall, before the hearth is drawn over it -->
  <circle cx="${HEARTH_X}" cy="${HEARTH_FLOOR - 60}" r="980" fill="url(#hearthlight)"/>

  <!-- the hearth: an arch of paler stone, a black mouth, the fire inside -->
  <path d="M ${HEARTH_X - 300} ${HEARTH_FLOOR + 10} L ${HEARTH_X - 300} 560 A 300 220 0 0 1 ${HEARTH_X + 300} 560 L ${HEARTH_X + 300} ${HEARTH_FLOOR + 10} Z" fill="#3d2d23"/>
  <path d="M ${HEARTH_X - 300} ${HEARTH_FLOOR + 10} L ${HEARTH_X - 300} 560 A 300 220 0 0 1 ${HEARTH_X + 300} 560 L ${HEARTH_X + 300} ${HEARTH_FLOOR + 10} Z" fill="none" stroke="#5a4535" stroke-width="3" opacity="0.6"/>
  <path d="M ${HEARTH_X - 240} ${HEARTH_FLOOR + 10} L ${HEARTH_X - 240} 580 A 240 180 0 0 1 ${HEARTH_X + 240} 580 L ${HEARTH_X + 240} ${HEARTH_FLOOR + 10} Z" fill="#050302"/>
  <!-- mantel beam -->
  <rect x="${HEARTH_X - 360}" y="330" width="720" height="34" rx="3" fill="#1c110b"/>
  <rect x="${HEARTH_X - 360}" y="330" width="720" height="5" fill="#4a3220" opacity="0.7"/>

  <!-- the fire -->
  <g filter="url(#fire)">
    <ellipse cx="${HEARTH_X}" cy="${HEARTH_FLOOR - 30}" rx="220" ry="80" fill="#6a1e0a" opacity="0.9"/>
    <ellipse cx="${HEARTH_X}" cy="${HEARTH_FLOOR - 90}" rx="160" ry="150" fill="#c44f18"/>
    <ellipse cx="${HEARTH_X - 14}" cy="${HEARTH_FLOOR - 130}" rx="104" ry="150" fill="#ec8f34"/>
    <ellipse cx="${HEARTH_X + 8}" cy="${HEARTH_FLOOR - 140}" rx="60" ry="118" fill="#f8cf7c"/>
    <ellipse cx="${HEARTH_X}" cy="${HEARTH_FLOOR - 120}" rx="26" ry="64" fill="#fff5d6"/>
  </g>
  <!-- logs, in front of the fire -->
  <rect x="${HEARTH_X - 150}" y="${HEARTH_FLOOR - 34}" width="300" height="26" rx="12" fill="#1a0b05"/>
  <rect x="${HEARTH_X - 110}" y="${HEARTH_FLOOR - 58}" width="220" height="24" rx="11" fill="#22100a" transform="rotate(-6 ${HEARTH_X} ${HEARTH_FLOOR - 46})"/>
  <g>
    ${sparks()}
  </g>
  <!-- smoke, up the chimney breast -->
  <g filter="url(#smoke)" fill="#6a5647">
    <ellipse cx="${HEARTH_X - 40}" cy="270" rx="150" ry="46" opacity="0.08"/>
    <ellipse cx="${HEARTH_X + 60}" cy="200" rx="200" ry="40" opacity="0.06"/>
  </g>

  <!-- candles on the mantel -->
  ${candle(HEARTH_X - 300, 330, 44, 0.9)}
  ${candle(HEARTH_X - 262, 330, 32, 0.8)}
  ${candle(HEARTH_X + 280, 330, 50, 0.9)}
  ${candle(HEARTH_X + 318, 330, 36, 0.8)}

  <!-- floor, lit where the fire reaches it -->
  <rect x="0" y="${HEARTH_FLOOR + 10}" width="${W}" height="${H - HEARTH_FLOOR - 10}" fill="url(#floor)"/>
  <ellipse cx="${HEARTH_X}" cy="${HEARTH_FLOOR + 40}" rx="760" ry="150" fill="url(#floorlight)"/>

  <!-- candle wheels, hung either side so the hearth stays the bright centre -->
  ${wheel(640, 340, 130, 34, 7, 0x7ee1)}
  ${wheel(1930, 300, 100, 26, 6, 0x7ee2)}

  <!-- the long table, foreground -->
  <polygon points="520,930 2040,930 2220,1090 340,1090" fill="url(#tabletop)"/>
  <polygon points="340,1090 2220,1090 2220,1140 340,1140" fill="#120a06"/>
  <ellipse cx="1280" cy="965" rx="640" ry="90" fill="url(#floorlight)" opacity="0.7"/>
  <rect x="520" y="928" width="1520" height="3" fill="#7a5230" opacity="0.5"/>
  ${tankard(880, 930, 1)}
  ${tankard(1690, 932, 0.9)}
  <rect x="1130" y="850" width="34" height="82" rx="6" fill="#0e0a0d"/>
  <rect x="1139" y="826" width="16" height="36" rx="4" fill="#0e0a0d"/>
  ${candle(760, 932, 60, 1.1)}
  ${candle(1010, 930, 44, 1)}
  ${candle(1500, 930, 52, 1)}
  ${candle(1820, 934, 38, 1)}

  <!-- the pillars nearest the viewer frame the shot -->
  <polygon points="150,0 330,0 350,${H} 110,${H}" fill="#080503"/>
  <polygon points="2230,0 2410,0 2450,${H} 2210,${H}" fill="#080503"/>
  <polygon points="330,0 344,0 364,${H} 350,${H}" fill="#e88a3c" opacity="0.12"/>
  <polygon points="2216,0 2230,0 2210,${H} 2196,${H}" fill="#e88a3c" opacity="0.12"/>

  <!-- the bottom third goes dark under the panels; the edges fall away -->
  <rect x="0" y="960" width="${W}" height="${H - 960}" fill="url(#fade)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>
`;

await fs.writeFile(OUT, svg);
console.log('wrote', path.relative(process.cwd(), OUT), `(${(svg.length / 1024).toFixed(1)} KB)`);

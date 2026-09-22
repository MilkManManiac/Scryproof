// Paints the scrying chamber behind the app (web/public/backdrops/scry.svg):
// a dark stone room with a low wide basin of pale water in the upper middle,
// the water throwing cool light up onto the wall behind it, a few candles at
// the edges for warmth. Nothing figurative in the water; it is light, not a
// vision. The composition sits in the upper middle and the bottom third is
// dark, because that is where the panels sit. Same technique as
// gen-backdrop.mjs (the hall): flat shapes, gradients, a few small blur
// filters, and a seeded PRNG so running it twice writes the same bytes.
//
//   node web/scripts/gen-scry-backdrop.mjs
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'backdrops', 'scry.svg');

const W = 2560;
const H = 1440;

// The basin is the one bright thing. Everything else leads the eye to it.
const BASIN_X = 1280;
const WATER_Y = 690;
const WATER_RX = 350;
const WATER_RY = 66;
const FLOOR_Y = 820;

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

// ---- the back wall: coursed stone, blue-black -------------------------------
// Low contrast on purpose. The wall gets dimmed under the panels, so anything
// busier than a faint grid would either vanish or fight the UI.
function masonry() {
  const rand = rng(0x5c47);
  const tints = ['#1a2035', '#1d2439', '#171d30', '#20273d', '#151b2c'];
  const out = [];
  const rowH = 58;
  let row = 0;
  for (let y = 150; y < FLOOR_Y + 20; y += rowH, row += 1) {
    let x = row % 2 === 0 ? 0 : -70 - rand() * 60;
    while (x < W) {
      const w = 120 + rand() * 80;
      const fill = tints[Math.floor(rand() * tints.length)];
      out.push(
        `<rect x="${r2(x + 2)}" y="${r2(y + 2)}" width="${r2(w - 4)}" height="${rowH - 4}" rx="2" fill="${fill}"/>`,
      );
      x += w;
    }
  }
  return out.join('\n    ');
}

// ---- caustics: the water's light, broken into ripples, on the wall ----------
// Thin wavy lines of pale light fanning up from the basin. They fade with
// height and toward the sides, so the wall reads as lit from below.
function caustics() {
  const rand = rng(0xca57);
  const out = [];
  for (let i = 0; i < 26; i += 1) {
    const y = 250 + rand() * 400;
    const height = (y - 250) / 400; // 0 at the top, 1 just above the water
    const half = 220 + rand() * 260;
    const x0 = BASIN_X - half;
    const segs = 6;
    const step = (half * 2) / segs;
    // Light off a round pool lands on the wall in arcs, so each line bows
    // upward in the middle, more the closer it is to the water.
    const bow = 20 + height * 40;
    const arc = (x) => -bow * (1 - ((x - BASIN_X) / half) ** 2);
    let d = `M ${r2(x0)} ${r2(y + arc(x0))}`;
    for (let s = 0; s < segs; s += 1) {
      const cx = x0 + step * (s + 0.5);
      const cy = y + arc(cx) + (rand() - 0.5) * 34;
      const ex = x0 + step * (s + 1);
      d += ` Q ${r2(cx)} ${r2(cy)} ${r2(ex)} ${r2(y + arc(ex) + (rand() - 0.5) * 10)}`;
    }
    const o = 0.08 + height * 0.26;
    const sw = 2 + rand() * 3;
    out.push(`<path d="${d}" fill="none" stroke="#bfe3ff" stroke-width="${r2(sw)}" opacity="${r2(o)}"/>`);
  }
  return out.join('\n    ');
}

// ---- a candle: stick, flame, and the small warm glow it throws --------------
function candle(x, y, h, scale = 1) {
  const w = 12 * scale;
  return `
    <circle cx="${r2(x)}" cy="${r2(y - h - 6)}" r="${r2(80 * scale)}" fill="url(#cglow)"/>
    <rect x="${r2(x - w / 2)}" y="${r2(y - h)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(2 * scale)}" fill="#cbb892"/>
    <rect x="${r2(x - w / 2)}" y="${r2(y - h)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(2 * scale)}" fill="url(#wax)"/>
    <ellipse cx="${r2(x)}" cy="${r2(y - h - 12 * scale)}" rx="${r2(5 * scale)}" ry="${r2(11 * scale)}" fill="url(#flame)"/>`;
}

// ---- an iron wall sconce with a few candles on it ----------------------------
function sconce(x, y, seed) {
  const rand = rng(seed);
  const out = [];
  out.push(
    `<rect x="${x - 60}" y="${y}" width="120" height="8" rx="2" fill="#0a0c12"/>`,
    `<rect x="${x - 4}" y="${y + 8}" width="8" height="70" rx="2" fill="#0a0c12"/>`,
    `<rect x="${x - 60}" y="${y}" width="120" height="2" fill="#3a3f52" opacity="0.5"/>`,
  );
  for (let i = -1; i <= 1; i += 1) {
    out.push(candle(x + i * 40, y, 26 + rand() * 14, 0.7));
  }
  return out.join('\n    ');
}

// ---- motes drifting in the light above the water ----------------------------
function motes() {
  const rand = rng(0x1e5);
  const out = [];
  for (let i = 0; i < 40; i += 1) {
    const x = BASIN_X + (rand() - 0.5) * 700;
    const y = 300 + rand() * 360;
    const r = 1 + rand() * 1.8;
    const o = 0.15 + rand() * 0.4;
    out.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="#dff1ff" opacity="${r2(o)}"/>`);
  }
  return out.join('\n    ');
}

// ---- rings on the water: still, but not dead ---------------------------------
function ripples() {
  const rand = rng(0x1ff1e);
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const f = 0.25 + i * 0.16;
    const dx = (rand() - 0.5) * 30;
    const dy = (rand() - 0.5) * 8;
    out.push(
      `<ellipse cx="${r2(BASIN_X + dx)}" cy="${r2(WATER_Y + dy)}" rx="${r2(WATER_RX * f)}" ry="${r2(WATER_RY * f)}" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="${r2(0.32 - i * 0.05)}"/>`,
    );
  }
  return out.join('\n    ');
}

// Flagstones on the floor, faint, so the floor is a floor and not a gradient.
function flagstones() {
  const rand = rng(0xf1a6);
  const out = [];
  const rowH = 46;
  let row = 0;
  for (let y = FLOOR_Y + 10; y < 1000; y += rowH, row += 1) {
    let x = row % 2 === 0 ? 0 : -90;
    while (x < W) {
      const w = 160 + rand() * 90;
      out.push(
        `<rect x="${r2(x + 2)}" y="${r2(y + 2)}" width="${r2(w - 4)}" height="${rowH - 4}" rx="1" fill="#0c101a" opacity="${r2(0.5 + rand() * 0.4)}"/>`,
      );
      x += w;
    }
  }
  return out.join('\n    ');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#070a12"/>
      <stop offset="0.35" stop-color="#121726"/>
      <stop offset="0.6" stop-color="#10151f"/>
      <stop offset="1" stop-color="#05070c"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121826"/>
      <stop offset="0.5" stop-color="#0a0e17"/>
      <stop offset="1" stop-color="#040508"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080a12" stop-opacity="0"/>
      <stop offset="1" stop-color="#080a12" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="wax" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>
    <!-- The stone of the basin: lit from inside, so its inner rim is the
         palest and the outside falls to black. -->
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b4458"/>
      <stop offset="1" stop-color="#151a26"/>
    </linearGradient>
    <linearGradient id="bowl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c2230"/>
      <stop offset="1" stop-color="#07090e"/>
    </linearGradient>
    <linearGradient id="plinth" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0a0d15"/>
      <stop offset="0.5" stop-color="#1a2030"/>
      <stop offset="1" stop-color="#0a0d15"/>
    </linearGradient>
    <!-- The light thrown up the wall. Wide, cool, and the brightest thing. -->
    <radialGradient id="scrylight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#a8d8ff" stop-opacity="0.75"/>
      <stop offset="0.3" stop-color="#6ea8e0" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#3a6aa8" stop-opacity="0"/>
    </radialGradient>
    <!-- The cone of it going up: bright at the water, gone by the ceiling. -->
    <linearGradient id="cone" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#b8e0ff" stop-opacity="0.45"/>
      <stop offset="0.5" stop-color="#8ec2f2" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#6ea8e0" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="floorlight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8ec6f5" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#8ec6f5" stop-opacity="0"/>
    </radialGradient>
    <!-- The water itself: a pale core, bluer toward the rim, nothing in it. -->
    <radialGradient id="water" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e2f2ff"/>
      <stop offset="0.35" stop-color="#a9d3f7"/>
      <stop offset="0.75" stop-color="#4f8cc4"/>
      <stop offset="1" stop-color="#25507f"/>
    </radialGradient>
    <radialGradient id="cglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f6c66a" stop-opacity="0.3"/>
      <stop offset="0.5" stop-color="#e9a34a" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#e9a34a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="flame" cx="0.5" cy="0.65" r="0.6">
      <stop offset="0" stop-color="#fff6d8"/>
      <stop offset="0.45" stop-color="#f7c65e"/>
      <stop offset="1" stop-color="#e2762a" stop-opacity="0.7"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.72">
      <stop offset="0.4" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.66"/>
    </radialGradient>
    <!-- Blurs are scoped to the water's glow and the vapour; a filter across
         the whole canvas is slow to paint and this is drawn behind a live chat. -->
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
    <filter id="haze" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="44"/>
    </filter>
    <filter id="caustic" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.5"/>
    </filter>
  </defs>

  <!-- back wall, then the stone courses on it -->
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <g>
    ${masonry()}
  </g>

  <!-- ceiling: a dark vault with one cornice line -->
  <rect x="0" y="0" width="${W}" height="156" fill="#05070d"/>
  <rect x="0" y="130" width="${W}" height="26" fill="#080a12"/>
  <rect x="0" y="128" width="${W}" height="3" fill="#2a3044" opacity="0.5"/>

  <!-- the niche behind the basin: a round-topped recess of darker stone that
       frames the light. The wall inside it is where the caustics play. -->
  <path d="M ${BASIN_X - 400} ${FLOOR_Y + 10} L ${BASIN_X - 400} 420 A 400 300 0 0 1 ${BASIN_X + 400} 420 L ${BASIN_X + 400} ${FLOOR_Y + 10} Z" fill="#1c2130"/>
  <path d="M ${BASIN_X - 350} ${FLOOR_Y + 10} L ${BASIN_X - 350} 440 A 350 260 0 0 1 ${BASIN_X + 350} 440 L ${BASIN_X + 350} ${FLOOR_Y + 10} Z" fill="#111828"/>
  <path d="M ${BASIN_X - 350} ${FLOOR_Y + 10} L ${BASIN_X - 350} 440 A 350 260 0 0 1 ${BASIN_X + 350} 440 L ${BASIN_X + 350} ${FLOOR_Y + 10}" fill="none" stroke="#5b6884" stroke-width="3" opacity="0.5"/>

  <!-- the water's light on the room: a wide cool radial, then the cone of it
       climbing the niche, then the ripples of it on the stone -->
  <circle cx="${BASIN_X}" cy="${WATER_Y - 40}" r="1000" fill="url(#scrylight)"/>
  <g filter="url(#soft)">
    <polygon points="${BASIN_X - 300},${WATER_Y} ${BASIN_X + 300},${WATER_Y} ${BASIN_X + 520},180 ${BASIN_X - 520},180" fill="url(#cone)"/>
  </g>
  <g filter="url(#caustic)">
    ${caustics()}
  </g>
  <g>
    ${motes()}
  </g>

  <!-- vapour lifting off the water -->
  <g filter="url(#haze)" fill="#9fd0f5">
    <ellipse cx="${BASIN_X - 60}" cy="${WATER_Y - 160}" rx="200" ry="60" opacity="0.1"/>
    <ellipse cx="${BASIN_X + 80}" cy="${WATER_Y - 260}" rx="240" ry="50" opacity="0.06"/>
  </g>

  <!-- floor, with the flagstones on it and the water's light pooled around
       the plinth -->
  <rect x="0" y="${FLOOR_Y + 10}" width="${W}" height="${H - FLOOR_Y - 10}" fill="url(#floor)"/>
  <g>
    ${flagstones()}
  </g>
  <ellipse cx="${BASIN_X}" cy="${FLOOR_Y + 70}" rx="820" ry="150" fill="url(#floorlight)"/>

  <!-- the plinth the basin stands on: a squat stone column, narrower than the
       bowl so the bowl's underside shows, with a wider foot -->
  <polygon points="${BASIN_X - 180},${WATER_Y + 80} ${BASIN_X + 180},${WATER_Y + 80} ${BASIN_X + 200},${FLOOR_Y + 50} ${BASIN_X - 200},${FLOOR_Y + 50}" fill="url(#plinth)"/>
  <polygon points="${BASIN_X - 260},${FLOOR_Y + 50} ${BASIN_X + 260},${FLOOR_Y + 50} ${BASIN_X + 260},${FLOOR_Y + 78} ${BASIN_X - 260},${FLOOR_Y + 78}" fill="#0d1119"/>
  <rect x="${BASIN_X - 260}" y="${FLOOR_Y + 50}" width="520" height="3" fill="#3a4458" opacity="0.5"/>

  <!-- the basin: a shallow bowl of dark stone, a pale rim, the water in it -->
  <path d="M ${BASIN_X - WATER_RX - 40} ${WATER_Y} Q ${BASIN_X} ${WATER_Y + 210} ${BASIN_X + WATER_RX + 40} ${WATER_Y} Z" fill="url(#bowl)"/>
  <path d="M ${BASIN_X - WATER_RX - 40} ${WATER_Y} Q ${BASIN_X} ${WATER_Y + 210} ${BASIN_X + WATER_RX + 40} ${WATER_Y}" fill="none" stroke="#2b3447" stroke-width="2" opacity="0.6"/>
  <ellipse cx="${BASIN_X}" cy="${WATER_Y}" rx="${WATER_RX + 40}" ry="${WATER_RY + 16}" fill="url(#rim)"/>
  <ellipse cx="${BASIN_X}" cy="${WATER_Y - 2}" rx="${WATER_RX + 40}" ry="${WATER_RY + 16}" fill="none" stroke="#8fa3c2" stroke-width="2" opacity="0.45"/>
  <ellipse cx="${BASIN_X}" cy="${WATER_Y}" rx="${WATER_RX}" ry="${WATER_RY}" fill="url(#water)"/>
  <g filter="url(#soft)">
    <ellipse cx="${BASIN_X}" cy="${WATER_Y}" rx="${WATER_RX * 0.55}" ry="${WATER_RY * 0.55}" fill="#eaf6ff" opacity="0.55"/>
  </g>
  <g>
    ${ripples()}
  </g>
  <!-- the inside of the rim, shadowing the far edge of the water -->
  <ellipse cx="${BASIN_X}" cy="${WATER_Y - 6}" rx="${WATER_RX}" ry="${WATER_RY}" fill="none" stroke="#0b1524" stroke-width="6" opacity="0.5"/>

  <!-- candles: two sconces on the walls and two on the floor by the pillars,
       the only warmth in the room, kept to the edges -->
  ${sconce(560, 470, 0x5c01)}
  ${sconce(2000, 450, 0x5c02)}
  ${candle(430, FLOOR_Y + 40, 64, 1.1)}
  ${candle(470, FLOOR_Y + 48, 44, 1)}
  ${candle(2110, FLOOR_Y + 44, 56, 1.1)}
  ${candle(2150, FLOOR_Y + 36, 40, 0.9)}

  <!-- the pillars nearest the viewer frame the shot -->
  <polygon points="150,0 330,0 350,${H} 110,${H}" fill="#04060a"/>
  <polygon points="2230,0 2410,0 2450,${H} 2210,${H}" fill="#04060a"/>
  <polygon points="330,0 344,0 364,${H} 350,${H}" fill="#8ec6f5" opacity="0.1"/>
  <polygon points="2216,0 2230,0 2210,${H} 2196,${H}" fill="#8ec6f5" opacity="0.1"/>

  <!-- the bottom third goes dark under the panels; the edges fall away -->
  <rect x="0" y="940" width="${W}" height="${H - 940}" fill="url(#fade)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>
`;

await fs.writeFile(OUT, svg);
console.log('wrote', path.relative(process.cwd(), OUT), `(${(svg.length / 1024).toFixed(1)} KB)`);

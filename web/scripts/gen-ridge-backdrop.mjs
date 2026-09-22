// Paints the ridge behind the app (web/public/backdrops/ridge.svg): a campfire
// on a high ridge at night. The fire is low and left of centre and is the only
// warm thing; above it a cold star field and ridgelines going blue as they
// recede. The warmth of the ground against the cold of the sky is the whole
// picture. Same craft as gen-backdrop.mjs (the hall): flat shapes, gradients,
// blur filters scoped to the fire and the smoke, a seeded PRNG so the file is
// the same bytes every run. The bottom third goes dark because the panels sit
// there.
//
//   node web/scripts/gen-ridge-backdrop.mjs
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'backdrops', 'ridge.svg');

const W = 2560;
const H = 1440;

// The fire. Low, left of centre: at a laptop width it lands under the gutter
// between the sidebar and the message column, so its light spills into both
// and is not swallowed by the most opaque panel on the screen.
const FIRE_X = 720;
const FIRE_Y = 900;

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

// ---- the stars ---------------------------------------------------------------
// Most are a pixel or two and faint. A handful are bright enough to carry a
// small glow, because a sky of identical dots reads as noise, not stars. The
// field thins toward the horizon, where the air is thickest.
function stars() {
  const rand = rng(0x51a75);
  const out = [];
  for (let i = 0; i < 520; i += 1) {
    const x = rand() * W;
    // Squared so the density falls off toward the ridgelines.
    const y = rand() ** 1.6 * 700;
    const r = 0.7 + rand() ** 2 * 1.9;
    const o = 0.25 + rand() * 0.6;
    // A few lean warm, most lean cold; a real sky is not one colour.
    const fill = rand() < 0.12 ? '#f2e2c4' : rand() < 0.5 ? '#dfe8f7' : '#ffffff';
    out.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${fill}" opacity="${r2(o)}"/>`);
  }
  for (let i = 0; i < 16; i += 1) {
    const x = rand() * W;
    const y = rand() * 520;
    const r = 2.2 + rand() * 1.6;
    out.push(
      `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r * 7)}" fill="url(#starglow)"/>`,
      `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="#ffffff" opacity="0.95"/>`,
    );
  }
  return out.join('\n    ');
}

// ---- the Milky Way -----------------------------------------------------------
// A soft diagonal band of blurred ellipses, faint enough that it reads as
// haze with more stars in it, not as a painted stripe.
function milkyWay() {
  const rand = rng(0x3117);
  const out = [];
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 1900 - t * 1700;
    const y = 40 + t * 520;
    const rx = 260 + rand() * 180;
    const ry = 70 + rand() * 50;
    const o = 0.035 + rand() * 0.04;
    out.push(
      `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="#b9c8e6" opacity="${r2(o)}" transform="rotate(-18 ${r2(x)} ${r2(y)})"/>`,
    );
  }
  return out.join('\n    ');
}

// ---- a ridgeline ---------------------------------------------------------------
// A random walk along the top of a polygon, smoothed so the far ones roll and
// the near one is craggier. Returns the points attribute; the caller picks
// the fill.
function ridge(seed, baseY, amp, step, jag) {
  const rand = rng(seed);
  const pts = [];
  let y = baseY;
  let drift = 0;
  for (let x = -40; x <= W + 40; x += step) {
    drift += (rand() - 0.5) * jag;
    drift *= 0.82;
    y += drift;
    // Pull back toward the base line so the ridge never wanders off.
    y += (baseY - y) * 0.08;
    const peak = y - Math.abs(Math.sin(x / 190 + seed)) * amp * 0.4;
    pts.push(`${r2(x)},${r2(peak)}`);
  }
  pts.push(`${W + 40},${H}`, `-40,${H}`);
  return pts.join(' ');
}

// ---- a pine ------------------------------------------------------------------
// Stacked triangles, black. A few at each edge are the dark foreground frame
// that every night shot in the research has; they also stop the sky from
// running off the sides of the screen.
function pine(x, baseY, h, seed) {
  const rand = rng(seed);
  const out = [];
  const tiers = 5 + Math.floor(rand() * 3);
  const top = baseY - h;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / (tiers - 1);
    const y = top + t * h * 0.82;
    const half = 18 + t * h * 0.22 + rand() * 8;
    const drop = h * 0.26 + rand() * 12;
    out.push(`<polygon points="${r2(x)},${r2(y)} ${r2(x + half)},${r2(y + drop)} ${r2(x - half)},${r2(y + drop)}"/>`);
  }
  out.push(`<rect x="${r2(x - 5)}" y="${r2(baseY - h * 0.2)}" width="10" height="${r2(h * 0.2 + 4)}"/>`);
  return out.join('\n    ');
}

// ---- sparks lifting off the fire, drifting right on the wind -----------------
function sparks() {
  const rand = rng(0x5a4c);
  const out = [];
  for (let i = 0; i < 54; i += 1) {
    const lift = rand();
    const y = FIRE_Y - 60 - lift * 520;
    const x = FIRE_X + lift * 160 + (rand() - 0.5) * (80 + lift * 260);
    const r = 1 + rand() * 2.2 * (1 - lift * 0.5);
    const o = (0.3 + rand() * 0.6) * (1 - lift * 0.6);
    const fill = rand() < 0.3 ? '#ffd58a' : '#f4a04a';
    out.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${fill}" opacity="${r2(o)}"/>`);
  }
  return out.join('\n    ');
}

// ---- the stones around the fire -----------------------------------------------
function stoneRing() {
  const rand = rng(0x570e);
  const out = [];
  for (let i = 0; i < 17; i += 1) {
    // Uneven spacing and size, or it reads as a toy. The ring is a flattened
    // ellipse because we look down on it a little.
    const t = (i / 17) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const x = FIRE_X + Math.cos(t) * (130 + rand() * 24);
    const y = FIRE_Y + 22 + Math.sin(t) * (34 + rand() * 8);
    const rx = 10 + rand() * 12;
    const ry = 6 + rand() * 5;
    // Stones behind the fire are lit full-face; the ones in front only on top.
    const behind = Math.sin(t) < 0;
    out.push(
      `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="#0a0706"/>`,
      `<ellipse cx="${r2(x)}" cy="${r2(y - (behind ? 0 : 2))}" rx="${r2(rx * (behind ? 0.9 : 0.7))}" ry="${r2(ry * (behind ? 0.8 : 0.4))}" fill="#d98440" opacity="${r2(behind ? 0.5 + rand() * 0.2 : 0.2 + rand() * 0.15)}"/>`,
    );
  }
  return out.join('\n    ');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Night sky: near black at the zenith, a cold band at the horizon where
         the last of the light and the far haze meet. -->
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#04060c"/>
      <stop offset="0.36" stop-color="#0b1324"/>
      <stop offset="0.66" stop-color="#1a2a46"/>
      <stop offset="1" stop-color="#3a5075"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#110d0b"/>
      <stop offset="0.5" stop-color="#0b0807"/>
      <stop offset="1" stop-color="#050403"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0807" stop-opacity="0"/>
      <stop offset="1" stop-color="#0b0807" stop-opacity="0.96"/>
    </linearGradient>
    <radialGradient id="starglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="0.4" stop-color="#dfe8ff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#dfe8ff" stop-opacity="0"/>
    </radialGradient>
    <!-- The fire's light on the ground and the near rocks: wide, warm, and the
         one warm thing in the picture. -->
    <radialGradient id="firelight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f08a34" stop-opacity="0.7"/>
      <stop offset="0.3" stop-color="#d6682a" stop-opacity="0.32"/>
      <stop offset="0.65" stop-color="#b8521f" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#a84a1c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="groundlight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e8853a" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#e8853a" stop-opacity="0"/>
    </radialGradient>
    <!-- The same light reaching up: the smoke column and the air just above the
         flames pick up orange, the sky beyond does not. -->
    <radialGradient id="airglow" cx="0.5" cy="1" r="0.6">
      <stop offset="0" stop-color="#e07a2c" stop-opacity="0.3"/>
      <stop offset="0.5" stop-color="#c05a20" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#c05a20" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.72">
      <stop offset="0.45" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.6"/>
    </radialGradient>
    <!-- Blurs are scoped to what needs them; a filter across the whole canvas
         is slow to paint and this sits behind a live chat. -->
    <filter id="fire" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
    <filter id="haze" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="46"/>
    </filter>
  </defs>

  <!-- the sky -->
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g filter="url(#haze)">
    ${milkyWay()}
  </g>
  <g>
    ${stars()}
  </g>

  <!-- the far ridges: each one lighter, bluer and softer than the one in front
       of it, which is what distance does to a mountain at night -->
  <polygon points="${ridge(0x11, 690, 90, 44, 26)}" fill="#2a3a58" opacity="0.85"/>
  <polygon points="${ridge(0x22, 740, 110, 40, 32)}" fill="#1b2840"/>
  <polygon points="${ridge(0x33, 790, 120, 36, 40)}" fill="#111a2c"/>

  <!-- the air above the fire catches its colour before the sky does -->
  <ellipse cx="${FIRE_X + 40}" cy="${FIRE_Y - 120}" rx="520" ry="360" fill="url(#airglow)"/>

  <!-- the ridge we stand on: warm black, the only ground in the picture -->
  <polygon points="${ridge(0x44, 850, 60, 30, 54)}" fill="url(#ground)"/>
  <circle cx="${FIRE_X}" cy="${FIRE_Y - 20}" r="900" fill="url(#firelight)"/>
  <ellipse cx="${FIRE_X}" cy="${FIRE_Y + 40}" rx="620" ry="130" fill="url(#groundlight)"/>

  <!-- two logs to sit on, either side, a rim of light on the side facing the fire -->
  <rect x="${FIRE_X - 440}" y="${FIRE_Y + 6}" width="200" height="34" rx="16" fill="#080605" transform="rotate(3 ${FIRE_X - 340} ${FIRE_Y + 23})"/>
  <path d="M ${FIRE_X - 252} ${FIRE_Y + 12} q 6 12 0 26" fill="none" stroke="#d98440" stroke-width="4" opacity="0.4" transform="rotate(3 ${FIRE_X - 340} ${FIRE_Y + 23})"/>
  <rect x="${FIRE_X - 430}" y="${FIRE_Y + 6}" width="180" height="6" rx="3" fill="#b8683a" opacity="0.16" transform="rotate(3 ${FIRE_X - 340} ${FIRE_Y + 23})"/>
  <rect x="${FIRE_X + 240}" y="${FIRE_Y + 10}" width="210" height="36" rx="17" fill="#080605" transform="rotate(-4 ${FIRE_X + 345} ${FIRE_Y + 28})"/>
  <path d="M ${FIRE_X + 252} ${FIRE_Y + 16} q -6 12 0 26" fill="none" stroke="#d98440" stroke-width="4" opacity="0.4" transform="rotate(-4 ${FIRE_X + 345} ${FIRE_Y + 28})"/>
  <rect x="${FIRE_X + 250}" y="${FIRE_Y + 10}" width="180" height="6" rx="3" fill="#b8683a" opacity="0.16" transform="rotate(-4 ${FIRE_X + 345} ${FIRE_Y + 28})"/>

  <!-- the fire itself: a bed of embers, two tongues of flame, the white heart.
       It sits down in the ring, not on it. -->
  <g filter="url(#fire)">
    <ellipse cx="${FIRE_X}" cy="${FIRE_Y + 8}" rx="130" ry="36" fill="#7a2208" opacity="0.9"/>
    <ellipse cx="${FIRE_X}" cy="${FIRE_Y - 50}" rx="92" ry="96" fill="#c84c14"/>
    <ellipse cx="${FIRE_X - 14}" cy="${FIRE_Y - 92}" rx="58" ry="112" fill="#ee8c30"/>
    <ellipse cx="${FIRE_X + 34}" cy="${FIRE_Y - 120}" rx="22" ry="70" fill="#ee8c30" opacity="0.8" transform="rotate(14 ${FIRE_X + 34} ${FIRE_Y - 120})"/>
    <ellipse cx="${FIRE_X + 6}" cy="${FIRE_Y - 100}" rx="34" ry="86" fill="#f9cf78"/>
    <ellipse cx="${FIRE_X - 2}" cy="${FIRE_Y - 72}" rx="15" ry="46" fill="#fff6dc"/>
  </g>
  <!-- logs crossed in the fire, in front of the flames -->
  <rect x="${FIRE_X - 100}" y="${FIRE_Y - 2}" width="200" height="18" rx="9" fill="#1a0a05" transform="rotate(-7 ${FIRE_X} ${FIRE_Y + 7})"/>
  <rect x="${FIRE_X - 90}" y="${FIRE_Y - 6}" width="180" height="16" rx="8" fill="#22100a" transform="rotate(8 ${FIRE_X} ${FIRE_Y + 2})"/>
  ${stoneRing()}
  <g>
    ${sparks()}
  </g>
  <!-- smoke, thin and leaning with the wind -->
  <g filter="url(#haze)" fill="#8a8a96">
    <ellipse cx="${FIRE_X + 60}" cy="${FIRE_Y - 330}" rx="90" ry="120" opacity="0.07"/>
    <ellipse cx="${FIRE_X + 170}" cy="${FIRE_Y - 520}" rx="130" ry="130" opacity="0.05"/>
    <ellipse cx="${FIRE_X + 300}" cy="${FIRE_Y - 680}" rx="180" ry="120" opacity="0.035"/>
  </g>

  <!-- pines at the edges frame the shot -->
  <g fill="#050404">
    ${pine(150, 900, 560, 0x91)}
    ${pine(290, 930, 430, 0x92)}
    ${pine(40, 920, 400, 0x93)}
    ${pine(2400, 890, 580, 0x94)}
    ${pine(2510, 920, 440, 0x95)}
    ${pine(2280, 940, 340, 0x96)}
  </g>

  <!-- the bottom third goes dark under the panels; the edges fall away -->
  <rect x="0" y="960" width="${W}" height="${H - 960}" fill="url(#fade)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>
`;

await fs.writeFile(OUT, svg);
console.log('wrote', path.relative(process.cwd(), OUT), `(${(svg.length / 1024).toFixed(1)} KB)`);

/*
 * Trey: everything that moves in the Trey theme's painting, pinned to the
 * painting itself, the way camp-scene.ts does it for Loaf v2.
 *
 * The painting is `assets/gen/trey-a.jpg` (Wes's picture, 2026-10-04): a
 * night sky over a snowfield, one great four-pointed star high on the left, a
 * wall of cloud lit cream from below on the right, a dark mass of cloud on the
 * left, and a fire burning in the snow beside some ruined towers. It is served
 * as `/backdrops/trey.jpg` at 1376 x 871: the picture at 1376 x 771 with 100
 * pixels of blurred snowfield added under it, so the fire sits high enough to
 * stay clear of the composer. Unlike the other scenes it is fitted to the
 * window's height, never cover, so a wide window cannot zoom the fire out of
 * the picture. Every point here is in the served painting's pixels and goes
 * through that arithmetic before it is drawn.
 *
 * Wes, first pass: "Go nuts with the alive function. Fire effects. maybe some
 * snow, stars going nuts, clouds." Second pass, after seeing it: "drop the
 * snow and the like wild bursts from the stars. Twinkles are great. Shooting
 * stars are great. Fire effects seemed great. Maybe add some clouds moving.
 * Maybe some dark birds flying."
 *
 * What moves, back to front:
 *   stars      a dense field over the sky only (never on a cloud), each
 *              twinkling on its own clock
 *   lines      now and then a few stars join into a constellation that draws
 *              itself and fades
 *   the star   breathes, its fine rays shimmer and turn slowly, light drips
 *              down its long beam
 *   meteors    every few seconds, and now and then a shower out of one point
 *   lightning  flashes deep inside the dark clouds, two or three at a time
 *   cloud      streaks of cloud sliding across the sky and the star, loose
 *              wisps of cloud drifting past in front of the cloud wall, and
 *              a band of light running along the lit rim
 *   birds      dark flocks, pairs and lone birds crossing the sky and the
 *              face of the lit cloud
 *   fire       flickering light on the snow, sparks pouring up and leaning
 *              with the wind, pops that throw a burst, smoke
 *
 * The same rules as the rest of Ambient: thirty frames a second, stopped
 * when the tab is hidden, never started under reduce motion.
 */

import { bank, type FogBank, type Scene } from './camp-scene';

const IW = 1376;
const IH = 871;

/** How far in from each side the served painting fades to --bg. */
const EDGE = 110;

const STAR = { x: 522, y: 177 };
const FIRE = { x: 895, y: 722 };

/** The top edge of the clouds, left to right. Sky is above it. */
const CLOUD_TOP: readonly (readonly [number, number])[] = [
  [0, 215], [60, 205], [140, 200], [220, 215], [290, 260], [330, 320], [400, 390],
  [430, 470], [470, 490], [540, 485], [620, 490], [700, 445], [760, 410], [790, 340],
  [830, 265], [900, 215], [960, 185], [1060, 190], [1120, 240], [1150, 300],
  [1220, 295], [1290, 240], [1330, 190], [1376, 170],
];

/** The cloud's lit edge, where the starlight catches it, in order along it. */
const RIM: readonly (readonly [number, number])[] = [
  [430, 548], [480, 505], [540, 495], [610, 500], [670, 468], [730, 432], [775, 395],
  [800, 335], [835, 270], [890, 228], [950, 196], [1150, 318], [1220, 300], [1290, 250],
  [1345, 195],
];

/** Where lightning lives: inside the dark clouds. */
const STORMS: readonly { x: number; y: number }[] = [
  { x: 170, y: 380 }, { x: 110, y: 560 }, { x: 300, y: 620 }, { x: 640, y: 610 },
  { x: 1010, y: 430 }, { x: 1240, y: 470 },
];

/** Where birds fly. High: the open sky. Low: across the face of the lit cloud, where a dark bird shows best. */
const HIGH = { left: 0, right: IW, top: 40, bottom: 190 };
const LOW = { left: 380, right: IW, top: 300, bottom: 470 };

interface Point {
  x: number;
  y: number;
}

interface Star extends Point {
  size: number;
  phase: number;
  rate: number;
  warm: boolean;
}

interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  span: number;
  size: number;
  spin: number;
  angle: number;
}

interface Meteor extends Point {
  vx: number;
  vy: number;
  life: number;
  span: number;
  tail: number;
}

interface Bird extends Point {
  size: number;
  flap: number;
  rate: number;
}

interface Flock {
  birds: Bird[];
  vx: number;
  vy: number;
  lane: typeof HIGH;
}

interface Strike extends Point {
  life: number;
  /** When each flash in the strike peaks, in its own clock. */
  flashes: number[];
  radius: number;
}

interface Constellation {
  stars: Point[];
  life: number;
  span: number;
}

interface Wisp extends Point {
  texture: HTMLCanvasElement | null;
  width: number;
  height: number;
  /** Painting pixels a second. */
  speed: number;
  alpha: number;
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);

/** One loose cloud: soft blobs bunched toward the middle, thinning at both ends. */
function wispTexture(width: number, height: number, rgb: string): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  for (let index = 0; index < 34; index += 1) {
    const across = rand(-1, 1);
    const fall = 1 - Math.abs(across) * 0.7;
    const x = width / 2 + across * width * 0.36;
    const y = height / 2 + rand(-0.18, 0.12) * height * fall;
    const radius = rand(0.22, 0.42) * height * fall;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = rand(0.08, 0.2);
    gradient.addColorStop(0, `rgb(${rgb} / ${alpha})`);
    gradient.addColorStop(0.6, `rgb(${rgb} / ${alpha * 0.4})`);
    gradient.addColorStop(1, `rgb(${rgb} / 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return canvas;
}

function cloudTop(x: number): number {
  for (let index = 1; index < CLOUD_TOP.length; index += 1) {
    const [x1, y1] = CLOUD_TOP[index]!;
    const [x0, y0] = CLOUD_TOP[index - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return CLOUD_TOP[CLOUD_TOP.length - 1]![1];
}

/** A random point of open sky, clear of the big star's own light. */
function skyPoint(): Point {
  for (;;) {
    const x = rand(0, IW);
    const y = rand(4, cloudTop(x) - 14);
    if (Math.hypot(x - STAR.x, (y - STAR.y) * 1.4) > 70) return { x, y };
  }
}

export function treyScene(backdropUrl: string | null): Scene {
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const stars: Star[] = Array.from({ length: 260 }, () => ({
    ...skyPoint(),
    size: rand(0.4, 1.3),
    phase: rand(0, Math.PI * 2),
    rate: rand(0.6, 2.4),
    warm: Math.random() < 0.3,
  }));

  // Find the painted stars: read the painting once and keep the bright specks
  // above the clouds, so the ones the eye already knows are there twinkle too.
  if (backdropUrl) {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = IW;
      canvas.height = 560;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, IW, IH);
      const data = context.getImageData(0, 0, IW, 560).data;
      const found: Point[] = [];
      for (let y = 2; y < 560; y += 2) {
        for (let x = 2; x < IW; x += 2) {
          const at = (y * IW + x) * 4;
          if (data[at]! + data[at + 1]! + data[at + 2]! < 480) continue;
          if (y > cloudTop(x) - 6) continue;
          if (Math.abs(x - STAR.x) < 150 && Math.abs(y - STAR.y) < 60) continue;
          if (Math.abs(x - STAR.x) < 14) continue; // the beam
          if (found.some((point) => Math.hypot(point.x - x, point.y - y) < 10)) continue;
          found.push({ x, y });
        }
      }
      for (const point of found.slice(0, 60)) {
        stars.push({ ...point, size: 1.2, phase: rand(0, Math.PI * 2), rate: rand(0.8, 1.8), warm: true });
      }
    };
    image.src = backdropUrl;
  }

  const start = performance.now();
  const embers: Particle[] = [];
  const smoke: Particle[] = [];
  const drips: Particle[] = [];
  const meteors: Meteor[] = [];
  const strikes: Strike[] = [];
  const flocks: Flock[] = [];
  const constellations: Constellation[] = [];
  let meteorAt = start + rand(1_000, 3_000);
  let showerAt = start + rand(15_000, 30_000);
  let showerLeft = 0;
  let radiant: Point = { x: 1200, y: 20 };
  let strikeAt = start + rand(3_000, 7_000);
  let flockAt = start + rand(1_500, 4_000);
  let popAt = start + rand(1_000, 3_000);
  let pop = -1;
  let sweep = -1;
  let sweepAt = start + rand(3_000, 6_000);
  let lineAt = start + rand(4_000, 9_000);
  let gust = 0;
  let gustAt = start + rand(6_000, 12_000);
  let gustLife = -1;

  // Cloud, built once. Painting pixels a second: quick enough to see moving,
  // slow enough to be weather. Streaks are flattened blobs.
  const highStreaks = bank(95, 70, 1300, 11, 0.7, 0.3, '150 170 186');
  const starStreaks = bank(190, 80, 1150, -8, 0.75, 0.32, '170 186 200');
  const ruinsMist = bank(650, 130, 1100, -14, 0.3, 0.8, '170 188 204');
  // Loose clouds drifting left to right past the cloud wall, at three
  // depths: the nearer, the bigger, darker and quicker.
  const wisps: Wisp[] = Array.from({ length: 7 }, (_, index) => {
    const near = index % 3;
    const width = [220, 300, 400][near]!;
    const height = [60, 80, 110][near]!;
    return {
      texture: wispTexture(width, height, ['150 168 182', '96 114 128', '40 56 66'][near]!),
      x: rand(-width, IW),
      y: rand(220, 520),
      width,
      height,
      speed: [9, 14, 20][near]! * rand(0.85, 1.15),
      alpha: [0.8, 0.85, 0.9][near]!,
    };
  });

  const X = (x: number) => offsetX + x * scale;
  const Y = (y: number) => offsetY + y * scale;
  const S = (size: number) => Math.max(0.6, size * scale);

  const glow = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, alpha: number) => {
    if (alpha <= 0.002) return;
    const gradient = context.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), S(radius));
    gradient.addColorStop(0, `rgb(${rgb} / ${alpha})`);
    gradient.addColorStop(0.4, `rgb(${rgb} / ${alpha * 0.35})`);
    gradient.addColorStop(1, `rgb(${rgb} / 0)`);
    context.fillStyle = gradient;
    context.fillRect(X(x) - S(radius), Y(y) - S(radius), S(radius) * 2, S(radius) * 2);
  };

  const dot = (context: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string) => {
    context.fillStyle = fill;
    context.beginPath();
    context.arc(X(x), Y(y), S(size), 0, Math.PI * 2);
    context.fill();
  };

  const age = (list: Particle[], dt: number) => {
    const seconds = dt / 1000;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const particle = list[index]!;
      particle.life += dt;
      if (particle.life > particle.span) {
        list.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.angle += particle.spin * seconds;
    }
  };

  const drawBank = (context: CanvasRenderingContext2D, fog: FogBank, now: number) => {
    if (!fog.texture) return;
    const shift = ((((now / 1000) * fog.speed) % fog.tile) + fog.tile) % fog.tile;
    context.globalAlpha = fog.alpha * (0.8 + 0.2 * Math.sin(fog.phase + now / 7000));
    const top = Y(fog.y - fog.height / 2);
    const width = fog.tile * scale + 1;
    for (let x = shift - fog.tile; x < IW; x += fog.tile) {
      context.drawImage(fog.texture, X(x), top, width, fog.height * scale);
    }
    context.globalAlpha = 1;
  };

  const spawnEmber = (fast = false): Particle => {
    const speed = fast ? rand(80, 170) : rand(30, 85);
    const heading = -Math.PI / 2 + rand(-0.75, 0.75);
    return {
      x: FIRE.x + rand(-16, 16),
      y: FIRE.y + rand(-14, 4),
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      life: 0,
      span: fast ? rand(900, 2000) : rand(1500, 4200),
      size: rand(0.6, fast ? 1.9 : 1.5),
      spin: rand(1, 4),
      angle: rand(0, Math.PI * 2),
    };
  };

  const spawnMeteor = (from?: Point): Meteor => {
    if (from) {
      // Out of the radiant, every way but up.
      const angle = rand(0.15, Math.PI - 0.15);
      const speed = rand(380, 620);
      const run = rand(10, 160);
      return {
        x: from.x + Math.cos(angle) * run,
        y: from.y + Math.sin(angle) * run,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        span: rand(500, 900),
        tail: rand(60, 120),
      };
    }
    const leftward = Math.random() < 0.5;
    const angle = rand(15, 42) * (Math.PI / 180);
    const speed = rand(420, 680);
    const long = Math.random() < 0.25;
    return {
      x: rand(40, IW - 40),
      y: rand(5, 90),
      vx: Math.cos(angle) * speed * (leftward ? -1 : 1),
      vy: Math.sin(angle) * speed,
      life: 0,
      span: long ? rand(1000, 1400) : rand(550, 900),
      tail: long ? 170 : 95,
    };
  };

  const spawnFlock = (): Flock => {
    const low = Math.random() < 0.5;
    const lane = low ? LOW : HIGH;
    const leftward = Math.random() < 0.5;
    const roll = Math.random();
    const count = roll < 0.25 ? 1 : roll < 0.45 ? 2 : 3 + Math.floor(Math.random() * 6);
    const startX = leftward ? lane.right + 40 : lane.left - 60;
    const startY = rand(lane.top, lane.bottom);
    const size = rand(6.5, 10);
    return {
      lane,
      vx: rand(45, 80) * (leftward ? -1 : 1),
      vy: rand(-5, 4),
      birds: Array.from({ length: count }, (_, index) => ({
        // A loose V: each bird a little behind and to the side of the one before.
        x: startX - (leftward ? -1 : 1) * index * rand(14, 22),
        y: startY + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * rand(6, 11),
        size: size * rand(0.85, 1.15),
        flap: rand(0, Math.PI * 2),
        rate: rand(7, 10),
      })),
    };
  };

  return {
    resize(width, height, position) {
      // Fitted to the height, as trey.css lays the painting out, not cover.
      scale = height / IH;
      offsetX = (width - IW * scale) * position.x;
      offsetY = (height - IH * scale) * position.y;
    },

    draw(context, now, dt) {
      const seconds = dt / 1000;

      // The wind, for the sparks and smoke: a steady lean, and every so often
      // a gust that builds over two seconds and dies over four.
      if (gustLife < 0 && now >= gustAt) {
        gustLife = 0;
        gust = rand(40, 90) * (Math.random() < 0.8 ? 1 : -1);
      }
      let wind = 10;
      if (gustLife >= 0) {
        gustLife += dt;
        const t = gustLife / 6000;
        if (t >= 1) {
          gustLife = -1;
          gustAt = now + rand(7_000, 16_000);
        } else wind += gust * (t < 0.33 ? t / 0.33 : 1 - (t - 0.33) / 0.67);
      }

      // Stars, only over open sky, each twinkling on its own clock.
      context.globalCompositeOperation = 'lighter';
      for (const star of stars) {
        const breath = 0.5 + 0.5 * Math.sin(star.phase + (now / 1000) * star.rate);
        const rgb = star.warm ? '255 232 196' : '226 238 255';
        dot(context, star.x, star.y, star.size, `rgb(${rgb} / ${0.12 + breath * breath * 0.7})`);
      }

      // Constellations: a few neighbours joined, the line drawing itself
      // star to star, holding, and fading.
      if (now >= lineAt) {
        lineAt = now + rand(9_000, 18_000);
        const chain: Point[] = [stars[Math.floor(Math.random() * stars.length)]!];
        for (let link = 0; link < 4 + Math.floor(Math.random() * 3); link += 1) {
          const tip = chain[chain.length - 1]!;
          const next = stars
            .filter((star) => !chain.includes(star))
            .map((star) => ({ star, gap: Math.hypot(star.x - tip.x, star.y - tip.y) }))
            .filter((entry) => entry.gap > 25 && entry.gap < 110)
            .sort((a, b) => a.gap - b.gap)[Math.floor(Math.random() * 3)];
          if (!next) break;
          chain.push(next.star);
        }
        if (chain.length > 2) constellations.push({ stars: chain, life: 0, span: 6000 });
      }
      for (let index = constellations.length - 1; index >= 0; index -= 1) {
        const shape = constellations[index]!;
        shape.life += dt;
        if (shape.life > shape.span) {
          constellations.splice(index, 1);
          continue;
        }
        const t = shape.life / shape.span;
        const drawn = Math.min(1, t / 0.4) * (shape.stars.length - 1);
        const alpha = 0.32 * (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25);
        context.strokeStyle = `rgb(220 232 255 / ${alpha})`;
        context.lineWidth = S(0.6);
        context.beginPath();
        context.moveTo(X(shape.stars[0]!.x), Y(shape.stars[0]!.y));
        for (let at = 1; at <= Math.ceil(drawn); at += 1) {
          const from = shape.stars[at - 1]!;
          const to = shape.stars[at]!;
          const part = Math.min(1, drawn - (at - 1));
          context.lineTo(X(from.x + (to.x - from.x) * part), Y(from.y + (to.y - from.y) * part));
        }
        context.stroke();
        for (const point of shape.stars) dot(context, point.x, point.y, 1.4, `rgb(240 246 255 / ${alpha * 2.4})`);
      }

      // The great star: a breathing halo, fine rays that shimmer and turn,
      // and the painted cross lit along its length.
      const breath = 0.8 + 0.2 * Math.sin(now / 1700) + 0.06 * Math.sin(now / 230);
      glow(context, STAR.x, STAR.y, 150, '255 214 160', 0.16 * breath);
      glow(context, STAR.x, STAR.y, 34, '255 240 215', 0.6 * breath);
      const turn = now / 40_000;
      context.lineWidth = S(0.5);
      for (let ray = 0; ray < 56; ray += 1) {
        const angle = turn + (ray / 56) * Math.PI * 2;
        const flick = 0.5 + 0.5 * Math.sin(now / (180 + (ray % 7) * 37) + ray * 2.1);
        const length = 26 + (ray % 5) * 9 + flick * 14;
        context.strokeStyle = `rgb(255 226 186 / ${(0.12 + flick * 0.18) * breath})`;
        context.beginPath();
        context.moveTo(X(STAR.x + Math.cos(angle) * 6), Y(STAR.y + Math.sin(angle) * 6));
        context.lineTo(X(STAR.x + Math.cos(angle) * length), Y(STAR.y + Math.sin(angle) * length));
        context.stroke();
      }
      const reach = 1 + 0.08 * Math.sin(now / 900);
      for (const [dx, dy, length, width] of [
        [-1, 0, 120, 1.4], [1, 0, 135, 1.4], [0, -1, 150, 1.6], [0, 1, 260, 1.2],
      ] as const) {
        const far = length * reach;
        const gradient = context.createLinearGradient(X(STAR.x), Y(STAR.y), X(STAR.x + dx * far), Y(STAR.y + dy * far));
        gradient.addColorStop(0, `rgb(255 240 214 / ${0.7 * breath})`);
        gradient.addColorStop(0.3, `rgb(255 222 170 / ${0.3 * breath})`);
        gradient.addColorStop(1, 'rgb(255 222 170 / 0)');
        context.strokeStyle = gradient;
        context.lineWidth = S(width);
        context.beginPath();
        context.moveTo(X(STAR.x), Y(STAR.y));
        context.lineTo(X(STAR.x + dx * far), Y(STAR.y + dy * far));
        context.stroke();
      }
      dot(context, STAR.x, STAR.y, 3, 'rgb(255 250 240 / 0.9)');
      // Light dripping down the long beam toward the cloud.
      if (drips.length < 6 && Math.random() < dt / 700) {
        drips.push({ x: STAR.x, y: STAR.y + 12, vx: 0, vy: rand(50, 110), life: 0, span: rand(2500, 4000), size: rand(0.8, 1.5), spin: 0, angle: 0 });
      }
      age(drips, dt);
      for (const drip of drips) {
        const t = drip.life / drip.span;
        const alpha = t < 0.1 ? t / 0.1 : 1 - t;
        glow(context, drip.x, drip.y, 9, '255 230 190', alpha * 0.5);
        dot(context, drip.x, drip.y, drip.size, `rgb(255 244 224 / ${alpha})`);
      }

      // Meteors: one every few seconds, and a shower now and then, all out
      // of one point in the sky.
      if (now >= showerAt && showerLeft === 0) {
        showerLeft = 10 + Math.floor(Math.random() * 8);
        radiant = { x: rand(700, 1300), y: rand(10, 70) };
        showerAt = now + rand(40_000, 70_000);
      }
      if (showerLeft > 0 && Math.random() < dt / 180) {
        meteors.push(spawnMeteor(radiant));
        showerLeft -= 1;
      }
      if (now >= meteorAt) {
        meteors.push(spawnMeteor());
        meteorAt = Math.random() < 0.25 ? now + rand(250, 800) : now + rand(2_000, 5_500);
      }
      context.lineCap = 'round';
      for (let index = meteors.length - 1; index >= 0; index -= 1) {
        const meteor = meteors[index]!;
        meteor.life += dt;
        meteor.x += meteor.vx * seconds;
        meteor.y += meteor.vy * seconds;
        if (meteor.life > meteor.span || meteor.y > cloudTop(meteor.x) + 10) {
          meteors.splice(index, 1);
          continue;
        }
        const t = meteor.life / meteor.span;
        const bright = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        const norm = Math.hypot(meteor.vx, meteor.vy);
        const tail = meteor.tail * bright + 20;
        const backX = meteor.x - (meteor.vx / norm) * tail;
        const backY = meteor.y - (meteor.vy / norm) * tail;
        const gradient = context.createLinearGradient(X(meteor.x), Y(meteor.y), X(backX), Y(backY));
        gradient.addColorStop(0, `rgb(240 248 255 / ${0.95 * bright})`);
        gradient.addColorStop(1, 'rgb(240 248 255 / 0)');
        context.strokeStyle = gradient;
        context.lineWidth = S(1.3);
        context.beginPath();
        context.moveTo(X(meteor.x), Y(meteor.y));
        context.lineTo(X(backX), Y(backY));
        context.stroke();
        dot(context, meteor.x, meteor.y, 1.3, `rgb(255 255 255 / ${bright})`);
      }

      // Cloud streaks sliding across the high sky and over the star.
      context.globalCompositeOperation = 'source-over';
      drawBank(context, highStreaks, now);
      drawBank(context, starStreaks, now);

      // Lightning, deep in the dark cloud: a strike is two to four flashes
      // in under a second, sometimes with a second strike nearby.
      if (now >= strikeAt) {
        const home = STORMS[Math.floor(Math.random() * STORMS.length)]!;
        const flashes: number[] = [];
        let at = 0;
        for (let index = 0; index < 2 + Math.floor(Math.random() * 3); index += 1) {
          flashes.push(at);
          at += rand(70, 220);
        }
        strikes.push({ x: home.x + rand(-40, 40), y: home.y + rand(-40, 40), life: 0, flashes, radius: rand(170, 280) });
        strikeAt = Math.random() < 0.3 ? now + rand(400, 1200) : now + rand(6_000, 15_000);
      }
      context.globalCompositeOperation = 'screen';
      for (let index = strikes.length - 1; index >= 0; index -= 1) {
        const strike = strikes[index]!;
        strike.life += dt;
        if (strike.life > strike.flashes[strike.flashes.length - 1]! + 400) {
          strikes.splice(index, 1);
          continue;
        }
        let light = 0;
        for (const peak of strike.flashes) {
          const since = strike.life - peak;
          if (since >= 0 && since < 260) light = Math.max(light, since < 40 ? since / 40 : 1 - (since - 40) / 220);
        }
        glow(context, strike.x, strike.y, strike.radius, '186 206 255', 0.38 * light);
        glow(context, strike.x, strike.y, strike.radius * 0.35, '230 238 255', 0.3 * light);
      }

      // The cloud's lit rim: each point breathes on its own clock, and a band
      // of light runs along the whole edge every so often.
      if (sweep < 0 && now >= sweepAt) sweep = 0;
      let along01 = -1;
      if (sweep >= 0) {
        sweep += dt;
        along01 = sweep / 3500;
        if (along01 >= 1) {
          sweep = -1;
          along01 = -1;
          sweepAt = now + rand(8_000, 15_000);
        }
      }
      RIM.forEach(([x, y], index) => {
        const along = index / (RIM.length - 1);
        const band = along01 < 0 ? 0 : Math.max(0, 1 - Math.abs(along - along01) * 6);
        const pulse = 0.6 + 0.4 * Math.sin(now / 2300 + index * 0.9);
        glow(context, x, y, 85, '255 222 178', 0.07 * pulse + band * 0.16);
      });

      // Loose clouds drifting past; each comes back in from the left at a
      // new height when it has crossed.
      context.globalCompositeOperation = 'source-over';
      for (const wisp of wisps) {
        wisp.x += wisp.speed * seconds;
        if (wisp.x > IW + 20) {
          wisp.x = -wisp.width - rand(0, 300);
          wisp.y = rand(220, 520);
        }
        if (!wisp.texture) continue;
        context.globalAlpha = wisp.alpha;
        context.drawImage(wisp.texture, X(wisp.x), Y(wisp.y - wisp.height / 2), wisp.width * scale, wisp.height * scale);
      }
      context.globalAlpha = 1;

      // Birds: a new flock every few seconds, two in the air at most, dark
      // against the sky and the lit cloud.
      if (flocks.length < 2 && now >= flockAt) {
        flocks.push(spawnFlock());
        flockAt = now + rand(4_000, 10_000);
      }
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = 'rgb(6 12 16 / 0.88)';
      for (let index = flocks.length - 1; index >= 0; index -= 1) {
        const flock = flocks[index]!;
        let gone = true;
        for (const bird of flock.birds) {
          bird.x += flock.vx * seconds;
          bird.y += flock.vy * seconds + Math.sin(now / 600 + bird.flap) * 0.08;
          bird.flap += bird.rate * seconds;
          if (bird.x > flock.lane.left - 120 && bird.x < flock.lane.right + 120) gone = false;
          const wing = Math.sin(bird.flap);
          const span = bird.size;
          context.lineWidth = S(1.3);
          context.beginPath();
          context.moveTo(X(bird.x - span), Y(bird.y - wing * span * 0.6));
          context.quadraticCurveTo(X(bird.x - span * 0.4), Y(bird.y - wing * span * 0.2 - 1), X(bird.x), Y(bird.y));
          context.quadraticCurveTo(X(bird.x + span * 0.4), Y(bird.y - wing * span * 0.2 - 1), X(bird.x + span), Y(bird.y - wing * span * 0.6));
          context.stroke();
        }
        if (gone) flocks.splice(index, 1);
      }

      drawBank(context, ruinsMist, now);

      // Smoke off the fire, leaning with the wind.
      if (smoke.length < 10 && Math.random() < dt / 600) {
        smoke.push({ x: FIRE.x + rand(-8, 8), y: FIRE.y - 30, vx: rand(2, 8), vy: -rand(12, 22), life: 0, span: rand(6000, 9000), size: rand(10, 16), spin: 0, angle: 0 });
      }
      age(smoke, dt);
      for (const puff of smoke) {
        const t = puff.life / puff.span;
        puff.vx += (wind - puff.vx) * 0.3 * seconds;
        const radius = puff.size * (1 + t * 3.5);
        const alpha = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.08;
        glow(context, puff.x, puff.y, radius, '150 160 168', alpha);
      }

      // The fire: light on the snow, flickering on three odd clocks, and a
      // flash when it pops.
      const flicker =
        0.62 + 0.15 * Math.sin(now / 83) + 0.1 * Math.sin(now / 41 + 1.3) + 0.08 * Math.sin(now / 197 + 0.4) + rand(-0.06, 0.06);
      if (pop < 0 && now >= popAt) {
        pop = 0;
        for (let index = 0; index < 18 + Math.floor(Math.random() * 18); index += 1) embers.push(spawnEmber(true));
      }
      let popLight = 0;
      if (pop >= 0) {
        pop += dt;
        popLight = Math.max(0, 1 - pop / 500);
        if (pop > 500) {
          pop = -1;
          popAt = now + rand(1_500, 4_500);
        }
      }
      context.globalCompositeOperation = 'screen';
      glow(context, FIRE.x, FIRE.y, 280, '255 130 50', 0.22 * flicker + popLight * 0.12);
      glow(context, FIRE.x, FIRE.y - 6, 70, '255 196 120', 0.5 * flicker + popLight * 0.3);
      glow(context, FIRE.x, FIRE.y - 14, 22, '255 236 190', 0.6 * flicker);

      // Sparks pouring up, wandering, leaning with the wind; yellow, then
      // orange, then red as they cool.
      while (embers.length < 140) embers.push(spawnEmber());
      age(embers, dt);
      context.globalCompositeOperation = 'lighter';
      for (const ember of embers) {
        const t = ember.life / ember.span;
        ember.vx += (Math.sin(ember.angle) * 18 + (wind - ember.vx) * 0.6) * seconds;
        ember.vy *= 1 - 0.25 * seconds;
        const alpha = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
        const g = Math.round(215 - t * 155);
        const b = Math.round(110 - t * 90);
        if (ember.size > 1.3) glow(context, ember.x, ember.y, ember.size * 4, `255 ${g} ${b}`, alpha * 0.3);
        dot(context, ember.x, ember.y, ember.size * (1 - t * 0.5), `rgb(255 ${g} ${b} / ${alpha * 0.95})`);
      }

      // The painting's sides fade into the room (trey.css); fade everything
      // drawn here the same way, and clear what fell outside it.
      const fade = EDGE / IW;
      const edges = context.createLinearGradient(X(0), 0, X(IW), 0);
      edges.addColorStop(0, 'rgb(0 0 0 / 0)');
      edges.addColorStop(fade, 'rgb(0 0 0 / 1)');
      edges.addColorStop(1 - fade, 'rgb(0 0 0 / 1)');
      edges.addColorStop(1, 'rgb(0 0 0 / 0)');
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = edges;
      context.fillRect(-1e4, -1e4, 1e5, 1e5);
      context.globalCompositeOperation = 'source-over';
    },
  };
}

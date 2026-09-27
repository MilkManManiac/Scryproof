/*
 * The lake: everything that moves in Lady of the Lake's painting, pinned to
 * the painting itself, the way camp-scene.ts does it for Loaf v2.
 *
 * The painting is `assets/gen/lake-b.jpg` (1376 x 768): Wes's picture
 * (`lake-a.jpg`, 2026-09-26, square) widened to the screen's shape through
 * imagegen, the middle kept. A flooded stone court at night in a forest,
 * lanterns on the columns, a round fountain with a small blue tree in it.
 * Every point here is in the painting's own pixels and goes through the
 * `background-size: cover` arithmetic before it is drawn.
 *
 * What moves, back to front:
 *   mist      teal banks sliding through the forest, over the back of the
 *             pool, and across the front, opposite ways
 *   lanterns  every lantern and lit column flickers on its own clock, and
 *             the two lantern reflections in the water flicker with them
 *   moths     two or three round each of the near lanterns
 *   tree      the blue tree breathes light, and lets fall glowing petals
 *             that land on the water, ring it, and float a while
 *   fountain  slow threads of light turning in the fountain's basin
 *   water     glints of light on the surface, and rings where something
 *             touched it; the view is from above at a slant, so rings are
 *             ellipses half as tall as wide
 *   koi       now and then a pale fish slides under the surface
 *   wisps     a few blue-green lights drifting over the pool
 *   motes     gold specks wandering low, like the ones in the painting
 *   the lady  every minute or so the front of the pool lights from below,
 *             rings spread, and a sword of light rises out of the water,
 *             holds, and sinks again
 *
 * The same rules as the rest of Ambient: thirty frames a second, stopped
 * when the tab is hidden, never started under reduce motion.
 */

import { bank, type FogBank, type Scene } from './camp-scene';

/** The painting's size, in its own pixels. */
const IW = 1376;
const IH = 768;

/** The hanging lanterns, big and near, and the lit slits in the far columns. */
const LANTERNS = [
  { x: 72, y: 375, r: 44 },
  { x: 158, y: 283, r: 38 },
  { x: 268, y: 207, r: 30 },
  { x: 1108, y: 205, r: 30 },
  { x: 1215, y: 283, r: 38 },
  { x: 1297, y: 378, r: 44 },
  { x: 432, y: 157, r: 18 },
  { x: 547, y: 122, r: 16 },
  { x: 637, y: 105, r: 14 },
  { x: 800, y: 112, r: 16 },
  { x: 929, y: 140, r: 18 },
];
/** Lantern light already painted on the water, and which lantern it follows. */
const REFLECTIONS = [
  { x: 245, y: 535, of: 2 },
  { x: 1128, y: 528, of: 3 },
];
const TREE = { x: 712, y: 192, r: 78 };
const BASIN = { x: 718, y: 380, rx: 135, ry: 62 };
/** Where the sword comes up: the open water in front of the fountain. */
const LADY = { x: 705, y: 626 };
/** Lanes a fish swims, each a straight line through open water. */
const LANES = [
  { from: { x: 500, y: 640 }, to: { x: 870, y: 600 } },
  { from: { x: 430, y: 300 }, to: { x: 440, y: 540 } },
  { from: { x: 470, y: 272 }, to: { x: 640, y: 262 } },
  { from: { x: 800, y: 268 }, to: { x: 990, y: 300 } },
  { from: { x: 560, y: 390 }, to: { x: 870, y: 395 } },
];

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/**
 * Whether a point in the painting is open water. Drawn by hand over the
 * painting (checked as an overlay on 2026-09-26): the pool round the
 * fountain, the fountain's own basin, the two side channels, less the big
 * column, the tree, the steps, and the carved stones in front.
 */
export function isWater(x: number, y: number): boolean {
  const pool = inEllipse(x, y, 685, 440, 335, 248) && y > 212 && !inEllipse(x, y, 712, 410, 205, 138);
  const basin = inEllipse(x, y, BASIN.x, BASIN.y, BASIN.rx, BASIN.ry) && !inEllipse(x, y, 716, 338, 52, 40);
  const sides = (x >= 230 && x <= 330 && y >= 380 && y <= 560) || (x >= 1045 && x <= 1150 && y >= 380 && y <= 560);
  const blocked =
    (x >= 282 && x <= 385 && y < 560) ||
    inEllipse(x, y, 392, 590, 72, 58) ||
    inEllipse(x, y, 540, 700, 110, 130) ||
    inEllipse(x, y, 1000, 640, 150, 170) ||
    inEllipse(x, y, 710, 200, 82, 58) ||
    (x >= 505 && x <= 605 && y >= 205 && y <= 258);
  return (pool || basin || sides) && !blocked;
}

interface Point {
  x: number;
  y: number;
}

interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  span: number;
  size: number;
  angle: number;
  spin: number;
}

interface Petal extends Particle {
  /** How far it falls before it meets the water, in the painting's pixels. */
  drop: number;
  fallen: number;
  /** Set once it lands: floating, or gone if it came down on stone. */
  afloat: boolean;
}

interface Ripple extends Point {
  life: number;
  span: number;
  reach: number;
  strength: number;
}

interface Drifter extends Point {
  vx: number;
  vy: number;
  phase: number;
  period: number;
}

interface Koi {
  from: Point;
  to: Point;
  life: number;
  span: number;
  size: number;
  phase: number;
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;

/** A random point on open water, found by trying. */
function waterPoint(): Point {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const x = rand(220, 1160);
    const y = rand(212, 700);
    if (isWater(x, y)) return { x, y };
  }
  return { x: LADY.x, y: LADY.y };
}

/** How long the lady's moment lasts, and its beats, in milliseconds. */
const LADY_MS = 8_000;
const RISE_AT = 1_200;
const HOLD_AT = 3_200;
const SINK_AT = 5_600;
const GONE_AT = 7_000;
/** The sword, tip to pommel, in the painting's pixels. */
const BLADE = 84;
const SWORD = 112;

export function lakeScene(): Scene {
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const X = (x: number) => offsetX + x * scale;
  const Y = (y: number) => offsetY + y * scale;
  /** A size in the painting's pixels, never under a screen pixel. */
  const S = (size: number) => Math.max(0.8, size * scale);

  const glints: Particle[] = [];
  const ripples: Ripple[] = [];
  const petals: Petal[] = [];
  const koi: Koi[] = [];
  const sparks: Particle[] = [];
  let rippleAt = performance.now() + rand(300, 1200);
  let petalAt = performance.now() + rand(800, 2500);
  let koiAt = performance.now() + rand(5_000, 12_000);
  // The first one soon, so anyone trying the theme sees it; then about once a minute.
  let ladyAt = performance.now() + rand(12_000, 20_000);
  let lady = -1;
  let ladyRingAt = 0;

  const lanternPhase = LANTERNS.map(() => rand(0, 100));

  const forest = bank(70, 130, 1300, 6, 0.55, 1, '160 225 230');
  const back = bank(250, 90, 1100, -11, 0.5, 0.6, '185 238 240');
  const middle = bank(430, 110, 1250, 8, 0.28, 0.7, '185 238 240');
  const front = bank(630, 150, 1200, 15, 0.45, 0.8, '185 238 240');

  const moths = LANTERNS.slice(0, 6).flatMap((lantern, index) =>
    Array.from({ length: index % 3 === 0 ? 3 : 2 }, () => ({
      home: lantern,
      angle: rand(0, Math.PI * 2),
      speed: rand(2.5, 5) * (Math.random() < 0.5 ? -1 : 1),
      reach: rand(9, 18),
      wobble: rand(0, 10),
    })),
  );

  const wisps: Drifter[] = Array.from({ length: 7 }, () => {
    const point = waterPoint();
    return { ...point, vx: rand(-6, 6), vy: rand(-3, 3), phase: rand(0, 10), period: rand(5, 9) };
  });

  const motes: Drifter[] = Array.from({ length: 34 }, () => ({
    x: rand(0, IW),
    y: rand(380, 760),
    vx: rand(-4, 4),
    vy: rand(-3, 3),
    phase: rand(0, 10),
    period: rand(2.5, 6),
  }));

  const glow = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, alpha: number) => {
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

  const drawBank = (context: CanvasRenderingContext2D, fog: FogBank, now: number) => {
    if (!fog.texture) return;
    const shift = ((((now / 1000) * fog.speed) % fog.tile) + fog.tile) % fog.tile;
    context.globalAlpha = fog.alpha * (0.8 + 0.2 * Math.sin(fog.phase + now / 8000));
    const top = Y(fog.y - fog.height / 2);
    const width = fog.tile * scale + 1;
    for (let x = shift - fog.tile; x < IW; x += fog.tile) {
      context.drawImage(fog.texture, X(x), top, width, fog.height * scale);
    }
    context.globalAlpha = 1;
  };

  const ring = (x: number, y: number, reach: number, strength = 1) =>
    ripples.push({ x, y, life: 0, span: rand(1800, 2800) * (reach > 40 ? 1.4 : 1), reach, strength });

  /** Move a list of particles; drop the dead. */
  const age = <T extends Particle>(list: T[], dt: number) => {
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

  /** The sword, drawn with its tip at (x, top), pointing up. `alpha` fades the whole of it. */
  const drawSword = (context: CanvasRenderingContext2D, x: number, top: number, alpha: number, gleam: number) => {
    const bladeBottom = top + BLADE;
    // Its light: a soft column round the blade.
    context.strokeStyle = `rgb(150 215 255 / ${0.08 * alpha})`;
    context.lineWidth = S(30);
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(X(x), Y(top + 4));
    context.lineTo(X(x), Y(bladeBottom));
    context.stroke();
    context.strokeStyle = `rgb(170 225 255 / ${0.18 * alpha})`;
    context.lineWidth = S(12);
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(X(x), Y(top + 4));
    context.lineTo(X(x), Y(bladeBottom));
    context.stroke();
    // The blade: a long thin taper to the point.
    context.fillStyle = `rgb(225 242 255 / ${0.92 * alpha})`;
    context.beginPath();
    context.moveTo(X(x), Y(top));
    context.lineTo(X(x + 3.2), Y(top + 10));
    context.lineTo(X(x + 3), Y(bladeBottom));
    context.lineTo(X(x - 3), Y(bladeBottom));
    context.lineTo(X(x - 3.2), Y(top + 10));
    context.closePath();
    context.fill();
    // The fuller, brightest down the middle.
    context.strokeStyle = `rgb(255 255 255 / ${alpha})`;
    context.lineWidth = S(0.8);
    context.beginPath();
    context.moveTo(X(x), Y(top + 6));
    context.lineTo(X(x), Y(bladeBottom - 2));
    context.stroke();
    // A gleam running up the blade.
    if (gleam >= 0 && gleam <= 1) {
      const at = bladeBottom - gleam * BLADE;
      glow(context, x, at, 12, '235 248 255', 0.8 * alpha * Math.sin(gleam * Math.PI));
    }
    // Guard, grip and pommel, gold.
    context.fillStyle = `rgb(236 200 120 / ${0.9 * alpha})`;
    context.beginPath();
    context.ellipse(X(x), Y(bladeBottom + 1.5), S(14), S(2.4), 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = `rgb(200 160 95 / ${0.9 * alpha})`;
    context.fillRect(X(x - 1.8), Y(bladeBottom + 3), S(3.6), S(SWORD - BLADE - 9));
    dot(context, x, top + SWORD - 3, 3, `rgb(236 200 120 / ${0.9 * alpha})`);
  };

  return {
    resize(width, height, position) {
      scale = Math.max(width / IW, height / IH);
      offsetX = (width - IW * scale) * position.x;
      offsetY = (height - IH * scale) * position.y;
    },

    draw(context, now, dt) {
      const seconds = dt / 1000;

      // Mist in the forest behind, and over the back of the pool.
      drawBank(context, forest, now);
      drawBank(context, back, now);

      // Lanterns: each flickers on its own clock, and the water holds two of them.
      context.globalCompositeOperation = 'screen';
      const flickers = LANTERNS.map((lantern, index) => {
        const t = now + lanternPhase[index]! * 1000;
        return 0.7 + 0.12 * Math.sin(t / 97) + 0.1 * Math.sin(t / 41 + index) + 0.06 * Math.sin(t / 233) + rand(-0.04, 0.04);
      });
      LANTERNS.forEach((lantern, index) => {
        const flicker = flickers[index]!;
        glow(context, lantern.x, lantern.y, lantern.r * 2.4, '255 165 70', 0.16 * flicker);
        glow(context, lantern.x, lantern.y, lantern.r * 0.6, '255 215 140', 0.4 * flicker);
      });
      for (const reflection of REFLECTIONS) {
        const flicker = flickers[reflection.of]!;
        const sway = Math.sin(now / 700 + reflection.x) * 1.5;
        glow(context, reflection.x + sway, reflection.y, 16, '255 180 90', 0.35 * flicker);
      }

      // The tree breathes a blue-silver light.
      const breath = 0.5 + 0.5 * Math.sin(now / 3200);
      glow(context, TREE.x, TREE.y, TREE.r * 1.8, '140 200 255', 0.1 + 0.08 * breath);
      glow(context, TREE.x, TREE.y + 8, TREE.r * 0.8, '190 225 255', 0.08 + 0.07 * breath);
      context.globalCompositeOperation = 'source-over';

      // Moths round the near lanterns, lit by them.
      for (const moth of moths) {
        moth.angle += moth.speed * seconds;
        const wobble = Math.sin(now / 180 + moth.wobble) * 4;
        const x = moth.home.x + Math.cos(moth.angle) * (moth.reach + wobble);
        const y = moth.home.y + Math.sin(moth.angle * 1.3) * (moth.reach * 0.7) + wobble * 0.5;
        dot(context, x, y, 1, 'rgb(255 236 200 / 0.85)');
      }

      // Threads of light turning in the fountain's basin.
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';
      for (let index = 0; index < 3; index += 1) {
        const turn = now / (9000 + index * 2300) + index * 2.1;
        const size = 0.45 + index * 0.2;
        context.strokeStyle = `rgb(140 235 240 / ${0.1 + 0.05 * Math.sin(now / 1500 + index)})`;
        context.lineWidth = S(1.4);
        context.beginPath();
        context.ellipse(X(BASIN.x), Y(BASIN.y + 6), S(BASIN.rx * size), S(BASIN.ry * size), 0, turn, turn + 1.6);
        context.stroke();
      }

      // Glints: light catching the surface for a moment.
      while (glints.length < 46) {
        const point = waterPoint();
        glints.push({ ...point, vx: rand(-2, 2), vy: 0, life: rand(-3000, 0), span: rand(500, 1300), size: rand(2, 5), angle: 0, spin: 0 });
      }
      age(glints, dt);
      for (const glint of glints) {
        if (glint.life < 0) continue;
        const shine = Math.sin((glint.life / glint.span) * Math.PI);
        // Brightest in the middle and gone at the ends, so it reads as light
        // on a ripple and not a dash.
        const streak = context.createLinearGradient(X(glint.x - glint.size), 0, X(glint.x + glint.size), 0);
        streak.addColorStop(0, 'rgb(210 250 255 / 0)');
        streak.addColorStop(0.5, `rgb(220 252 255 / ${0.6 * shine})`);
        streak.addColorStop(1, 'rgb(210 250 255 / 0)');
        context.strokeStyle = streak;
        context.lineWidth = S(0.9);
        context.beginPath();
        context.moveTo(X(glint.x - glint.size), Y(glint.y));
        context.lineTo(X(glint.x + glint.size), Y(glint.y));
        context.stroke();
      }
      context.globalCompositeOperation = 'source-over';

      // Rings where something touched the water.
      if (now >= rippleAt) {
        const point = waterPoint();
        ring(point.x, point.y, rand(12, 30));
        rippleAt = now + rand(500, 1800);
      }
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        const ripple = ripples[index]!;
        ripple.life += dt;
        const t = ripple.life / ripple.span;
        if (t >= 1) {
          ripples.splice(index, 1);
          continue;
        }
        for (const lag of [0, 0.2]) {
          const u = t - lag;
          if (u <= 0) continue;
          const radius = ripple.reach * Math.sqrt(u);
          context.strokeStyle = `rgb(200 245 250 / ${0.4 * ripple.strength * (1 - u) * (lag ? 0.55 : 1)})`;
          context.lineWidth = S(0.9);
          context.beginPath();
          context.ellipse(X(ripple.x), Y(ripple.y), S(radius), S(radius * 0.5), 0, 0, Math.PI * 2);
          context.stroke();
        }
      }

      // A pale fish, under the surface, now and then.
      if (now >= koiAt) {
        const lane = pick(LANES);
        const reverse = Math.random() < 0.5;
        koi.push({
          from: reverse ? lane.to : lane.from,
          to: reverse ? lane.from : lane.to,
          life: 0,
          span: rand(9_000, 14_000),
          size: rand(9, 13),
          phase: rand(0, 10),
        });
        koiAt = now + rand(10_000, 25_000);
      }
      for (let index = koi.length - 1; index >= 0; index -= 1) {
        const fish = koi[index]!;
        fish.life += dt;
        const t = fish.life / fish.span;
        if (t >= 1) {
          koi.splice(index, 1);
          continue;
        }
        const dx = fish.to.x - fish.from.x;
        const dy = fish.to.y - fish.from.y;
        const length = Math.hypot(dx, dy);
        const nx = -dy / length;
        const ny = dx / length;
        const weave = Math.sin(t * 9 + fish.phase) * 6;
        const x = fish.from.x + dx * t + nx * weave;
        const y = fish.from.y + dy * t + ny * weave;
        if (!isWater(x, y)) continue;
        // Faded in and out at the ends of its lane, as if coming up from deeper water.
        const alpha = Math.min(1, t / 0.12, (1 - t) / 0.12) * 0.34;
        const heading = Math.atan2(dy, dx) + Math.cos(t * 9 + fish.phase) * 0.25;
        const tailSwing = Math.sin(now / 160 + fish.phase) * 0.5;
        context.save();
        context.translate(X(x), Y(y));
        // Flattened like the rings: the pool is seen from above at a slant.
        context.scale(1, 0.6);
        context.rotate(heading);
        context.fillStyle = `rgb(255 196 150 / ${alpha})`;
        context.beginPath();
        context.ellipse(0, 0, S(fish.size), S(fish.size * 0.32), 0, 0, Math.PI * 2);
        context.fill();
        context.rotate(tailSwing);
        context.beginPath();
        context.moveTo(-S(fish.size * 0.8), 0);
        context.lineTo(-S(fish.size * 1.5), -S(fish.size * 0.35));
        context.lineTo(-S(fish.size * 1.5), S(fish.size * 0.35));
        context.closePath();
        context.fill();
        context.restore();
        if (Math.random() < dt / 2500) ring(x, y, rand(8, 14), 0.6);
      }

      // Petals: the tree lets one go every second or two; it drifts down,
      // and if it lands on water it rings it and floats.
      if (now >= petalAt) {
        const angle = rand(0, Math.PI * 2);
        const reach = Math.sqrt(Math.random()) * TREE.r;
        petals.push({
          x: TREE.x + Math.cos(angle) * reach,
          y: TREE.y + Math.sin(angle) * reach * 0.6,
          vx: rand(-8, 8),
          vy: rand(14, 22),
          life: 0,
          span: rand(14_000, 20_000),
          size: rand(1.6, 2.4),
          angle: rand(0, Math.PI * 2),
          spin: rand(1, 2.5) * (Math.random() < 0.5 ? -1 : 1),
          drop: rand(50, 230),
          fallen: 0,
          afloat: false,
        });
        petalAt = now + rand(900, 2600);
      }
      context.globalCompositeOperation = 'lighter';
      for (let index = petals.length - 1; index >= 0; index -= 1) {
        const petal = petals[index]!;
        petal.life += dt;
        if (!petal.afloat) {
          const step = petal.vy * seconds;
          petal.fallen += step;
          petal.y += step;
          petal.x += (petal.vx + Math.sin(petal.life / 600 + petal.angle) * 10) * seconds;
          petal.angle += petal.spin * seconds;
          if (petal.fallen >= petal.drop) {
            if (!isWater(petal.x, petal.y)) {
              petals.splice(index, 1);
              continue;
            }
            petal.afloat = true;
            petal.life = 0;
            petal.span = rand(6_000, 10_000);
            ring(petal.x, petal.y, rand(10, 18), 0.8);
          }
        } else {
          petal.x += Math.sin(petal.life / 1400 + petal.angle) * 1.5 * seconds;
          if (petal.life > petal.span) {
            petals.splice(index, 1);
            continue;
          }
        }
        const fade = petal.afloat ? 1 - petal.life / petal.span : Math.min(1, petal.life / 400);
        glow(context, petal.x, petal.y, petal.size * 4, '140 200 255', 0.3 * fade);
        context.save();
        context.translate(X(petal.x), Y(petal.y));
        context.rotate(petal.angle);
        context.fillStyle = `rgb(200 230 255 / ${0.85 * fade})`;
        context.beginPath();
        context.ellipse(0, 0, S(petal.size), S(petal.size * (petal.afloat ? 0.3 : 0.5)), 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      // Wisps drifting over the pool, turning back at its edge.
      for (const wisp of wisps) {
        wisp.vx += rand(-3, 3) * seconds;
        wisp.vy += rand(-2, 2) * seconds;
        wisp.vx = Math.max(-9, Math.min(9, wisp.vx));
        wisp.vy = Math.max(-5, Math.min(5, wisp.vy));
        const nextX = wisp.x + wisp.vx * seconds;
        const nextY = wisp.y + wisp.vy * seconds;
        if (isWater(nextX, nextY)) {
          wisp.x = nextX;
          wisp.y = nextY;
        } else {
          wisp.vx = -wisp.vx;
          wisp.vy = -wisp.vy;
        }
        const pulse = 0.6 + 0.4 * Math.sin(now / 1000 / wisp.period * Math.PI * 2 + wisp.phase);
        const lift = Math.sin(now / 900 + wisp.phase) * 3 - 8;
        glow(context, wisp.x, wisp.y + lift, 22, '110 235 220', 0.22 * pulse);
        dot(context, wisp.x, wisp.y + lift, 1.6, `rgb(210 255 245 / ${0.8 * pulse})`);
        // Its light on the water under it.
        glow(context, wisp.x, wisp.y + 4, 14, '110 235 220', 0.06 * pulse);
      }

      // Gold specks, low.
      for (const mote of motes) {
        mote.vx += rand(-6, 6) * seconds;
        mote.vy += rand(-5, 5) * seconds;
        mote.vx *= 0.99;
        mote.vy *= 0.99;
        mote.x += mote.vx * seconds;
        mote.y += mote.vy * seconds;
        if (mote.x < -10) mote.x = IW + 10;
        if (mote.x > IW + 10) mote.x = -10;
        if (mote.y < 360) mote.vy += 8 * seconds;
        if (mote.y > IH) mote.vy -= 8 * seconds;
        const t = ((now / 1000 + mote.phase) % mote.period) / mote.period;
        const on = t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : 0;
        if (on < 0.02) continue;
        glow(context, mote.x, mote.y, 6, '255 205 110', 0.35 * on);
        dot(context, mote.x, mote.y, 0.9, `rgb(255 235 170 / ${on})`);
      }
      context.globalCompositeOperation = 'source-over';

      // Mist across the middle and the front of the pool, over the fish and petals.
      drawBank(context, middle, now);
      drawBank(context, front, now);

      // The lady of the lake.
      if (lady < 0 && now >= ladyAt) {
        lady = 0;
        ladyRingAt = 0;
      }
      if (lady >= 0) {
        lady += dt;
        if (lady >= LADY_MS) {
          lady = -1;
          ladyAt = now + rand(50_000, 100_000);
        } else {
          // The water lights from below, most while the sword is up.
          const light =
            lady < RISE_AT
              ? lady / RISE_AT
              : lady < SINK_AT
                ? 1
                : Math.max(0, 1 - (lady - SINK_AT) / (LADY_MS - SINK_AT));
          context.globalCompositeOperation = 'lighter';
          context.save();
          context.translate(X(LADY.x), Y(LADY.y));
          context.scale(1, 0.5);
          const gradient = context.createRadialGradient(0, 0, 0, 0, 0, S(110));
          gradient.addColorStop(0, `rgb(150 225 255 / ${0.4 * light})`);
          gradient.addColorStop(0.5, `rgb(90 200 230 / ${0.14 * light})`);
          gradient.addColorStop(1, 'rgb(90 200 230 / 0)');
          context.fillStyle = gradient;
          context.fillRect(-S(110), -S(110), S(220), S(220));
          context.restore();
          if (lady >= ladyRingAt && lady < GONE_AT) {
            ring(LADY.x + rand(-3, 3), LADY.y + rand(-2, 2), rand(45, 70), 1);
            ladyRingAt = lady + (lady < HOLD_AT ? 450 : 900);
          }

          // How much of the sword is above the water.
          const out =
            lady < RISE_AT
              ? 0
              : lady < HOLD_AT
                ? easeOut((lady - RISE_AT) / (HOLD_AT - RISE_AT))
                : lady < SINK_AT
                  ? 1
                  : lady < GONE_AT
                    ? 1 - easeIn((lady - SINK_AT) / (GONE_AT - SINK_AT))
                    : 0;
          if (out > 0) {
            const top = LADY.y - out * (SWORD - 4) + Math.sin(lady / 500) * (out === 1 ? 1 : 0);
            const gleam = lady >= HOLD_AT && lady < SINK_AT ? (lady - HOLD_AT - 300) / 1200 : -1;
            // Above the surface only: it comes up through the water.
            context.save();
            context.beginPath();
            context.rect(0, 0, context.canvas.width, Y(LADY.y));
            context.clip();
            drawSword(context, LADY.x, top, Math.min(1, out * 3), gleam);
            context.restore();
            // Light coming off the blade and drifting up.
            if (out > 0.5 && Math.random() < dt / 90) {
              sparks.push({
                x: LADY.x + rand(-4, 4),
                y: top + rand(0, BLADE),
                vx: rand(-5, 5),
                vy: -rand(8, 20),
                life: 0,
                span: rand(1200, 2400),
                size: rand(0.7, 1.4),
                angle: 0,
                spin: 0,
              });
            }
            // Its reflection, below the surface, faint and wavering.
            context.save();
            context.beginPath();
            context.rect(0, Y(LADY.y), context.canvas.width, context.canvas.height);
            context.clip();
            context.translate(X(LADY.x) + Math.sin(lady / 180) * S(1.5), Y(LADY.y));
            context.scale(1, -0.55);
            context.translate(-X(LADY.x), -Y(LADY.y));
            context.globalAlpha = 0.28;
            drawSword(context, LADY.x, top, Math.min(1, out * 3), -1);
            context.restore();
          }
          context.globalCompositeOperation = 'source-over';
        }
      }
      if (sparks.length) {
        age(sparks, dt);
        context.globalCompositeOperation = 'lighter';
        for (const spark of sparks) {
          const t = spark.life / spark.span;
          glow(context, spark.x, spark.y, spark.size * 5, '150 215 255', 0.35 * (1 - t));
          dot(context, spark.x, spark.y, spark.size, `rgb(230 245 255 / ${1 - t})`);
        }
        context.globalCompositeOperation = 'source-over';
      }
    },
  };
}

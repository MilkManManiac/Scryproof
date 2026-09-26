/*
 * The camp: everything that moves in Loaf v2's painting, pinned to the
 * painting itself.
 *
 * The other words in Ambient.tsx place their motion by fractions of the
 * window. This one cannot: the fire, the moon and the staff tips are points
 * in the picture, and the picture is laid out by `background-size: cover`,
 * so where a point lands depends on the window's shape. Every point here is
 * in the painting's own pixels (1376 x 768, `assets/gen/loaf2-b.jpg`, the
 * party on the log with their backs to us, small in the clearing) and goes
 * through the same arithmetic the browser uses for cover before it is
 * drawn. Sizes scale with the painting too, so a spark is the same size
 * against the fire on a laptop and on a big monitor.
 *
 * What moves, back to front:
 *   stars     twinkle only where the painting has sky: the picture is read
 *             once, and only bright blue pixels in the top third take a star
 *   moon      a slow halo, breathing
 *   shooting  every few seconds across the open sky left of the oak,
 *             sometimes two close together
 *   cloud     thin streaks of cloud sliding across the moon
 *   birds     flocks, pairs and lone birds, high over the castle or small
 *             and far off over the valley, one after another
 *   fog       rolling banks of mist: two through the valley, opposite ways,
 *             one drifting across the clearing, one low over the grass
 *   smoke     from the fire, rising, spreading, leaning with the air
 *   fire      the light on the clearing flickers; sparks rise off the flames
 *   staffs    the wizard's staff pulses blue and throws motes, and every so
 *             often casts: a ring and a burst; the druid's glows green and
 *             lets fall a leaf
 *   horns     the tiefling's horns smoulder, violet wisps curling up
 *   oak       now and then a leaf lets go of the big oak and drifts down
 *   fireflies wandering the undergrowth, yellow-green
 *
 * The same rules as the rest of Ambient: thirty frames a second, stopped
 * when the tab is hidden, never started under reduce motion.
 */

/** The painting's size, in its own pixels. */
const IW = 1376;
const IH = 768;

const FIRE = { x: 680, y: 572 };
const MOON = { x: 509, y: 166, r: 94 };
const WIZARD = { x: 614, y: 486 };
const DRUID = { x: 711, y: 484 };
const HORNS = { x: 928, y: 492 };
/** The oak's canopy, where its leaves let go. */
const CANOPY = { left: 700, right: 1300, top: 90, bottom: 240 };

/** Where things fly. High: the open sky left of the oak. Far: low over the valley, under the oak's branches. */
const SKY = { left: 120, right: 680, top: 15, bottom: 170 };
const FAR = { left: 60, right: 1040, top: 236, bottom: 288 };

interface Point {
  x: number;
  y: number;
}

interface Star extends Point {
  size: number;
  phase: number;
  rate: number;
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

/** A band of mist: one tile of fog texture, repeated across the painting and sliding sideways. */
interface FogBank {
  texture: HTMLCanvasElement | null;
  y: number;
  height: number;
  /** One tile's width, in the painting's pixels. */
  tile: number;
  /** Painting pixels a second; negative drifts left. */
  speed: number;
  alpha: number;
  phase: number;
}

interface Bird {
  x: number;
  y: number;
  size: number;
  flap: number;
  rate: number;
}

interface Flock {
  birds: Bird[];
  vx: number;
  vy: number;
  lane: typeof SKY;
}

interface Meteor extends Point {
  vx: number;
  vy: number;
  life: number;
  span: number;
  tail: number;
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);

/**
 * One tile of fog: soft blobs of mist that wrap around left to right, so the
 * tile repeats with no seam, fading out toward its top and bottom. `flat`
 * squashes the blobs into streaks, for cloud.
 */
function fogTexture(width: number, height: number, flat: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const context = canvas.getContext('2d');
  if (!context) return null;
  const blobs = Math.round((width * height) / 1800);
  for (let index = 0; index < blobs; index += 1) {
    const x = rand(0, width);
    const y = rand(height * 0.25, height * 0.75);
    const radius = rand(height * 0.18, height * 0.5);
    const alpha = rand(0.05, 0.16);
    for (const shift of [-width, 0, width]) {
      context.save();
      context.translate(x + shift, y);
      context.scale(1, flat);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgb(218 234 244 / ${alpha})`);
      gradient.addColorStop(0.5, `rgb(200 222 236 / ${alpha * 0.5})`);
      gradient.addColorStop(1, 'rgb(200 222 236 / 0)');
      context.fillStyle = gradient;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
  }
  // Fade the band out at its top and bottom so it has no edge.
  context.globalCompositeOperation = 'destination-in';
  const fade = context.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, 'rgb(0 0 0 / 0)');
  fade.addColorStop(0.35, 'rgb(0 0 0 / 1)');
  fade.addColorStop(0.65, 'rgb(0 0 0 / 1)');
  fade.addColorStop(1, 'rgb(0 0 0 / 0)');
  context.fillStyle = fade;
  context.fillRect(0, 0, width, height);
  return canvas;
}

const bank = (y: number, height: number, tile: number, speed: number, alpha: number, flat = 1): FogBank => ({
  texture: fogTexture(tile, height, flat),
  y,
  height,
  tile,
  speed,
  alpha,
  phase: rand(0, Math.PI * 2),
});

export interface Scene {
  resize(width: number, height: number, position: { x: number; y: number }): void;
  draw(context: CanvasRenderingContext2D, now: number, dt: number): void;
}

export function campScene(backdropUrl: string | null): Scene {
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  let stars: Star[] = [];
  let skyPoints: Point[] = [];
  const embers: Particle[] = [];
  const smoke: Particle[] = [];
  const motes: Particle[] = [];
  const wisps: Particle[] = [];
  const leaves: Particle[] = [];
  const oakLeaves: Particle[] = [];
  const burst: Particle[] = [];
  const fireflies: (Point & { vx: number; vy: number; phase: number; period: number })[] = [];
  const flocks: Flock[] = [];
  let flockAt = performance.now() + rand(1_500, 4_000);
  const meteors: Meteor[] = [];
  let meteorAt = performance.now() + rand(2_000, 5_000);
  let castAt = performance.now() + rand(6_000, 14_000);
  let castRing = -1;
  let leafAt = performance.now() + rand(2_000, 6_000);
  let oakLeafAt = performance.now() + rand(3_000, 8_000);

  // Built once. Speeds are the painting's pixels a second: on a wide screen
  // the valley mist crosses in about a minute and a half, slow enough to be
  // weather and quick enough to see moving.
  const cloud = bank(150, 80, 1100, 7, 0.55, 0.35);
  const valleyFar = bank(365, 150, 1400, 12, 0.85);
  const valleyNear = bank(440, 130, 1200, -19, 0.7);
  const clearing = bank(560, 150, 1300, 24, 0.3);
  const grass = bank(705, 120, 1000, -15, 0.7);

  // Find the sky: read the painting once, small, and keep the pixels that
  // are bright blue and high up. Stars go only there, never on a tree.
  if (backdropUrl) {
    const image = new Image();
    image.onload = () => {
      const w = 344;
      const h = 192;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, w, h);
      const data = context.getImageData(0, 0, w, Math.round(h * 0.38)).data;
      const points: Point[] = [];
      for (let y = 0; y < Math.round(h * 0.38); y += 1) {
        for (let x = 0; x < w; x += 1) {
          const at = (y * w + x) * 4;
          const r = data[at]!;
          const g = data[at + 1]!;
          const b = data[at + 2]!;
          const ix = (x / w) * IW;
          const iy = (y / h) * IH;
          if (Math.hypot(ix - MOON.x, iy - MOON.y) < MOON.r * 1.5) continue;
          if (b > 110 && b > r + 30 && g > 80 && r + g + b > 250) points.push({ x: ix, y: iy });
        }
      }
      skyPoints = points;
      stars = Array.from({ length: Math.min(160, points.length) }, () => {
        const point = points[Math.floor(Math.random() * points.length)]!;
        return {
          x: point.x + rand(-2, 2),
          y: point.y + rand(-2, 2),
          size: rand(0.5, 1.4),
          phase: rand(0, Math.PI * 2),
          rate: rand(0.3, 1.1),
        };
      });
    };
    image.src = backdropUrl;
  }

  const X = (x: number) => offsetX + x * scale;
  const Y = (y: number) => offsetY + y * scale;
  /** A size in the painting's pixels, never under a screen pixel. */
  const S = (size: number) => Math.max(0.8, size * scale);

  for (let index = 0; index < 46; index += 1) {
    fireflies.push({
      x: rand(0, IW),
      y: rand(520, 760),
      vx: rand(-4, 4),
      vy: rand(-3, 3),
      phase: rand(0, 10),
      period: rand(2.5, 6),
    });
  }

  const spawnEmber = (): Particle => ({
    x: FIRE.x + rand(-14, 14),
    y: FIRE.y + rand(-34, -4),
    vx: rand(-6, 6),
    vy: -rand(26, 70),
    life: 0,
    span: rand(1500, 4200),
    size: rand(0.8, 1.9),
    spin: rand(1, 3),
    angle: rand(0, Math.PI * 2),
  });

  const spawnSmoke = (): Particle => ({
    x: FIRE.x + rand(-8, 8),
    y: FIRE.y - 60,
    vx: rand(2, 6),
    vy: -rand(9, 16),
    life: 0,
    span: rand(6000, 9500),
    size: rand(10, 16),
    spin: 0,
    angle: rand(0, Math.PI * 2),
  });

  const spawnMote = (): Particle => ({
    x: WIZARD.x,
    y: WIZARD.y,
    vx: 0,
    vy: -rand(7, 13),
    life: 0,
    span: rand(1800, 3200),
    size: rand(0.7, 1.5),
    spin: rand(2, 4) * (Math.random() < 0.5 ? -1 : 1),
    angle: rand(0, Math.PI * 2),
  });

  const spawnWisp = (): Particle => ({
    x: HORNS.x + rand(-9, 9),
    y: HORNS.y + rand(-3, 3),
    vx: rand(-2, 2),
    vy: -rand(8, 16),
    life: 0,
    span: rand(900, 1700),
    size: rand(0.9, 1.9),
    spin: rand(3, 6),
    angle: rand(0, Math.PI * 2),
  });

  const spawnLeaf = (): Particle => ({
    x: DRUID.x + rand(-4, 4),
    y: DRUID.y + rand(-3, 3),
    vx: rand(-3, 3),
    vy: rand(5, 9),
    life: 0,
    span: rand(4000, 6000),
    size: rand(1.8, 2.6),
    spin: rand(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1),
    angle: rand(0, Math.PI * 2),
  });

  const spawnOakLeaf = (): Particle => ({
    x: rand(CANOPY.left, CANOPY.right),
    y: rand(CANOPY.top, CANOPY.bottom),
    vx: rand(-10, 4),
    vy: rand(9, 15),
    life: 0,
    span: rand(12_000, 18_000),
    size: rand(3, 4.5),
    spin: rand(0.8, 1.8) * (Math.random() < 0.5 ? -1 : 1),
    angle: rand(0, Math.PI * 2),
  });

  const spawnFlock = (): Flock => {
    const far = Math.random() < 0.4;
    const lane = far ? FAR : SKY;
    const leftward = Math.random() < 0.5;
    const roll = Math.random();
    const count = roll < 0.25 ? 1 : roll < 0.45 ? 2 : 3 + Math.floor(Math.random() * 5);
    const startX = leftward ? lane.right + 40 : lane.left - 60;
    const startY = rand(lane.top + (far ? 4 : 20), lane.bottom - (far ? 4 : 0));
    const size = far ? rand(2.6, 3.8) : rand(5, 8);
    const spacing = far ? 0.5 : 1;
    return {
      lane,
      vx: (far ? rand(26, 42) : rand(50, 80)) * (leftward ? -1 : 1),
      vy: far ? rand(-2, 2) : rand(-6, 4),
      birds: Array.from({ length: count }, (_, index) => ({
        // A loose V: each bird a little behind and to the side of the one before.
        x: startX - (leftward ? -1 : 1) * index * rand(14, 22) * spacing,
        y: startY + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * rand(6, 11) * spacing,
        size: size * rand(0.85, 1.15),
        flap: rand(0, Math.PI * 2),
        rate: rand(7, 10),
      })),
    };
  };

  const spawnMeteor = (): Meteor => {
    const leftward = Math.random() < 0.6;
    const angle = rand(18, 40) * (Math.PI / 180);
    const speed = rand(420, 600);
    const long = Math.random() < 0.2;
    return {
      x: leftward ? rand(400, 680) : rand(140, 400),
      y: rand(10, 70),
      vx: Math.cos(angle) * speed * (leftward ? -1 : 1),
      vy: Math.sin(angle) * speed,
      life: 0,
      span: long ? rand(1000, 1300) : rand(600, 900),
      tail: long ? 150 : 90,
    };
  };

  /** Move a list of particles; drop the dead; returns how many died. */
  const age = (list: Particle[], dt: number) => {
    const seconds = dt / 1000;
    let dead = 0;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const particle = list[index]!;
      particle.life += dt;
      if (particle.life > particle.span) {
        list.splice(index, 1);
        dead += 1;
        continue;
      }
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.angle += particle.spin * seconds;
    }
    return dead;
  };

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

  /** A fog bank: its tile laid end to end across the painting, slid by the clock, breathing a little. */
  const drawBank = (context: CanvasRenderingContext2D, fog: FogBank, now: number) => {
    if (!fog.texture) return;
    const seconds = now / 1000;
    const shift = (((seconds * fog.speed) % fog.tile) + fog.tile) % fog.tile;
    context.globalAlpha = fog.alpha * (0.8 + 0.2 * Math.sin(fog.phase + now / 8000));
    const top = Y(fog.y - fog.height / 2);
    const height = fog.height * scale;
    // One screen pixel of overlap between tiles, so no seam shows.
    const width = fog.tile * scale + 1;
    for (let x = shift - fog.tile; x < IW; x += fog.tile) {
      context.drawImage(fog.texture, X(x), top, width, height);
    }
    context.globalAlpha = 1;
  };

  const drawLeaf = (context: CanvasRenderingContext2D, leaf: Particle, sway: number, rgb: string, alpha: number) => {
    context.save();
    context.translate(X(leaf.x + sway), Y(leaf.y));
    context.rotate(leaf.angle);
    context.fillStyle = `rgb(${rgb} / ${alpha})`;
    context.beginPath();
    context.ellipse(0, 0, S(leaf.size), S(leaf.size * 0.45), 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  return {
    resize(width, height, position) {
      scale = Math.max(width / IW, height / IH);
      offsetX = (width - IW * scale) * position.x;
      offsetY = (height - IH * scale) * position.y;
    },

    draw(context, now, dt) {
      const seconds = dt / 1000;

      // Stars, only on sky.
      for (const star of stars) {
        const breath = 0.5 + 0.5 * Math.sin(star.phase + (now / 1000) * star.rate);
        dot(context, star.x, star.y, star.size, `rgb(236 246 255 / ${0.15 + breath * breath * 0.75})`);
      }

      // The moon breathes.
      context.globalCompositeOperation = 'screen';
      glow(context, MOON.x, MOON.y, MOON.r * 2.2, '200 230 255', 0.1 + 0.05 * Math.sin(now / 4000));
      context.globalCompositeOperation = 'source-over';

      // Shooting stars: every few seconds, and now and then a second on the first one's heels.
      if (now >= meteorAt && skyPoints.length) {
        meteors.push(spawnMeteor());
        meteorAt = Math.random() < 0.2 ? now + rand(300, 900) : now + rand(3_000, 8_000);
      }
      for (let index = meteors.length - 1; index >= 0; index -= 1) {
        const meteor = meteors[index]!;
        meteor.life += dt;
        meteor.x += meteor.vx * seconds;
        meteor.y += meteor.vy * seconds;
        if (meteor.life > meteor.span) {
          meteors.splice(index, 1);
          continue;
        }
        const t = meteor.life / meteor.span;
        const bright = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        const norm = Math.hypot(meteor.vx, meteor.vy);
        const tail = meteor.tail * bright + 20;
        const gradient = context.createLinearGradient(
          X(meteor.x),
          Y(meteor.y),
          X(meteor.x - (meteor.vx / norm) * tail),
          Y(meteor.y - (meteor.vy / norm) * tail),
        );
        gradient.addColorStop(0, `rgb(240 248 255 / ${0.95 * bright})`);
        gradient.addColorStop(1, 'rgb(240 248 255 / 0)');
        context.strokeStyle = gradient;
        context.lineWidth = S(1.3);
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(X(meteor.x), Y(meteor.y));
        context.lineTo(X(meteor.x - (meteor.vx / norm) * tail), Y(meteor.y - (meteor.vy / norm) * tail));
        context.stroke();
        dot(context, meteor.x, meteor.y, 1.4, `rgb(255 255 255 / ${bright})`);
      }

      // Cloud across the moon.
      drawBank(context, cloud, now);

      // Birds: a new flock every few seconds, two in the air at most.
      if (flocks.length < 2 && now >= flockAt) {
        flocks.push(spawnFlock());
        flockAt = now + rand(4_000, 11_000);
      }
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (let index = flocks.length - 1; index >= 0; index -= 1) {
        const flock = flocks[index]!;
        const far = flock.lane === FAR;
        context.strokeStyle = far ? 'rgb(20 32 42 / 0.7)' : 'rgb(8 14 20 / 0.85)';
        let gone = true;
        for (const bird of flock.birds) {
          bird.x += flock.vx * seconds;
          bird.y += flock.vy * seconds + Math.sin(now / 600 + bird.flap) * 0.08;
          bird.flap += bird.rate * seconds;
          if (bird.x > flock.lane.left - 120 && bird.x < flock.lane.right + 120) gone = false;
          const wing = Math.sin(bird.flap);
          const span = bird.size;
          context.lineWidth = S(far ? 0.9 : 1.2);
          context.beginPath();
          context.moveTo(X(bird.x - span), Y(bird.y - wing * span * 0.6));
          context.quadraticCurveTo(X(bird.x - span * 0.4), Y(bird.y - wing * span * 0.2 - 1), X(bird.x), Y(bird.y));
          context.quadraticCurveTo(X(bird.x + span * 0.4), Y(bird.y - wing * span * 0.2 - 1), X(bird.x + span), Y(bird.y - wing * span * 0.6));
          context.stroke();
        }
        if (gone) flocks.splice(index, 1);
      }

      // Mist rolling through the valley, both ways.
      drawBank(context, valleyFar, now);
      drawBank(context, valleyNear, now);

      // Smoke off the fire.
      if (smoke.length < 9 && Math.random() < dt / 700) smoke.push(spawnSmoke());
      age(smoke, dt);
      for (const puff of smoke) {
        const t = puff.life / puff.span;
        puff.vx += 1.2 * seconds;
        const radius = puff.size * (1 + t * 3.2);
        const alpha = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.07;
        const gradient = context.createRadialGradient(X(puff.x), Y(puff.y), 0, X(puff.x), Y(puff.y), S(radius));
        gradient.addColorStop(0, `rgb(170 180 190 / ${alpha})`);
        gradient.addColorStop(1, 'rgb(170 180 190 / 0)');
        context.fillStyle = gradient;
        context.fillRect(X(puff.x) - S(radius), Y(puff.y) - S(radius), S(radius) * 2, S(radius) * 2);
      }

      // The fire's light, flickering: three sines at odd rates and a little noise.
      const flicker =
        0.62 +
        0.14 * Math.sin(now / 90) +
        0.1 * Math.sin(now / 37 + 1.3) +
        0.08 * Math.sin(now / 211 + 0.4) +
        rand(-0.05, 0.05);
      context.globalCompositeOperation = 'screen';
      glow(context, FIRE.x, FIRE.y, 260, '255 140 50', 0.2 * flicker);
      glow(context, FIRE.x, FIRE.y - 16, 55, '255 200 110', 0.45 * flicker);
      context.globalCompositeOperation = 'source-over';

      // Mist drifting across the clearing, and low over the grass.
      drawBank(context, clearing, now);
      drawBank(context, grass, now);

      // Sparks.
      while (embers.length < 80) embers.push(spawnEmber());
      age(embers, dt);
      context.globalCompositeOperation = 'lighter';
      for (const ember of embers) {
        const t = ember.life / ember.span;
        ember.vx += Math.sin(ember.angle) * 10 * seconds;
        const alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
        // Yellow when fresh, orange, then red as it cools.
        const g = Math.round(210 - t * 150);
        const b = Math.round(90 - t * 70);
        dot(context, ember.x, ember.y, ember.size * (1 - t * 0.5), `rgb(255 ${g} ${b} / ${alpha * 0.95})`);
      }

      // The wizard's staff: a pulse, motes spiralling up, and now and then a cast.
      const pulse = 0.75 + 0.25 * Math.sin(now / 600);
      glow(context, WIZARD.x, WIZARD.y, 36, '110 170 255', 0.55 * pulse);
      glow(context, WIZARD.x, WIZARD.y, 10, '220 240 255', 0.95 * pulse);
      if (motes.length < 28 && Math.random() < dt / 100) motes.push(spawnMote());
      age(motes, dt);
      for (const mote of motes) {
        const t = mote.life / mote.span;
        const radius = 3 + t * 11;
        const x = mote.x + Math.cos(mote.angle) * radius;
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        glow(context, x, mote.y, mote.size * 4, '140 200 255', alpha * 0.5);
        dot(context, x, mote.y, mote.size, `rgb(200 230 255 / ${alpha})`);
      }
      if (now >= castAt) {
        castRing = 0;
        castAt = now + rand(10_000, 20_000);
        for (let index = 0; index < 22; index += 1) {
          const angle = (index / 22) * Math.PI * 2 + rand(-0.1, 0.1);
          const speed = rand(22, 50);
          burst.push({
            x: WIZARD.x,
            y: WIZARD.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            span: rand(900, 1600),
            size: rand(0.8, 1.5),
            spin: 0,
            angle: 0,
          });
        }
      }
      if (castRing >= 0) {
        castRing += dt;
        const t = castRing / 1200;
        if (t >= 1) castRing = -1;
        else {
          glow(context, WIZARD.x, WIZARD.y, 36 + t * 40, '140 200 255', 0.5 * (1 - t));
          context.strokeStyle = `rgb(190 225 255 / ${0.8 * (1 - t)})`;
          context.lineWidth = S(1.2);
          context.beginPath();
          context.arc(X(WIZARD.x), Y(WIZARD.y), S(6 + t * 46), 0, Math.PI * 2);
          context.stroke();
        }
      }
      age(burst, dt);
      for (const spark of burst) {
        const t = spark.life / spark.span;
        spark.vx *= 0.97;
        spark.vy = spark.vy * 0.97 - 6 * seconds;
        dot(context, spark.x, spark.y, spark.size, `rgb(200 230 255 / ${1 - t})`);
      }

      // The tiefling's horns smoulder violet.
      glow(context, HORNS.x, HORNS.y, 20, '170 90 255', 0.45 * (0.7 + 0.3 * Math.sin(now / 430 + 2)));
      if (wisps.length < 20 && Math.random() < dt / 80) wisps.push(spawnWisp());
      age(wisps, dt);
      for (const wisp of wisps) {
        const t = wisp.life / wisp.span;
        const x = wisp.x + Math.sin(wisp.angle) * 2.5;
        dot(context, x, wisp.y, wisp.size * (1 - t * 0.7), `rgb(190 120 255 / ${(1 - t) * 0.75})`);
      }

      // The druid's staff glows green.
      glow(context, DRUID.x, DRUID.y, 30, '120 230 120', 0.45 * (0.7 + 0.3 * Math.sin(now / 900 + 4)));
      context.globalCompositeOperation = 'source-over';
      if (now >= leafAt) {
        leaves.push(spawnLeaf());
        leafAt = now + rand(1_200, 3_500);
      }
      age(leaves, dt);
      for (const leaf of leaves) {
        const t = leaf.life / leaf.span;
        const alpha = t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.6) / 0.4);
        drawLeaf(context, leaf, Math.sin(leaf.life / 500 + leaf.angle) * 7, '150 220 110', alpha * 0.9);
      }

      // Now and then the oak lets a leaf go, and it drifts down, rocking.
      if (now >= oakLeafAt) {
        oakLeaves.push(spawnOakLeaf());
        oakLeafAt = now + rand(2_500, 7_000);
      }
      age(oakLeaves, dt);
      for (const leaf of oakLeaves) {
        const t = leaf.life / leaf.span;
        const alpha = t < 0.08 ? t / 0.08 : 1 - Math.max(0, (t - 0.7) / 0.3);
        drawLeaf(context, leaf, Math.sin(leaf.life / 900 + leaf.angle) * 18, '196 150 80', alpha * 0.85);
      }

      // Fireflies in the undergrowth.
      context.globalCompositeOperation = 'lighter';
      for (const fly of fireflies) {
        fly.vx += rand(-6, 6) * seconds;
        fly.vy += rand(-5, 5) * seconds;
        fly.vx *= 0.99;
        fly.vy *= 0.99;
        fly.x += fly.vx * seconds;
        fly.y += fly.vy * seconds;
        if (fly.x < -10) fly.x = IW + 10;
        if (fly.x > IW + 10) fly.x = -10;
        if (fly.y < 510) fly.vy += 8 * seconds;
        if (fly.y > IH) fly.vy -= 8 * seconds;
        const t = ((now / 1000 + fly.phase) % fly.period) / fly.period;
        const on = t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : 0;
        if (on < 0.02) continue;
        glow(context, fly.x, fly.y, 7, '210 240 110', 0.35 * on);
        dot(context, fly.x, fly.y, 1.1, `rgb(235 255 160 / ${on})`);
      }
      context.globalCompositeOperation = 'source-over';
    },
  };
}

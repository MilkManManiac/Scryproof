/*
 * The camp: everything that moves in Loaf v2's painting, pinned to the
 * painting itself.
 *
 * The other words in Ambient.tsx place their motion by fractions of the
 * window. This one cannot: the fire, the moon and three staff tips are
 * points in the picture, and the picture is laid out by `background-size:
 * cover`, so where a point lands depends on the window's shape. Every point
 * here is in the painting's own pixels (1376 x 768, `assets/gen/sil-lace.jpg`)
 * and goes through the same arithmetic the browser uses for cover before it
 * is drawn. Sizes scale with the painting too, so a spark is the same size
 * against the fire on a laptop and on a big monitor.
 *
 * What moves, back to front:
 *   stars     twinkle only where the painting has sky: the picture is read
 *             once, and only bright blue pixels in the top third take a star
 *   moon      a slow halo, breathing
 *   shooting  now and then, across the open sky left of the oak
 *   birds     a small flock crossing the sky every half minute or so
 *   fog       two bands of mist drifting through the valley, opposite ways,
 *             and a thin low mist over the clearing
 *   smoke     from the fire, rising, spreading, leaning with the air
 *   fire      the light on the clearing flickers; sparks rise off the flames
 *   staffs    the wizard's crystal pulses blue and throws motes, and every
 *             so often casts: a ring and a burst; the warlock's burns with
 *             violet wisps; the druid's glows green and lets fall a leaf
 *   wolf      its eye catches the firelight, and blinks
 *   fireflies wandering the undergrowth, yellow-green
 *
 * The same rules as the rest of Ambient: thirty frames a second, stopped
 * when the tab is hidden, never started under reduce motion.
 */

/** The painting's size, in its own pixels. */
const IW = 1376;
const IH = 768;

const FIRE = { x: 590, y: 622 };
const MOON = { x: 508, y: 170, r: 95 };
const WIZARD = { x: 1210, y: 438 };
const WARLOCK = { x: 523, y: 410 };
const DRUID = { x: 897, y: 392 };
const WOLF_EYE = { x: 1022.5, y: 485 };

/** Where the open sky is, for things that fly: left of the oak's canopy. */
const SKY = { left: 120, right: 690, top: 15, bottom: 150 };

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

interface Puff extends Point {
  rx: number;
  ry: number;
  vx: number;
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
}

interface Meteor extends Point {
  vx: number;
  vy: number;
  life: number;
  span: number;
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);

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
  const burst: Particle[] = [];
  const fireflies: (Point & { vx: number; vy: number; phase: number; period: number })[] = [];
  let valley: Puff[] = [];
  let ground: Puff[] = [];
  let flock: Flock | null = null;
  let flockAt = performance.now() + rand(4_000, 12_000);
  let meteor: Meteor | null = null;
  let meteorAt = performance.now() + rand(8_000, 20_000);
  let castAt = performance.now() + rand(6_000, 14_000);
  let castRing = -1;
  let leafAt = performance.now() + rand(2_000, 6_000);
  let blinkAt = performance.now() + rand(3_000, 8_000);

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
      stars = Array.from({ length: Math.min(140, points.length) }, () => {
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

  const seedPuff = (band: 'valley' | 'ground', index: number, anywhere: boolean): Puff => {
    const low = band === 'ground';
    return {
      x: anywhere ? rand(-200, IW + 200) : index % 2 ? IW + 250 : -250,
      y: low ? rand(640, 740) : rand(300, 440),
      rx: low ? rand(160, 300) : rand(140, 280),
      ry: low ? rand(18, 34) : rand(22, 48),
      // Upper band drifts right, lower band left; a little variety in each.
      vx: (low ? rand(3, 7) : rand(5, 11)) * (low ? -1 : 1) * (index % 3 === 0 ? 0.6 : 1),
      alpha: low ? rand(0.07, 0.14) : rand(0.12, 0.26),
      phase: rand(0, Math.PI * 2),
    };
  };

  valley = Array.from({ length: 20 }, (_, index) => seedPuff('valley', index, true));
  ground = Array.from({ length: 7 }, (_, index) => seedPuff('ground', index, true));
  for (let index = 0; index < 46; index += 1) {
    fireflies.push({
      x: rand(0, IW),
      y: rand(470, 760),
      vx: rand(-4, 4),
      vy: rand(-3, 3),
      phase: rand(0, 10),
      period: rand(2.5, 6),
    });
  }

  const spawnEmber = (): Particle => ({
    x: FIRE.x + rand(-22, 22),
    y: FIRE.y + rand(-30, 10),
    vx: rand(-8, 8),
    vy: -rand(30, 85),
    life: 0,
    span: rand(1600, 4600),
    size: rand(0.9, 2.3),
    spin: rand(1, 3),
    angle: rand(0, Math.PI * 2),
  });

  const spawnSmoke = (): Particle => ({
    x: FIRE.x + rand(-10, 10),
    y: FIRE.y - 50,
    vx: rand(2, 7),
    vy: -rand(10, 18),
    life: 0,
    span: rand(6000, 9500),
    size: rand(14, 22),
    spin: 0,
    angle: rand(0, Math.PI * 2),
  });

  const spawnMote = (): Particle => ({
    x: WIZARD.x,
    y: WIZARD.y,
    vx: 0,
    vy: -rand(8, 16),
    life: 0,
    span: rand(1800, 3200),
    size: rand(0.8, 1.8),
    spin: rand(2, 4) * (Math.random() < 0.5 ? -1 : 1),
    angle: rand(0, Math.PI * 2),
  });

  const spawnWisp = (): Particle => ({
    x: WARLOCK.x + rand(-3, 3),
    y: WARLOCK.y + rand(-4, 4),
    vx: rand(-3, 3),
    vy: -rand(12, 24),
    life: 0,
    span: rand(900, 1800),
    size: rand(1.5, 3.2),
    spin: rand(3, 6),
    angle: rand(0, Math.PI * 2),
  });

  const spawnLeaf = (): Particle => ({
    x: DRUID.x + rand(-6, 6),
    y: DRUID.y + rand(-4, 4),
    vx: rand(-4, 4),
    vy: rand(6, 11),
    life: 0,
    span: rand(5000, 7500),
    size: rand(2.5, 3.8),
    spin: rand(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1),
    angle: rand(0, Math.PI * 2),
  });

  const spawnFlock = (): Flock => {
    const leftward = Math.random() < 0.5;
    const count = 3 + Math.floor(Math.random() * 4);
    const startX = leftward ? SKY.right + 40 : SKY.left - 60;
    const startY = rand(SKY.top + 20, SKY.bottom);
    return {
      vx: rand(50, 80) * (leftward ? -1 : 1),
      vy: rand(-6, 4),
      birds: Array.from({ length: count }, (_, index) => ({
        // A loose V: each bird a little behind and to the side of the one before.
        x: startX - (leftward ? -1 : 1) * index * rand(14, 22),
        y: startY + (index % 2 ? 1 : -1) * Math.ceil(index / 2) * rand(6, 11),
        size: rand(5, 8),
        flap: rand(0, Math.PI * 2),
        rate: rand(7, 10),
      })),
    };
  };

  const spawnMeteor = (): Meteor => {
    const leftward = Math.random() < 0.6;
    const angle = rand(20, 38) * (Math.PI / 180);
    const speed = rand(420, 560);
    return {
      x: leftward ? rand(420, 680) : rand(140, 380),
      y: rand(10, 60),
      vx: Math.cos(angle) * speed * (leftward ? -1 : 1),
      vy: Math.sin(angle) * speed,
      life: 0,
      span: rand(650, 900),
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

  const drawPuffs = (context: CanvasRenderingContext2D, puffs: Puff[], band: 'valley' | 'ground', now: number, dt: number) => {
    const seconds = dt / 1000;
    for (let index = 0; index < puffs.length; index += 1) {
      const puff = puffs[index]!;
      puff.x += puff.vx * seconds;
      if (puff.x > IW + puff.rx + 50 || puff.x < -puff.rx - 50) {
        puffs[index] = seedPuff(band, puff.vx > 0 ? 1 : 0, false);
        puffs[index]!.x = puff.vx > 0 ? -puff.rx - 40 : IW + puff.rx + 40;
        continue;
      }
      const breath = 0.7 + 0.3 * Math.sin(puff.phase + now / 7000);
      context.save();
      context.translate(X(puff.x), Y(puff.y));
      context.scale(1, puff.ry / puff.rx);
      const radius = S(puff.rx);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgb(206 228 240 / ${puff.alpha * breath})`);
      gradient.addColorStop(0.55, `rgb(190 216 232 / ${puff.alpha * breath * 0.45})`);
      gradient.addColorStop(1, 'rgb(190 216 232 / 0)');
      context.fillStyle = gradient;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
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

      // A shooting star.
      if (!meteor && now >= meteorAt && skyPoints.length) meteor = spawnMeteor();
      if (meteor) {
        meteor.life += dt;
        meteor.x += meteor.vx * seconds;
        meteor.y += meteor.vy * seconds;
        if (meteor.life > meteor.span) {
          meteor = null;
          meteorAt = now + rand(9_000, 24_000);
        } else {
          const t = meteor.life / meteor.span;
          const bright = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
          const norm = Math.hypot(meteor.vx, meteor.vy);
          const tail = 90 * bright + 20;
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
      }

      // Birds.
      if (!flock && now >= flockAt) flock = spawnFlock();
      if (flock) {
        let gone = true;
        context.strokeStyle = 'rgb(8 14 20 / 0.85)';
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (const bird of flock.birds) {
          bird.x += flock.vx * seconds;
          bird.y += flock.vy * seconds + Math.sin(now / 600 + bird.flap) * 0.08;
          bird.flap += bird.rate * seconds;
          if (bird.x > SKY.left - 120 && bird.x < SKY.right + 120) gone = false;
          const wing = Math.sin(bird.flap);
          const span = bird.size;
          context.lineWidth = S(1.2);
          context.beginPath();
          context.moveTo(X(bird.x - span), Y(bird.y - wing * span * 0.6));
          context.quadraticCurveTo(X(bird.x - span * 0.4), Y(bird.y - wing * span * 0.2 - 1), X(bird.x), Y(bird.y));
          context.quadraticCurveTo(X(bird.x + span * 0.4), Y(bird.y - wing * span * 0.2 - 1), X(bird.x + span), Y(bird.y - wing * span * 0.6));
          context.stroke();
        }
        if (gone) {
          flock = null;
          flockAt = now + rand(15_000, 35_000);
        }
      }

      // Fog through the valley, and low over the clearing.
      drawPuffs(context, valley, 'valley', now, dt);

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
      glow(context, FIRE.x, FIRE.y - 10, 300, '255 140 50', 0.2 * flicker);
      glow(context, FIRE.x, FIRE.y - 20, 80, '255 200 110', 0.45 * flicker);
      context.globalCompositeOperation = 'source-over';
      drawPuffs(context, ground, 'ground', now, dt);

      // Sparks.
      while (embers.length < 90) embers.push(spawnEmber());
      age(embers, dt);
      context.globalCompositeOperation = 'lighter';
      for (const ember of embers) {
        const t = ember.life / ember.span;
        ember.vx += Math.sin(ember.angle) * 12 * seconds;
        const alpha = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
        // Yellow when fresh, orange, then red as it cools.
        const g = Math.round(210 - t * 150);
        const b = Math.round(90 - t * 70);
        dot(context, ember.x, ember.y, ember.size * (1 - t * 0.5), `rgb(255 ${g} ${b} / ${alpha * 0.95})`);
      }

      // The wizard's crystal: a pulse, motes spiralling up, and now and then a cast.
      const pulse = 0.75 + 0.25 * Math.sin(now / 600);
      glow(context, WIZARD.x, WIZARD.y, 60, '110 170 255', 0.55 * pulse);
      glow(context, WIZARD.x, WIZARD.y, 16, '220 240 255', 0.95 * pulse);
      if (motes.length < 32 && Math.random() < dt / 90) motes.push(spawnMote());
      age(motes, dt);
      for (const mote of motes) {
        const t = mote.life / mote.span;
        const radius = 4 + t * 16;
        const x = mote.x + Math.cos(mote.angle) * radius;
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        glow(context, x, mote.y, mote.size * 4, '140 200 255', alpha * 0.5);
        dot(context, x, mote.y, mote.size, `rgb(200 230 255 / ${alpha})`);
      }
      if (now >= castAt) {
        castRing = 0;
        castAt = now + rand(10_000, 20_000);
        for (let index = 0; index < 26; index += 1) {
          const angle = (index / 26) * Math.PI * 2 + rand(-0.1, 0.1);
          const speed = rand(30, 70);
          burst.push({
            x: WIZARD.x,
            y: WIZARD.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            span: rand(900, 1600),
            size: rand(0.9, 1.8),
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
          glow(context, WIZARD.x, WIZARD.y, 60 + t * 60, '140 200 255', 0.5 * (1 - t));
          context.strokeStyle = `rgb(190 225 255 / ${0.8 * (1 - t)})`;
          context.lineWidth = S(1.4);
          context.beginPath();
          context.arc(X(WIZARD.x), Y(WIZARD.y), S(8 + t * 70), 0, Math.PI * 2);
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

      // The warlock's staff burns violet.
      glow(context, WARLOCK.x, WARLOCK.y, 44, '170 90 255', 0.5 * (0.7 + 0.3 * Math.sin(now / 430 + 2)));
      if (wisps.length < 26 && Math.random() < dt / 60) wisps.push(spawnWisp());
      age(wisps, dt);
      for (const wisp of wisps) {
        const t = wisp.life / wisp.span;
        const x = wisp.x + Math.sin(wisp.angle) * 3;
        dot(context, x, wisp.y, wisp.size * (1 - t * 0.7), `rgb(190 120 255 / ${(1 - t) * 0.8})`);
      }

      // The druid's staff glows green.
      glow(context, DRUID.x, DRUID.y, 44, '120 230 120', 0.45 * (0.7 + 0.3 * Math.sin(now / 900 + 4)));
      context.globalCompositeOperation = 'source-over';
      if (now >= leafAt) {
        leaves.push(spawnLeaf());
        leafAt = now + rand(1_200, 3_500);
      }
      age(leaves, dt);
      for (const leaf of leaves) {
        const t = leaf.life / leaf.span;
        const sway = Math.sin(leaf.life / 500 + leaf.angle) * 10;
        const alpha = t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.6) / 0.4);
        context.save();
        context.translate(X(leaf.x + sway), Y(leaf.y));
        context.rotate(leaf.angle);
        context.fillStyle = `rgb(150 220 110 / ${alpha * 0.9})`;
        context.beginPath();
        context.ellipse(0, 0, S(leaf.size), S(leaf.size * 0.45), 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      // The wolf's eye catches the firelight, and blinks now and then.
      let open = 1;
      if (now >= blinkAt) {
        const since = now - blinkAt;
        if (since > 220) blinkAt = now + rand(3_000, 9_000);
        else open = Math.abs(since - 110) / 110;
      }
      context.globalCompositeOperation = 'lighter';
      glow(context, WOLF_EYE.x, WOLF_EYE.y, 6, '255 210 120', 0.55 * open * flicker);
      dot(context, WOLF_EYE.x, WOLF_EYE.y, 1.1 * open, `rgb(255 230 160 / ${0.9 * open})`);

      // Fireflies in the undergrowth.
      for (const fly of fireflies) {
        fly.vx += rand(-6, 6) * seconds;
        fly.vy += rand(-5, 5) * seconds;
        fly.vx *= 0.99;
        fly.vy *= 0.99;
        fly.x += fly.vx * seconds;
        fly.y += fly.vy * seconds;
        if (fly.x < -10) fly.x = IW + 10;
        if (fly.x > IW + 10) fly.x = -10;
        if (fly.y < 460) fly.vy += 8 * seconds;
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

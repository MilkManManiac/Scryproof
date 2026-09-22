/*
 * The room behind every screen, and what moves in it.
 *
 * The painting is CSS (`.ambient`). On top of it, a theme may ask for
 * motion through `--ambient-motion`: a list of words, drawn on one canvas.
 *
 *   embers    sparks rising from the theme's glow position, drifting, dying
 *   stars     a scatter of points in the top of the sky (`--star-depth` says
 *             how far down), each breathing on its own slow clock, and now
 *             and then one of them flares; coloured by `--star-color`
 *   shooting  a shooting star across the top of the sky every half minute
 *             or so, with a tail that fades behind it
 *   haze      a few wide, faint patches of the glow colour drifting sideways
 *             through the lower half, as if lit cloud were moving
 *   glimmer   glitter: small four-point sparkles that appear anywhere, swell
 *             for a second or two, and are gone, in the accent colour
 *
 * The rules that keep it from being a screensaver: everything is small and
 * dim, it runs at thirty frames a second and not sixty, it stops dead when
 * the tab is hidden, and under "reduce motion" it never starts. Anything
 * that could be watched instead of the conversation is too much. The dusk
 * theme asks for four of these at once, at Wes's word ("go nuts"), and is
 * still under those rules.
 */

import { useEffect, useRef } from 'react';

import { theme } from '../lib/theme';

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  span: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  rate: number;
  /** When this star next flares, in the page's clock. */
  flareAt: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  span: number;
}

interface Haze {
  x: number;
  y: number;
  radius: number;
  vx: number;
  alpha: number;
  phase: number;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  life: number;
  span: number;
  /** Which way the four points lean, so they are not all upright. */
  tilt: number;
}

const FRAME_MS = 1000 / 30;
const EMBERS = 60;
const STARS = 110;
const HAZES = 5;
const SPARKLES = 22;
/** A flare lasts this long and comes, per star, every minute or two. */
const FLARE_MS = 900;
const nextFlare = (now: number) => now + 40_000 + Math.random() * 80_000;
/** A shooting star every twenty to fifty seconds. */
const nextMeteor = (now: number) => now + 20_000 + Math.random() * 30_000;

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readMotion(): Set<string> {
  return new Set(readToken('--ambient-motion').split(/\s+/).filter((word) => word && word !== 'none'));
}

/** "38% 70%" to a fraction of the canvas. */
function readGlowPosition(): { x: number; y: number } {
  const [x = '50%', y = '50%'] = readToken('--glow-position').split(/\s+/);
  return { x: parseFloat(x) / 100, y: parseFloat(y) / 100 };
}

function readGlowColor(): string {
  return readToken('--glow-color') || 'rgb(238 138 58 / 0.2)';
}

/** "232 236 255", or the default, as the inside of an rgb(). */
function readStarColor(): string {
  const value = readToken('--star-color');
  return /^\d+\s+\d+\s+\d+$/.test(value) ? value : '232 236 255';
}

function readStarDepth(): number {
  const value = parseFloat(readToken('--star-depth'));
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.42;
}

function readAccent(): string {
  // The accent is a hex; the canvas wants a triplet. Fall back to the fire.
  const hex = readToken('--accent').match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return '238 138 58';
  return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(' ');
}

/** The glow colour with its own alpha replaced, for a spark at a given brightness. */
function tint(base: string, alpha: number): string {
  const match = base.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!match) return `rgb(238 138 58 / ${alpha})`;
  return `rgb(${match[1]} ${match[2]} ${match[3]} / ${alpha})`;
}

/** Up for the first part of a life, down for the rest; 0..1. */
function swellOf(t: number, peakAt: number): number {
  return t < peakAt ? t / peakAt : 1 - (t - peakAt) / (1 - peakAt);
}

export function Ambient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    let motion = readMotion();
    let glow = readGlowPosition();
    let colour = readGlowColor();
    let starColour = readStarColor();
    let starDepth = readStarDepth();
    let accent = readAccent();
    let embers: Ember[] = [];
    let stars: Star[] = [];
    let hazes: Haze[] = [];
    let sparkles: Sparkle[] = [];
    let meteor: Meteor | null = null;
    let meteorAt = 0;
    let frame = 0;
    let last = 0;
    let width = 0;
    let height = 0;

    const seedEmber = (ember: Ember, fresh: boolean): Ember => {
      ember.x = glow.x * width + (Math.random() - 0.5) * width * 0.12;
      ember.y = glow.y * height + (Math.random() - 0.3) * height * 0.08;
      ember.vx = (Math.random() - 0.5) * 0.25;
      ember.vy = -(0.25 + Math.random() * 0.55);
      ember.span = 5000 + Math.random() * 6000;
      ember.life = fresh ? Math.random() * ember.span : 0;
      ember.size = 1 + Math.random() * 1.6;
      return ember;
    };

    const seedSparkle = (sparkle: Sparkle, fresh: boolean): Sparkle => {
      sparkle.x = Math.random() * width;
      // Mostly where the clouds are, below the stars, but anywhere is allowed.
      sparkle.y = height * (0.25 + Math.random() * 0.75);
      sparkle.size = 2.5 + Math.random() * 4;
      sparkle.span = 1200 + Math.random() * 1800;
      // A fresh field starts spread out in time, and each one waits a while
      // in the dark before it shows, so they never all blink at once.
      sparkle.life = fresh ? Math.random() * sparkle.span * 4 : -Math.random() * 4000;
      sparkle.tilt = Math.random() * Math.PI;
      return sparkle;
    };

    const seedMeteor = (): Meteor => {
      // In from the top, heading down and across, either way. Fast enough to
      // be a streak, slow enough to be seen: about a second and a half.
      const leftward = Math.random() < 0.5;
      const speed = 9 + Math.random() * 4;
      const angle = (18 + Math.random() * 20) * (Math.PI / 180);
      return {
        x: leftward ? width * (0.5 + Math.random() * 0.5) : width * Math.random() * 0.5,
        y: height * Math.random() * 0.15,
        vx: Math.cos(angle) * speed * (leftward ? -1 : 1),
        vy: Math.sin(angle) * speed,
        life: 0,
        span: 1400 + Math.random() * 500,
      };
    };

    const seed = () => {
      const now = performance.now();
      embers = motion.has('embers')
        ? Array.from({ length: EMBERS }, () => seedEmber({ x: 0, y: 0, vx: 0, vy: 0, life: 0, span: 1, size: 1 }, true))
        : [];
      stars = motion.has('stars')
        ? Array.from({ length: STARS }, () => ({
            x: Math.random() * width,
            y: Math.random() * height * starDepth,
            size: 0.6 + Math.random() * 1.2,
            phase: Math.random() * Math.PI * 2,
            rate: 0.15 + Math.random() * 0.35,
            flareAt: now + Math.random() * 60_000,
          }))
        : [];
      hazes = motion.has('haze')
        ? Array.from({ length: HAZES }, (_, index) => ({
            x: Math.random() * width,
            y: height * (0.35 + Math.random() * 0.5),
            radius: Math.min(width, height) * (0.22 + Math.random() * 0.2),
            // Alternate directions, so the drift reads as weather and not a scroll.
            vx: (0.04 + Math.random() * 0.05) * (index % 2 ? -1 : 1),
            alpha: 0.05 + Math.random() * 0.05,
            phase: Math.random() * Math.PI * 2,
          }))
        : [];
      sparkles = motion.has('glimmer')
        ? Array.from({ length: SPARKLES }, () => seedSparkle({ x: 0, y: 0, size: 1, life: 0, span: 1, tilt: 0 }, true))
        : [];
      meteor = null;
      meteorAt = motion.has('shooting') ? now + 6_000 + Math.random() * 20_000 : Infinity;
    };

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      seed();
    };

    const drawHaze = (now: number, dt: number) => {
      // Screen, so the patches light the painting under them instead of
      // fogging it; a faint patch over a lit cloud makes the cloud glow.
      context.globalCompositeOperation = 'screen';
      for (const haze of hazes) {
        haze.x += haze.vx * (dt / 16);
        if (haze.x < -haze.radius) haze.x = width + haze.radius;
        if (haze.x > width + haze.radius) haze.x = -haze.radius;
        // Each patch also breathes, slowly, on its own clock.
        const breath = 0.75 + 0.25 * Math.sin(haze.phase + now / 9000);
        const gradient = context.createRadialGradient(haze.x, haze.y, 0, haze.x, haze.y, haze.radius);
        gradient.addColorStop(0, tint(colour, haze.alpha * breath));
        gradient.addColorStop(1, tint(colour, 0));
        context.fillStyle = gradient;
        context.fillRect(haze.x - haze.radius, haze.y - haze.radius, haze.radius * 2, haze.radius * 2);
      }
      context.globalCompositeOperation = 'source-over';
    };

    const drawStars = (now: number) => {
      for (const star of stars) {
        // Each star breathes on its own clock; most of the time it is faint.
        const breath = 0.5 + 0.5 * Math.sin(star.phase + (now / 1000) * star.rate);
        let alpha = 0.22 + breath * breath * 0.6;
        let size = star.size;
        // A flare: a short swell to full brightness and nearly twice the size,
        // with a soft halo, then back. Rare enough to be caught, not watched.
        const since = now - star.flareAt;
        if (since >= 0) {
          if (since > FLARE_MS) star.flareAt = nextFlare(now);
          else {
            const swell = Math.sin((since / FLARE_MS) * Math.PI);
            alpha = Math.min(1, alpha + swell * 0.8);
            size = star.size * (1 + swell * 0.9);
            context.fillStyle = `rgb(${starColour} / ${swell * 0.18})`;
            context.beginPath();
            context.arc(star.x, star.y, size * 3, 0, Math.PI * 2);
            context.fill();
          }
        }
        context.fillStyle = `rgb(${starColour} / ${alpha})`;
        context.beginPath();
        context.arc(star.x, star.y, size, 0, Math.PI * 2);
        context.fill();
      }
    };

    const drawMeteor = (now: number, dt: number) => {
      if (!meteor) {
        if (now >= meteorAt) meteor = seedMeteor();
        return;
      }
      meteor.life += dt;
      if (meteor.life > meteor.span) {
        meteor = null;
        meteorAt = nextMeteor(now);
        return;
      }
      const step = dt / 16;
      meteor.x += meteor.vx * step;
      meteor.y += meteor.vy * step;
      const t = meteor.life / meteor.span;
      // In quickly, out slowly: the head is brightest early and the tail
      // lingers a moment after.
      const bright = swellOf(t, 0.25);
      const tail = 70 + bright * 50;
      const norm = Math.hypot(meteor.vx, meteor.vy) || 1;
      const backX = meteor.x - (meteor.vx / norm) * tail;
      const backY = meteor.y - (meteor.vy / norm) * tail;
      const gradient = context.createLinearGradient(meteor.x, meteor.y, backX, backY);
      gradient.addColorStop(0, `rgb(${starColour} / ${0.9 * bright})`);
      gradient.addColorStop(0.35, `rgb(${starColour} / ${0.35 * bright})`);
      gradient.addColorStop(1, `rgb(${starColour} / 0)`);
      context.strokeStyle = gradient;
      context.lineWidth = 1.4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(meteor.x, meteor.y);
      context.lineTo(backX, backY);
      context.stroke();
      // The head: a dot with a small halo.
      context.fillStyle = `rgb(${starColour} / ${0.25 * bright})`;
      context.beginPath();
      context.arc(meteor.x, meteor.y, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgb(${starColour} / ${bright})`;
      context.beginPath();
      context.arc(meteor.x, meteor.y, 1.5, 0, Math.PI * 2);
      context.fill();
    };

    const drawSparkles = (dt: number) => {
      for (const sparkle of sparkles) {
        sparkle.life += dt;
        if (sparkle.life < 0) continue;
        if (sparkle.life > sparkle.span) {
          seedSparkle(sparkle, false);
          continue;
        }
        const t = sparkle.life / sparkle.span;
        const swell = Math.sin(t * Math.PI);
        const reach = sparkle.size * (0.6 + swell * 0.6);
        // Four thin points and a bright centre, turned a little. The points
        // are drawn as a stroke that thins toward the tips, which is what
        // glitter looks like when it catches light.
        context.save();
        context.translate(sparkle.x, sparkle.y);
        context.rotate(sparkle.tilt);
        context.strokeStyle = `rgb(${accent} / ${0.85 * swell})`;
        context.lineCap = 'round';
        for (const [dx, dy, long] of [
          [1, 0, true],
          [0, 1, false],
        ] as const) {
          const length = long ? reach : reach * 0.65;
          context.lineWidth = 0.9;
          context.beginPath();
          context.moveTo(-dx * length, -dy * length);
          context.lineTo(dx * length, dy * length);
          context.stroke();
        }
        context.fillStyle = `rgb(255 255 255 / ${0.9 * swell})`;
        context.beginPath();
        context.arc(0, 0, 0.9 + swell * 0.6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };

    const drawEmbers = (dt: number) => {
      for (const ember of embers) {
        ember.life += dt;
        if (ember.life > ember.span) seedEmber(ember, false);
        const t = ember.life / ember.span;
        // Brightest just after leaving the fire, then a long fade; a slow
        // wander sideways as it climbs, like heat.
        ember.vx += (Math.random() - 0.5) * 0.02;
        ember.x += ember.vx * (dt / 16);
        ember.y += ember.vy * (dt / 16);
        const alpha = t < 0.15 ? (t / 0.15) * 0.85 : 0.85 * (1 - (t - 0.15) / 0.85);
        context.fillStyle = tint(colour, alpha);
        context.beginPath();
        context.arc(ember.x, ember.y, ember.size * (1 - t * 0.4), 0, Math.PI * 2);
        context.fill();
      }
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(now - last, 100);
      last = now;
      context.clearRect(0, 0, width, height);
      if (hazes.length) drawHaze(now, dt);
      drawStars(now);
      if (meteorAt !== Infinity) drawMeteor(now, dt);
      drawSparkles(dt);
      drawEmbers(dt);
    };

    const start = () => {
      stop();
      const nothing = embers.length === 0 && stars.length === 0 && hazes.length === 0 && sparkles.length === 0 && meteorAt === Infinity;
      if (still.matches || document.hidden || nothing) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const rethink = () => {
      motion = readMotion();
      glow = readGlowPosition();
      colour = readGlowColor();
      starColour = readStarColor();
      starDepth = readStarDepth();
      accent = readAccent();
      seed();
      context.clearRect(0, 0, width, height);
      start();
    };

    resize();
    start();
    const unsubscribe = theme.subscribe(rethink);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', start);
    still.addEventListener('change', start);
    return () => {
      stop();
      unsubscribe();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      still.removeEventListener('change', start);
    };
  }, []);

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <canvas ref={canvasRef} className="ambient-motion" aria-hidden="true" />
    </>
  );
}

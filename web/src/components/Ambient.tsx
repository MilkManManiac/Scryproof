/*
 * The room behind every screen, and what moves in it.
 *
 * The painting is CSS (`.ambient`). On top of it, a theme may ask for
 * motion through `--ambient-motion`: a list of words, drawn on one canvas.
 *
 *   embers  sparks rising from the theme's glow position, drifting, dying
 *   stars   a scatter of points in the top of the sky, each breathing on
 *           its own slow clock, and now and then one of them flares
 *
 * The rules that keep it from being a screensaver: everything is small and
 * dim, it runs at thirty frames a second and not sixty, it stops dead when
 * the tab is hidden, and under "reduce motion" it never starts. Anything
 * that could be watched instead of the conversation is too much.
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

const FRAME_MS = 1000 / 30;
const EMBERS = 60;
const STARS = 110;
/** A flare lasts this long and comes, per star, every minute or two. */
const FLARE_MS = 900;
const nextFlare = (now: number) => now + 40_000 + Math.random() * 80_000;

function readMotion(): Set<string> {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--ambient-motion').trim();
  return new Set(value.split(/\s+/).filter((word) => word && word !== 'none'));
}

/** "38% 70%" to a fraction of the canvas. */
function readGlowPosition(): { x: number; y: number } {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--glow-position').trim();
  const [x = '50%', y = '50%'] = value.split(/\s+/);
  return { x: parseFloat(x) / 100, y: parseFloat(y) / 100 };
}

function readGlowColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--glow-color').trim() || 'rgb(238 138 58 / 0.2)';
}

/** The glow colour with its own alpha replaced, for a spark at a given brightness. */
function tint(base: string, alpha: number): string {
  const match = base.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!match) return `rgb(238 138 58 / ${alpha})`;
  return `rgb(${match[1]} ${match[2]} ${match[3]} / ${alpha})`;
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
    let embers: Ember[] = [];
    let stars: Star[] = [];
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

    const seed = () => {
      embers = motion.has('embers')
        ? Array.from({ length: EMBERS }, () => seedEmber({ x: 0, y: 0, vx: 0, vy: 0, life: 0, span: 1, size: 1 }, true))
        : [];
      stars = motion.has('stars')
        ? Array.from({ length: STARS }, () => ({
            x: Math.random() * width,
            y: Math.random() * height * 0.42,
            size: 0.6 + Math.random() * 1.2,
            phase: Math.random() * Math.PI * 2,
            rate: 0.15 + Math.random() * 0.35,
            flareAt: performance.now() + Math.random() * 60_000,
          }))
        : [];
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

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(now - last, 100);
      last = now;
      context.clearRect(0, 0, width, height);

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
            context.fillStyle = `rgb(232 236 255 / ${swell * 0.18})`;
            context.beginPath();
            context.arc(star.x, star.y, size * 3, 0, Math.PI * 2);
            context.fill();
          }
        }
        context.fillStyle = `rgb(232 236 255 / ${alpha})`;
        context.beginPath();
        context.arc(star.x, star.y, size, 0, Math.PI * 2);
        context.fill();
      }

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

    const start = () => {
      stop();
      if (still.matches || document.hidden || (embers.length === 0 && stars.length === 0)) return;
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

/**
 * Where Travhole puts a pin on a country: kept apart from the map component
 * so it can be tested against every outline.
 */

export type Outlines = Record<string, { d: string; box: [number, number, number, number] }>;

type Point = [number, number];

/** A path's pieces, each as its corners. */
function rings(d: string): Point[][] {
  return d
    .split('M')
    .slice(1)
    .map((ring) =>
      ring
        .replace('Z', '')
        .split('L')
        .map((pair): Point => {
          const [x = 0, y = 0] = pair.trim().split(' ').map(Number);
          return [x, y];
        }),
    );
}

/** A piece's [left, top, right, bottom], worked out from its corners (the stored box is rounded, and a speck rounds to nothing). */
function bounds(ring: Point[]): [number, number, number, number] {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The largest piece's bounds. */
function main(d: string): [number, number, number, number] {
  let best: [number, number, number, number] = [0, 0, 0, 0];
  let most = -1;
  for (const ring of rings(d)) {
    const box = bounds(ring);
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    if (area > most) [best, most] = [box, area];
  }
  return best;
}

const area = (box: [number, number, number, number]) => (box[2] - box[0]) * (box[3] - box[1]);

/** Where a line level with `y` is inside a shape, as [from, to] stretches. */
export function across(d: string, y: number): Point[] {
  const xs: number[] = [];
  for (const points of rings(d)) {
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]!;
      const [x2, y2] = points[(i + 1) % points.length]!;
      if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  const out: Point[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

/**
 * A spot surely inside a country's largest piece, for its pin: the middle of
 * the widest stretch across it, tried at a few heights near its middle. The
 * middle of its box can be the sea (a crescent) or a smaller country inside
 * it (Lesotho in South Africa), so what smaller countries cover is cut out.
 */
export function pinAt(code: string, outlines: Outlines): { x: number; y: number } {
  const shape = outlines[code];
  if (!shape) return { x: 0, y: 0 };
  const box = main(shape.d);
  const [left, top, right, bottom] = box;
  const smaller = Object.entries(outlines)
    .filter(([other, them]) => other !== code && area(main(them.d)) < area(box))
    .map(([, them]) => them.d);
  let best = { x: (left + right) / 2, y: (top + bottom) / 2, wide: 0 };
  for (const share of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const y = top + (bottom - top) * share;
    let pieces = across(shape.d, y)
      .map(([a, b]): Point => [Math.max(a, left), Math.min(b, right)])
      .filter(([a, b]) => b > a);
    for (const d of smaller) {
      for (const [a, b] of across(d, y)) {
        pieces = pieces.flatMap(([p, q]): Point[] =>
          b <= p || a >= q ? [[p, q]] : ([[p, a], [b, q]] as Point[]).filter(([s, t]) => t > s),
        );
      }
    }
    for (const [a, b] of pieces) if (b - a > best.wide) best = { x: (a + b) / 2, y, wide: b - a };
  }
  return { x: best.x, y: best.y };
}

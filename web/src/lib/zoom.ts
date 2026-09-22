/*
 * The arithmetic of looking closer at a picture.
 *
 * A view is a scale and an offset: the picture is drawn at `scale` times its
 * natural size, moved by `offset` pixels from centred. Zooming around a point
 * keeps whatever is under the pointer under the pointer, which is the one
 * thing that makes wheel-zoom feel like it is obeying you.
 */

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

/** The scale at which the whole picture fits inside the box, never enlarged. */
export function fitScale(picture: Size, box: Size): number {
  if (picture.width === 0 || picture.height === 0) return 1;
  return Math.min(1, box.width / picture.width, box.height / picture.height);
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Zoom `view` to `next`, keeping the picture point under `at` (pointer offset
 * from the box's centre) fixed on screen.
 */
export function zoomAround(view: View, next: number, at: { x: number; y: number }): View {
  const scale = clampScale(next);
  const ratio = scale / view.scale;
  return {
    scale,
    x: at.x - (at.x - view.x) * ratio,
    y: at.y - (at.y - view.y) * ratio,
  };
}

/** Wheel notches to a zoom factor: smooth on a trackpad, brisk on a wheel. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0022);
}

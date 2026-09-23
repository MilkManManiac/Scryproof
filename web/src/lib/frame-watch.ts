/**
 * Whether a picture we are watching is still moving, worked out from the
 * decoded-frame count WebRTC already reports. The call's stats poll feeds each
 * sample in; nothing here polls anything.
 *
 * A share that dies on the sender's side can leave the watcher's tile frozen
 * on its last frame with nothing to say so. Counting decoded frames tells the
 * difference: a live picture keeps adding to the count, a dead one stops.
 */

/** Silence this long before a picture counts as stopped. */
export const STALL_AFTER_MS = 3000;

export interface FrameWatch {
  frames: number;
  /** When the count last moved, or when we started watching. */
  changedAt: number;
}

/**
 * Fold one sample into what we knew. Any change counts as movement, a count
 * that went down included: that is a new track starting from nothing. The
 * first sample starts the clock, so a picture that never arrives at all is
 * reported too.
 */
export function noteFrames(previous: FrameWatch | undefined, frames: number, at: number): FrameWatch {
  if (!previous || frames !== previous.frames) return { frames, changedAt: at };
  return previous;
}

/** Whole seconds without a new frame, or null while the picture is moving (or has not been still for long). */
export function stalledSeconds(watch: FrameWatch, now: number, afterMs = STALL_AFTER_MS): number | null {
  const still = now - watch.changedAt;
  return still >= afterMs ? Math.floor(still / 1000) : null;
}

/** What the watcher's tile says. */
export const noPictureLabel = (name: string, seconds: number): string =>
  `No picture from ${name}'s screen for ${seconds} s`;

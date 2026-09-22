/*
 * Small drawn marks for a person's state in a call: camera on, screen
 * shared, in voice at all. Drawn here, one path each, so every list shows
 * the same mark at the same weight instead of whatever glyph the font has.
 * They take the text colour of their parent; the parent picks the tone.
 */

const shared = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** A camera: a body and a lens hood on the right. */
export function CameraGlyph() {
  return (
    <svg {...shared}>
      <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
      <path d="M10.5 7l4-2v6l-4-2z" />
    </svg>
  );
}

/** A screen on a stand. */
export function ScreenGlyph() {
  return (
    <svg {...shared}>
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5" />
      <path d="M5.5 14h5M8 11v3" />
    </svg>
  );
}

/** Sound leaving a speaker: the "in voice" mark. */
export function VoiceGlyph() {
  return (
    <svg {...shared}>
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" />
      <path d="M10.5 5.5a3.5 3.5 0 010 5M12.5 3.5a6 6 0 010 9" />
    </svg>
  );
}

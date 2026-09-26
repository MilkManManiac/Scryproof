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

/** Bigger, for the round buttons along the bottom of a call. */
const sized = (size?: number) => (size ? { ...shared, width: size, height: size } : shared);

/** A camera: a body and a lens hood on the right. */
export function CameraGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
      <path d="M10.5 7l4-2v6l-4-2z" />
    </svg>
  );
}

/** A screen on a stand. */
export function ScreenGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
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

/** A microphone; struck through when it is off. */
export function MicGlyph({ size, off }: { size?: number; off?: boolean } = {}) {
  return (
    <svg {...sized(size)}>
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0010 0M8 12.5v2" />
      {off ? <path d="M2 2l12 12" /> : null}
    </svg>
  );
}

/** Headphones; struck through when deafened. */
export function HeadphonesGlyph({ size, off }: { size?: number; off?: boolean } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M2.5 11V8a5.5 5.5 0 0111 0v3" />
      <rect x="1.5" y="9.5" width="3" height="4.5" rx="1" />
      <rect x="11.5" y="9.5" width="3" height="4.5" rx="1" />
      {off ? <path d="M2 2l12 12" /> : null}
    </svg>
  );
}

/** A handset lying down: hang up. */
export function HangUpGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M1.5 9.5c3.5-3.3 9.5-3.3 13 0l-1.6 2-2.6-1.2V8.4a8 8 0 00-4.6 0v1.9L3.1 11.5z" />
    </svg>
  );
}

/** A handset upright: a call coming in, or answer it. */
export function PhoneGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M4 1.5l2 3-1.3 1.6a8 8 0 005.2 5.2L11.5 10l3 2-1 2.5C7.5 14.5 1.5 8.5 1.5 2.5z" />
    </svg>
  );
}

/** Three sliders: the quality settings of a call. */
export function SlidersGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M2 4h12M2 8h12M2 12h12" />
      <circle cx="5" cy="4" r="1.5" fill="currentColor" />
      <circle cx="11" cy="8" r="1.5" fill="currentColor" />
      <circle cx="7" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** Four squares: everyone at once. */
export function GridGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

/** Corners pulled out: full screen. */
export function ExpandGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
    </svg>
  );
}

/** A cog: settings. */
export function GearGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M12.66 6.18L14.6 6.82V9.18L12.66 9.82L12.58 10L13.5 11.83L11.83 13.5L10 12.58L9.82 12.66L9.18 14.6H6.82L6.18 12.66L6 12.58L4.17 13.5L2.5 11.83L3.42 10L3.34 9.82L1.4 9.18V6.82L3.34 6.18L3.42 6L2.5 4.17L4.17 2.5L6 3.42L6.18 3.34L6.82 1.4H9.18L9.82 3.34L10 3.42L11.83 2.5L13.5 4.17L12.58 6Z" />
      <circle cx="8" cy="8" r="2.1" />
    </svg>
  );
}

/** A bell: notifications. */
export function BellGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M4 11.5V7a4 4 0 018 0v4.5l1.2 1.2H2.8z" />
      <path d="M6.5 14a1.6 1.6 0 003 0" />
    </svg>
  );
}

/** A speaker with a spark: the soundboard, sounds played into the call. */
export function SoundboardGlyph({ size }: { size?: number } = {}) {
  return (
    <svg {...sized(size)}>
      <path d="M1.5 6.5h2.2L7 4v8L3.7 9.5H1.5z" />
      <path d="M12 2.2v3.6M10.2 4h3.6" />
      <path d="M9.5 8.5a2 2 0 010 2.5M11.5 7a4.5 4.5 0 010 5.5" />
    </svg>
  );
}

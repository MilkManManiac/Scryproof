/**
 * Build a JPEG that genuinely carries GPS coordinates, so the scrubber can be
 * tested against a real file rather than against a mock.
 *
 * This is test scaffolding, not application code. Nothing imports it except
 * `exif-check.html`, and Vite builds only `index.html`, so it never ships.
 *
 * The EXIF block written here contains three things worth naming:
 *
 *   - GPS latitude and longitude, which is the thing being removed.
 *   - An ImageDescription holding a marker string, which is easy to search for
 *     in the output bytes.
 *   - Orientation = 6 (rotate 90 degrees clockwise). That one is the proof
 *     that the browser really parsed this block: if it did, the scrubbed image
 *     comes back with its width and height swapped. A test that only searched
 *     for absent bytes could pass against EXIF the browser silently ignored.
 *
 * Every offset inside EXIF is measured from the start of its TIFF header, so
 * the writer below is anchored there and the segment's own two-byte marker and
 * length are written separately.
 */

export const PROBE_MARKER = 'GoOffline-EXIF-Probe';

/** ASCII, SHORT, LONG, RATIONAL — the four EXIF types used here. */
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

/** Big-endian writer anchored at the TIFF header. */
class Tiff {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private readonly base: number;

  constructor(bytes: Uint8Array, base: number) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer);
    this.base = base;
  }

  u16(at: number, value: number): void {
    this.view.setUint16(this.base + at, value, false);
  }

  u32(at: number, value: number): void {
    this.view.setUint32(this.base + at, value, false);
  }

  ascii(at: number, value: string): void {
    for (let i = 0; i < value.length; i += 1) this.bytes[this.base + at + i] = value.charCodeAt(i);
  }

  rational(at: number, numerator: number, denominator: number): void {
    this.u32(at, numerator);
    this.u32(at + 4, denominator);
  }
}

/**
 * One directory entry. `value` fills the four-byte value field, which holds
 * the data itself when it fits and an offset when it does not.
 */
interface Entry {
  tag: number;
  type: number;
  count: number;
  value(tiff: Tiff, at: number): void;
}

function writeIfd(tiff: Tiff, at: number, entries: Entry[]): void {
  tiff.u16(at, entries.length);
  entries.forEach((entry, index) => {
    const entryAt = at + 2 + index * 12;
    tiff.u16(entryAt, entry.tag);
    tiff.u16(entryAt + 2, entry.type);
    tiff.u32(entryAt + 4, entry.count);
    entry.value(tiff, entryAt + 8);
  });
  tiff.u32(at + 2 + entries.length * 12, 0); // no next directory
}

const ifdSize = (entries: number): number => 2 + entries * 12 + 4;

/** A coordinate as the three RATIONALs EXIF wants: degrees, minutes, seconds. */
function degreesMinutesSeconds(value: number): [number, number][] {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = Math.floor((abs - degrees) * 60);
  const seconds = Math.round((abs - degrees - minutes / 60) * 3600 * 100);
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 100],
  ];
}

/**
 * An APP1 EXIF segment carrying a location, a marker string and an
 * orientation. Returns the whole segment including its 0xFFE1 marker.
 */
export function buildExifSegment(latitude: number, longitude: number): Uint8Array {
  const description = PROBE_MARKER + '\0';

  const ifd0At = 8; // straight after the eight-byte TIFF header
  const gpsAt = ifd0At + ifdSize(3);
  const descriptionAt = gpsAt + ifdSize(4);
  const latitudeAt = descriptionAt + description.length;
  const longitudeAt = latitudeAt + 3 * 8;
  const tiffSize = longitudeAt + 3 * 8;

  const header = 'Exif\0\0';
  const bytes = new Uint8Array(2 + 2 + header.length + tiffSize);
  const outer = new DataView(bytes.buffer);
  outer.setUint16(0, 0xffe1, false);
  outer.setUint16(2, 2 + header.length + tiffSize, false); // length excludes the marker
  for (let i = 0; i < header.length; i += 1) bytes[4 + i] = header.charCodeAt(i);

  const tiff = new Tiff(bytes, 4 + header.length);
  tiff.ascii(0, 'MM'); // big-endian
  tiff.u16(2, 42);
  tiff.u32(4, ifd0At);

  writeIfd(tiff, ifd0At, [
    {
      tag: 0x0112, // Orientation
      type: SHORT,
      count: 1,
      // A SHORT occupies the first half of the four-byte value field.
      value: (t, at) => t.u16(at, 6),
    },
    {
      tag: 0x010e, // ImageDescription
      type: ASCII,
      count: description.length,
      value: (t, at) => t.u32(at, descriptionAt),
    },
    {
      tag: 0x8825, // pointer to the GPS directory
      type: LONG,
      count: 1,
      value: (t, at) => t.u32(at, gpsAt),
    },
  ]);

  writeIfd(tiff, gpsAt, [
    {
      tag: 0x0001, // GPSLatitudeRef
      type: ASCII,
      count: 2,
      value: (t, at) => t.ascii(at, latitude >= 0 ? 'N\0' : 'S\0'),
    },
    { tag: 0x0002, type: RATIONAL, count: 3, value: (t, at) => t.u32(at, latitudeAt) },
    {
      tag: 0x0003, // GPSLongitudeRef
      type: ASCII,
      count: 2,
      value: (t, at) => t.ascii(at, longitude >= 0 ? 'E\0' : 'W\0'),
    },
    { tag: 0x0004, type: RATIONAL, count: 3, value: (t, at) => t.u32(at, longitudeAt) },
  ]);

  tiff.ascii(descriptionAt, description);
  degreesMinutesSeconds(latitude).forEach(([n, d], i) => tiff.rational(latitudeAt + i * 8, n!, d!));
  degreesMinutesSeconds(longitude).forEach(([n, d], i) => tiff.rational(longitudeAt + i * 8, n!, d!));

  return bytes;
}

/** Splice an EXIF segment into a JPEG, immediately after the start marker. */
export function spliceExif(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG.');
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

/**
 * The six bytes that open every EXIF block, as numbers rather than a string:
 * two of them are NUL, and a NUL inside a source file is exactly the kind of
 * character a toolchain quietly rewrites.
 */
export const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

/** Whether `needle`'s bytes appear anywhere in `haystack`. */
export function containsAscii(haystack: Uint8Array, needle: string): boolean {
  const target = new Uint8Array(needle.length);
  for (let i = 0; i < needle.length; i += 1) target[i] = needle.charCodeAt(i);
  return containsBytes(haystack, Array.from(target));
}

/** Whether `target`'s bytes appear anywhere in `haystack`. */
export function containsBytes(haystack: Uint8Array, target: number[]): boolean {
  outer: for (let i = 0; i + target.length <= haystack.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      if (haystack[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}

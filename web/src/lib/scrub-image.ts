/**
 * Strip metadata out of images before they are uploaded.
 *
 * A photo taken on a phone carries EXIF, and EXIF routinely carries GPS
 * coordinates, the camera's serial number and a timestamp. Posting one in a
 * channel otherwise hands every member the poster's home address.
 *
 * This happens in the client, on purpose, for two reasons. The obvious one is
 * that the coordinates then never reach our disk at all. The one that decides
 * it: under M7 the server cannot read the image, so the server *cannot* be
 * where this is fixed. GAMEPLAN.md section 1b, finding 6.
 *
 * The method is a canvas round trip. Decoding to pixels and re-encoding
 * produces a file built entirely from the image data, so every metadata
 * container — EXIF, XMP, IPTC, ICC, maker notes — is gone rather than
 * selectively edited. There is no list of tags to keep up to date, which is
 * the failure mode of every EXIF-stripping library.
 *
 * If an image cannot be decoded, the upload is refused. Falling back to
 * sending the original would be the one outcome this file exists to prevent.
 */

/**
 * Types we re-encode. Everything here is something a browser can decode.
 *
 * HEIC is deliberately absent: only Safari decodes it, so on Chrome the round
 * trip would fail and the upload would be refused with a confusing message.
 * It is handled explicitly in `scrubImage` with a message that says what to do.
 */
const SCRUBBABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/*
 * Two deliberate omissions from that set.
 *
 * GIF is left alone: re-encoding through a canvas keeps the first frame and
 * throws the animation away, and the format has no EXIF segment to carry
 * coordinates in the first place.
 *
 * Video is the real gap, and it is not one this file can close. MP4 and
 * QuickTime *do* carry location, and removing it needs a remux rather than a
 * re-encode. Recorded in GAMEPLAN 1b, finding 6.
 */

/** Only Safari decodes these, so the round trip is not portable. */
const UNDECODABLE = new Set(['image/heic', 'image/heif']);

/**
 * Canvases have a size ceiling that varies by browser, and a silently blank
 * canvas would upload a blank image. Anything past this is scaled down to fit;
 * 8192 on a side and 40 megapixels is well above any screenshot and above a
 * current phone camera, so in practice nothing is touched.
 */
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;

/**
 * Quality for the re-encode. 0.92 is visually indistinguishable from the
 * original at normal viewing size; the point of the exercise is the metadata,
 * not compression.
 */
const JPEG_QUALITY = 0.92;

export interface Encoding {
  type: string;
  quality?: number;
}

/** Whether this file is an image we are going to run through the canvas. */
export function needsScrub(type: string): boolean {
  return SCRUBBABLE.has(type);
}

/**
 * What to encode the result as.
 *
 * PNG and WebP re-encode to themselves, so a screenshot stays a screenshot and
 * a WebP does not triple in size. Everything else becomes JPEG: AVIF has no
 * encoder behind `toBlob` in most browsers, and a photo is what JPEG is for.
 */
export function chooseEncoding(sourceType: string): Encoding {
  if (sourceType === 'image/png') return { type: 'image/png' };
  if (sourceType === 'image/webp') return { type: 'image/webp', quality: JPEG_QUALITY };
  return { type: 'image/jpeg', quality: JPEG_QUALITY };
}

/** The extension the scrubbed file should carry, given its new type. */
export function renameFor(filename: string, type: string): string {
  const ext = type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg';
  const base = filename.replace(/\.[^.\s]{1,12}$/, '') || 'image';
  return base + ext;
}

/**
 * Fit an image inside the canvas ceiling, preserving aspect ratio. Returns the
 * original dimensions untouched when it already fits, which is the normal case.
 */
export function fitWithin(
  width: number,
  height: number,
  maxDimension = MAX_DIMENSION,
  maxPixels = MAX_PIXELS,
): { width: number; height: number; scaled: boolean } {
  if (width <= 0 || height <= 0) {
    throw new Error('Image has no dimensions.');
  }

  let scale = 1;
  if (width > maxDimension || height > maxDimension) {
    scale = Math.min(maxDimension / width, maxDimension / height);
  }
  if (width * scale * height * scale > maxPixels) {
    scale = Math.min(scale, Math.sqrt(maxPixels / (width * height)));
  }
  if (scale >= 1) return { width, height, scaled: false };

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scaled: true,
  };
}

/** Thrown when an image cannot be stripped. The caller must not upload anyway. */
export class ScrubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrubError';
  }
}

/**
 * The two browser calls this needs, named so a test can stand in for them.
 * Everything else in `scrubImage` is decision-making, and the decisions are
 * the part with a security property attached, so they are the part tested.
 */
export interface ScrubDeps {
  /** Decode to pixels, with the EXIF orientation already applied. */
  decode(file: File): Promise<{ width: number; height: number; close(): void }>;
  /** Draw at the given size and re-encode. */
  encode(
    bitmap: { width: number; height: number },
    size: { width: number; height: number },
    encoding: Encoding,
  ): Promise<Blob>;
}

const browserDeps: ScrubDeps = {
  async decode(file) {
    // `from-image` bakes the EXIF orientation tag into the pixels. Without it,
    // stripping the metadata would leave phone photos lying on their side.
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  },

  async encode(bitmap, size, encoding) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new ScrubError('This browser refused a canvas, so the image was not cleaned.');
    context.drawImage(bitmap as CanvasImageSource, 0, 0, size.width, size.height);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new ScrubError('The image could not be re-encoded, so it was not uploaded.'));
        },
        encoding.type,
        encoding.quality,
      );
    });
  },
};

/**
 * Return a copy of `file` with no metadata, or the file itself when it is not
 * an image we re-encode.
 *
 * Throws `ScrubError` rather than returning the original when the round trip
 * fails.
 */
export async function scrubImage(file: File, deps: ScrubDeps = browserDeps): Promise<File> {
  if (UNDECODABLE.has(file.type)) {
    throw new ScrubError(
      'This browser cannot read HEIC images, so their location data cannot be removed. ' +
        'Export or convert the photo to JPEG first.',
    );
  }
  if (!needsScrub(file.type)) return file;

  let bitmap: { width: number; height: number; close(): void };
  try {
    bitmap = await deps.decode(file);
  } catch {
    throw new ScrubError('That image could not be read, so its location data could not be removed.');
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const wanted = chooseEncoding(file.type);
    let blob = await deps.encode(bitmap, size, wanted);

    // `toBlob` falls back to PNG rather than failing when it does not know the
    // type, which would turn a 3 MB photo into a 30 MB file. Take JPEG instead.
    if (blob.type !== wanted.type && wanted.type !== 'image/jpeg') {
      blob = await deps.encode(bitmap, size, { type: 'image/jpeg', quality: JPEG_QUALITY });
    }

    return new File([blob], renameFor(file.name, blob.type), {
      type: blob.type,
      lastModified: Date.now(), // The original timestamp is metadata too.
    });
  } finally {
    bitmap.close();
  }
}

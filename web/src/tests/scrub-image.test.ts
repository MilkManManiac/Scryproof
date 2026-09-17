/**
 * The image scrubber's decisions.
 *
 * The canvas round trip itself cannot run here — Node has no DOM — so the two
 * browser calls are injected and these tests cover the part that carries the
 * security property: what happens when the round trip goes wrong. The rule
 * being defended is that a file whose metadata could not be removed is never
 * uploaded anyway.
 *
 * The round trip in a real browser is proven separately by
 * `web/exif-check.html`, which builds a JPEG carrying GPS coordinates, runs it
 * through this module and searches the bytes that come out.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ScrubError,
  type ScrubDeps,
  chooseEncoding,
  fitWithin,
  needsScrub,
  renameFor,
  scrubImage,
} from '../lib/scrub-image';

interface FakeBrowser extends ScrubDeps {
  /** One entry per encode attempt, in order. */
  readonly calls: { type: string; size: { width: number; height: number } }[];
  /** How many decoded bitmaps were released. */
  readonly closed: () => number;
}

/** A stand-in for the browser that records what it was asked to do. */
function fakeDeps(options: {
  width?: number;
  height?: number;
  /** The type each encode call returns, in order. Models `toBlob`'s fallback. */
  returns?: string[];
  failDecode?: boolean;
}): FakeBrowser {
  const returns = options.returns ?? ['image/jpeg'];
  const calls: { type: string; size: { width: number; height: number } }[] = [];
  let closed = 0;

  return {
    calls,
    closed: () => closed,

    async decode() {
      if (options.failDecode) throw new Error('undecodable');
      return {
        width: options.width ?? 100,
        height: options.height ?? 100,
        close() {
          closed += 1;
        },
      };
    },

    async encode(_bitmap, size, encoding) {
      calls.push({ type: encoding.type, size });
      const type = returns[calls.length - 1] ?? returns[returns.length - 1]!;
      return new Blob([new Uint8Array([1, 2, 3])], { type });
    },
  };
}

const jpeg = (name = 'photo.jpg') => new File([new Uint8Array([0xff, 0xd8])], name, { type: 'image/jpeg' });

describe('what gets re-encoded', () => {
  test('the image types a browser can decode are scrubbed', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/avif']) {
      assert.equal(needsScrub(type), true, type);
    }
  });

  test('GIF is left alone, because re-encoding would drop the animation', () => {
    assert.equal(needsScrub('image/gif'), false);
  });

  test('non-images are left alone', () => {
    for (const type of ['application/pdf', 'video/mp4', 'text/plain', '']) {
      assert.equal(needsScrub(type), false, type);
    }
  });

  test('a file that is not scrubbed comes back as the identical object', async () => {
    const pdf = new File([new Uint8Array([1])], 'notes.pdf', { type: 'application/pdf' });
    assert.equal(await scrubImage(pdf, fakeDeps({})), pdf);
  });
});

describe('the refusal rule', () => {
  test('an image that cannot be decoded is refused, not passed through', async () => {
    const original = jpeg();
    await assert.rejects(() => scrubImage(original, fakeDeps({ failDecode: true })), ScrubError);
  });

  test('HEIC is refused with an instruction, and the browser is never asked', async () => {
    const deps = fakeDeps({});
    const heic = new File([new Uint8Array([1])], 'IMG_0001.HEIC', { type: 'image/heic' });

    await assert.rejects(
      () => scrubImage(heic, deps),
      (error: unknown) => {
        assert.ok(error instanceof ScrubError);
        assert.match(error.message, /JPEG/);
        return true;
      },
    );
    assert.equal(deps.calls.length, 0);
  });

  test('an encoder that returns nothing is a refusal, not a silent original', async () => {
    const deps: ScrubDeps = {
      async decode() {
        return { width: 10, height: 10, close() {} };
      },
      async encode() {
        throw new ScrubError('no encoder');
      },
    };
    await assert.rejects(() => scrubImage(jpeg(), deps), ScrubError);
  });
});

describe('the round trip', () => {
  test('the result is a different file from the original', async () => {
    const original = jpeg();
    const clean = await scrubImage(original, fakeDeps({}));
    assert.notEqual(clean, original);
    assert.equal(clean.type, 'image/jpeg');
  });

  test('the decoded bitmap is released even when encoding fails', async () => {
    const deps = fakeDeps({});
    const broken: ScrubDeps = {
      decode: deps.decode,
      async encode() {
        throw new Error('boom');
      },
    };
    await assert.rejects(() => scrubImage(jpeg(), broken));
    assert.equal(deps.closed(), 1);
  });

  test('PNG stays PNG, so a screenshot is not re-compressed as a photo', async () => {
    const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    const deps = fakeDeps({ returns: ['image/png'] });
    const clean = await scrubImage(png, deps);
    assert.equal(deps.calls[0]?.type, 'image/png');
    assert.equal(clean.name, 'shot.png');
  });

  test('a browser that silently falls back to PNG is asked again for JPEG', async () => {
    // `canvas.toBlob` answers with PNG rather than failing when it cannot
    // encode the requested type. Accepting that would turn a 3 MB WebP into a
    // 30 MB PNG, so the second call is the fix.
    const webp = new File([new Uint8Array([1])], 'sticker.webp', { type: 'image/webp' });
    const deps = fakeDeps({ returns: ['image/png', 'image/jpeg'] });
    const clean = await scrubImage(webp, deps);

    assert.deepEqual(
      deps.calls.map((call) => call.type),
      ['image/webp', 'image/jpeg'],
    );
    assert.equal(clean.type, 'image/jpeg');
    assert.equal(clean.name, 'sticker.jpg');
  });

  test('a PNG that comes back as PNG is not asked twice', async () => {
    const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    const deps = fakeDeps({ returns: ['image/png'] });
    await scrubImage(png, deps);
    assert.equal(deps.calls.length, 1);
  });
});

describe('choosing the encoding', () => {
  test('PNG and WebP re-encode to themselves; everything else becomes JPEG', () => {
    assert.equal(chooseEncoding('image/png').type, 'image/png');
    assert.equal(chooseEncoding('image/webp').type, 'image/webp');
    assert.equal(chooseEncoding('image/jpeg').type, 'image/jpeg');
    assert.equal(chooseEncoding('image/avif').type, 'image/jpeg');
  });

  test('PNG is encoded losslessly, with no quality argument', () => {
    assert.equal(chooseEncoding('image/png').quality, undefined);
    assert.ok((chooseEncoding('image/jpeg').quality ?? 0) > 0.9);
  });
});

describe('renaming', () => {
  test('the extension follows the new type', () => {
    assert.equal(renameFor('IMG_0001.HEIC', 'image/jpeg'), 'IMG_0001.jpg');
    assert.equal(renameFor('shot.png', 'image/png'), 'shot.png');
    assert.equal(renameFor('sticker.webp', 'image/webp'), 'sticker.webp');
  });

  test('a name with no extension gains one', () => {
    assert.equal(renameFor('screenshot', 'image/jpeg'), 'screenshot.jpg');
  });

  test('dots inside a name are not mistaken for the extension', () => {
    assert.equal(renameFor('holiday 2026.07.02.jpeg', 'image/jpeg'), 'holiday 2026.07.02.jpg');
  });

  test('a name that is nothing but an extension still produces a filename', () => {
    assert.equal(renameFor('.jpg', 'image/jpeg'), 'image.jpg');
  });
});

describe('fitting inside the canvas ceiling', () => {
  test('ordinary images are untouched', () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: 4032, height: 3024, scaled: false });
  });

  test('one long side is scaled down, keeping the aspect ratio', () => {
    const fitted = fitWithin(20000, 1000);
    assert.equal(fitted.scaled, true);
    assert.ok(fitted.width <= 8192);
    // Rounding to whole pixels moves the ratio slightly; a visible distortion
    // would be far larger than this.
    const drift = Math.abs(fitted.width / fitted.height - 20000 / 1000) / 20;
    assert.ok(drift < 0.01, `aspect ratio drifted by ${(drift * 100).toFixed(2)}%`);
  });

  test('a huge but square image is capped by total pixels, not by one side', () => {
    // 8000 x 8000 is under the per-side ceiling and is 64 megapixels.
    const fitted = fitWithin(8000, 8000);
    assert.equal(fitted.scaled, true);
    assert.ok(fitted.width * fitted.height <= 40_000_000);
  });

  test('the result is never zero on a side', () => {
    const fitted = fitWithin(1_000_000, 2);
    assert.ok(fitted.width >= 1 && fitted.height >= 1);
  });

  test('an image with no dimensions is an error, not a blank canvas', () => {
    assert.throws(() => fitWithin(0, 100));
    assert.throws(() => fitWithin(100, 0));
  });
});

/**
 * Wes: "show like a thumbnail or something of a youtube vid in the app." The
 * card hangs off the video id, so every way people paste a YouTube link has
 * to give the same id, and anything else has to give nothing.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { youtubeIdOf } from '../lib/youtube';

describe('youtubeIdOf', () => {
  it('finds the id in every shape of link people paste', () => {
    for (const href of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?t=43&v=dQw4w9WgXcQ&feature=share',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      assert.equal(youtubeIdOf(href), 'dQw4w9WgXcQ', href);
    }
  });

  it('gives nothing for anything that is not a YouTube video', () => {
    for (const href of [
      'https://www.youtube.com/',
      'https://www.youtube.com/@RickAstley',
      'https://www.youtube.com/watch?v=tooshort',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ%00',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ',
      'https://example.com/youtu.be/dQw4w9WgXcQ',
      'javascript:alert(1)',
      'not a url',
    ]) {
      assert.equal(youtubeIdOf(href), null, href);
    }
  });
});

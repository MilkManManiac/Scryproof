import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { LIMITS, validateSoundName } from '@scryproof/shared';

import { soundLengthProblem, soundSizeProblem, soundTypeFor, soundTypeProblem } from '../lib/sounds';

describe('soundTypeFor', () => {
  it('passes the three types the server accepts straight through', () => {
    assert.equal(soundTypeFor('audio/webm', 'a.webm'), 'audio/webm');
    assert.equal(soundTypeFor('audio/ogg', 'a.ogg'), 'audio/ogg');
    assert.equal(soundTypeFor('audio/mpeg', 'a.mp3'), 'audio/mpeg');
  });

  it('drops codec parameters and case', () => {
    assert.equal(soundTypeFor('audio/webm;codecs=opus', 'clip'), 'audio/webm');
    assert.equal(soundTypeFor('Audio/OGG; codecs="opus"', 'clip'), 'audio/ogg');
  });

  it('maps the labels browsers disagree on', () => {
    assert.equal(soundTypeFor('video/webm', 'airhorn.webm'), 'audio/webm');
    assert.equal(soundTypeFor('audio/mp3', 'airhorn.mp3'), 'audio/mpeg');
    assert.equal(soundTypeFor('audio/opus', 'airhorn.opus'), 'audio/ogg');
  });

  it('falls back to the extension only when there is no label', () => {
    assert.equal(soundTypeFor('', 'Airhorn.MP3'), 'audio/mpeg');
    assert.equal(soundTypeFor('application/octet-stream', 'boo.oga'), 'audio/ogg');
    assert.equal(soundTypeFor('', 'boo.wav'), null);
    assert.equal(soundTypeFor('', 'no-extension'), null);
  });

  it('refuses everything else, whatever the file is called', () => {
    assert.equal(soundTypeFor('audio/wav', 'boo.mp3'), null);
    assert.equal(soundTypeFor('image/svg+xml', 'boo.ogg'), null);
    assert.equal(soundTypeFor('text/html', 'boo.webm'), null);
    assert.equal(soundTypeFor('video/mp4', 'boo.mp3'), null);
  });

  it('explains a refusal in a sentence', () => {
    assert.equal(soundTypeProblem('audio/mpeg', 'a.mp3'), null);
    assert.match(soundTypeProblem('audio/wav', 'a.wav') ?? '', /WebM, Ogg or MP3/);
  });
});

describe('soundLengthProblem', () => {
  it('lets through anything up to the limit', () => {
    assert.equal(soundLengthProblem(0.2), null);
    assert.equal(soundLengthProblem(LIMITS.soundSeconds), null);
  });

  it('allows the few hundredths an encoder pads on', () => {
    assert.equal(soundLengthProblem(LIMITS.soundSeconds + 0.03), null);
  });

  it('refuses a clip that is really longer, and says how long it was', () => {
    const problem = soundLengthProblem(LIMITS.soundSeconds + 0.5);
    assert.ok(problem);
    assert.ok(problem.includes(`at most ${LIMITS.soundSeconds} seconds`));
    assert.ok(problem.includes(`${LIMITS.soundSeconds}.5`));
  });

  it('refuses a clip with no length at all', () => {
    assert.ok(soundLengthProblem(0));
    assert.ok(soundLengthProblem(Number.NaN));
    assert.ok(soundLengthProblem(Number.POSITIVE_INFINITY));
  });
});

describe('soundSizeProblem', () => {
  it('holds the same line as the server', () => {
    assert.equal(soundSizeProblem(LIMITS.soundBytes), null);
    assert.match(soundSizeProblem(LIMITS.soundBytes + 1) ?? '', /1 MB/);
  });
});

describe('validateSoundName', () => {
  it('takes any readable name within the length, trimmed', () => {
    assert.equal(validateSoundName('Airhorn').ok, true);
    assert.equal(validateSoundName('  sad trombone!  ').ok, true);
    assert.equal(validateSoundName('x'.repeat(LIMITS.soundName.max)).ok, true);
  });

  it('refuses empty, too long, and control characters', () => {
    assert.equal(validateSoundName('   ').ok, false);
    assert.equal(validateSoundName('x'.repeat(LIMITS.soundName.max + 1)).ok, false);
    assert.equal(validateSoundName('bad\nname').ok, false);
  });
});

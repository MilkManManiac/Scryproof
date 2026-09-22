/*
 * The house rules run on the sender's client, so the test is on the pure
 * function: every spelling of the joke becomes the confession, and text
 * with nothing in it comes back untouched.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { houseRules } from '@scryproof/shared';

describe('houseRules', () => {
  it('turns every spelling of the joke into the confession', () => {
    for (const word of ['bigballer', 'big baller', 'bigballa', 'bigballah', 'BigBaller', 'BIG BALLAH', 'big-baller', 'bigballers']) {
      assert.equal(houseRules(`he is such a ${word} tonight`), "he is such a I'm an idiot tonight", word);
    }
  });

  it('leaves everything else alone, including the words inside other words', () => {
    for (const line of ['a big ball', 'the baller', 'bigger ballet', 'nothing here', '']) {
      assert.equal(houseRules(line), line);
    }
  });

  it('replaces every occurrence, not only the first', () => {
    assert.equal(houseRules('bigballer bigballer'), "I'm an idiot I'm an idiot");
  });
});

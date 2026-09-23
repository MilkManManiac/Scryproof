/*
 * The house rules run on the sender's client (and again on the server for
 * what it can read), so the test is on the pure function: every spelling of
 * the joke, however disguised, becomes the confession, and ordinary talk
 * about balls comes back untouched.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { houseRules } from '@scryproof/shared';

const CONFESSION = "he is such a I'm an idiot tonight";

describe('houseRules', () => {
  it('turns every spelling of the joke into the confession', () => {
    for (const word of ['bigballer', 'big baller', 'bigballa', 'bigballah', 'BigBaller', 'BIG BALLAH', 'big-baller', 'bigballers', 'bigballr', 'big ballar']) {
      assert.equal(houseRules(`he is such a ${word} tonight`), CONFESSION, word);
    }
  });

  it('sees through spacing, punctuation, held keys and invisible characters', () => {
    for (const word of [
      'b i g b a l l e r',
      'b.i.g.b.a.l.l.e.r',
      'b_i_g_b_a_l_l_e_r',
      'biiig baaaallllerrrr',
      'big​baller',
      'big­baller',
      'big🏀baller',
      'BiG bAlLeR',
      'big\nballer',
    ]) {
      assert.equal(houseRules(`he is such a ${word} tonight`), CONFESSION, JSON.stringify(word));
    }
  });

  it('sees through digits, symbols, accents and lookalike letters', () => {
    for (const word of [
      'b1gb4ll3r',
      '8i9ba||er',
      'b!gb@ll3r',
      'bíg bállér',
      'bïg bâllèr',
      'bigbаller', // Cyrillic а
      'bіgballеr', // Cyrillic і and е
      'ｂｉｇｂａｌｌｅｒ', // full width
      'BIGBALLER',
      'blgballer',
      'blgbaIIer',
    ]) {
      assert.equal(houseRules(`he is such a ${word} tonight`), CONFESSION, word);
    }
  });

  it('leaves everything else alone, including talk about an actual ball', () => {
    for (const line of [
      'a big ball',
      'the baller',
      'bigger ballet',
      'nothing here',
      '',
      'a big ball of fire',
      'throw a big ball and run',
      'a big ball, really',
      'the big ball era',
      "I'm an idiot",
      // longer words that begin the same way
      'a big balance sheet',
      'the big ballet',
      'a big bale of hay',
      'the big ballroom',
      'Big Bailey is here',
      'big ballad',
    ]) {
      assert.equal(houseRules(line), line, line);
    }
  });

  it('replaces every occurrence, not only the first', () => {
    assert.equal(houseRules('bigballer bigballer'), "I'm an idiot I'm an idiot");
    assert.equal(houseRules('bigballerbigballer'), "I'm an idiotI'm an idiot");
  });

  it('never reaches into mentions or links', () => {
    const line = 'hey <@8196b411-4a3e-4f00-9e11-3e7a1b6c9d2a> look https://example.com/bigballer';
    assert.equal(houseRules(line), line);
    assert.equal(houseRules('<@abc> is a bigballer'), "<@abc> is a I'm an idiot");
  });

  it('is not fooled by brackets, which are only text', () => {
    assert.equal(houseRules('<bigballer>'), "<I'm an idiot>");
    assert.equal(houseRules('<:bigballer:1>'), "<:I'm an idiot:1>");
    assert.equal(houseRules('<@bigballer>'), "<@I'm an idiot>");
  });

  it('turns an @ of someone named for the joke into the confession too', () => {
    assert.equal(houseRules('@BigBaller come here'), "@I'm an idiot come here");
  });
});

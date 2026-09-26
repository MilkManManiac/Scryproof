/**
 * Which links open the guide inside Scryproof instead of a new tab.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { guideTopicOf } from '../lib/guide';

const HERE = 'https://scryproof.com';

describe('guide links', () => {
  it('opens the topic a link to this site names', () => {
    assert.equal(guideTopicOf('https://scryproof.com/?guide=phone', HERE), 'phone');
    assert.equal(guideTopicOf('https://scryproof.com/?guide=settings', HERE), 'settings');
  });

  it('opens the first tab for a topic it does not know', () => {
    assert.equal(guideTopicOf('https://scryproof.com/?guide=', HERE), 'basics');
    assert.equal(guideTopicOf('https://scryproof.com/?guide=nonsense', HERE), 'basics');
  });

  it('leaves every other link alone', () => {
    assert.equal(guideTopicOf('https://scryproof.com/', HERE), null);
    assert.equal(guideTopicOf('https://scryproof.com/download', HERE), null);
    assert.equal(guideTopicOf('https://example.com/?guide=phone', HERE), null);
    assert.equal(guideTopicOf('not a link at all ::', HERE), null);
  });
});

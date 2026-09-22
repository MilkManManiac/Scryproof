/**
 * How a message body is cut into the pieces a client draws.
 *
 * Links are the part with teeth. A body is text somebody else wrote, so the
 * question is never "does this look like a link" but "what will this build".
 * Anything that is not http or https has to come out the far end as text.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { emojiToken, hrefFor, isEmojiToken, mentionToken, splitContent, validateEmojiName } from '@scryproof/shared';
import type { ContentPart } from '@scryproof/shared';

const ALEX = '018f0000-0000-7000-8000-000000000002';

const links = (content: string) =>
  splitContent(content).filter((part): part is Extract<ContentPart, { kind: 'link' }> => part.kind === 'link');

const text = (parts: ContentPart[]) =>
  parts.map((part) => (part.kind === 'text' ? part.text : '')).join('');

describe('links in a message body', () => {
  it('finds a plain address', () => {
    assert.deepEqual(links('see https://example.test/a'), [
      { kind: 'link', href: 'https://example.test/a', text: 'https://example.test/a' },
    ]);
  });

  it('gives a bare www. https, never http', () => {
    const [link] = links('www.example.test');
    assert.equal(link?.href, 'https://www.example.test/');
    assert.equal(link?.text, 'www.example.test');
  });

  it('leaves the full stop with the sentence', () => {
    const parts = splitContent('go to https://example.test/a.');
    assert.equal(links('go to https://example.test/a.')[0]?.text, 'https://example.test/a');
    assert.equal(text(parts).endsWith('.'), true);
  });

  it('keeps a bracket the address opened, and drops one it did not', () => {
    assert.equal(links('https://example.test/a_(b)')[0]?.text, 'https://example.test/a_(b)');
    assert.equal(links('(see https://example.test/a)')[0]?.text, 'https://example.test/a');
  });

  it('builds nothing from a scheme that is not http or https', () => {
    for (const body of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///C:/Windows/System32',
      'vbscript:msgbox(1)',
    ]) {
      assert.deepEqual(links(body), [], body);
      assert.equal(text(splitContent(body)), body, `${body} should survive as text`);
    }
  });

  it('is not fooled by a scheme hidden inside a word', () => {
    assert.deepEqual(links('notjavascript:alert(1)'), []);
    assert.deepEqual(links('xhttps://example.test'), []);
  });

  it('keeps the whole body when it is put back together', () => {
    const body = `hi ${mentionToken(ALEX)} look at https://example.test/a, and www.b.test too!`;
    const rebuilt = splitContent(body)
      .map((part) => {
        if (part.kind === 'text') return part.text;
        if (part.kind === 'link') return part.text;
        if (part.kind === 'everyone') return '@everyone';
        if (part.kind === 'emoji') return emojiToken(part.name);
        return mentionToken(part.userId);
      })
      .join('');
    assert.equal(rebuilt, body);
  });

  it('reads the same body twice the same way', () => {
    const body = 'https://example.test/a and https://example.test/b';
    assert.deepEqual(splitContent(body), splitContent(body));
  });

  it('finds mentions and links in one pass', () => {
    const kinds = splitContent(`${mentionToken(ALEX)} https://example.test @everyone`).map(
      (part) => part.kind,
    );
    assert.deepEqual(kinds, ['mention', 'text', 'link', 'text', 'everyone']);
  });
});

/**
 * Custom emoji.
 *
 * The split says only "this is shaped like `:name:`". Whether the server has
 * one by that name is not knowable here, and the renderer draws an unknown one
 * as plain text, so the tests below are about the shape and about not eating
 * anything that was never an emoji.
 */
describe('custom emoji in a message body', () => {
  const names = (content: string) =>
    splitContent(content)
      .filter((part): part is Extract<ContentPart, { kind: 'emoji' }> => part.kind === 'emoji')
      .map((part) => part.name);

  it('finds one in the middle of a sentence', () => {
    assert.deepEqual(splitContent('nice :cheer: work'), [
      { kind: 'text', text: 'nice ' },
      { kind: 'emoji', name: 'cheer' },
      { kind: 'text', text: ' work' },
    ]);
  });

  it('finds one with no spaces around it, and several in a row', () => {
    assert.deepEqual(names(':a1::b_2:'), ['a1', 'b_2']);
  });

  it('leaves a name that cannot be an emoji as text', () => {
    // Too short, too long, a capital, a hyphen, and an unclosed pair.
    for (const body of [':a:', `:${'x'.repeat(33)}:`, ':Cheer:', ':not-ok:', ':cheer']) {
      assert.deepEqual(names(body), [], `${body} should not be an emoji`);
      assert.equal(text(splitContent(body)), body, `${body} should survive as text`);
    }
  });

  it('does not take a colon out of a link', () => {
    const body = 'https://example.test:8080/a:cheer:b';
    assert.deepEqual(names(body), []);
    assert.equal(links(body)[0]?.text, body);
  });

  it('puts the body back together unchanged', () => {
    const body = `hi ${mentionToken(ALEX)} :cheer: see https://example.test/a`;
    const rebuilt = splitContent(body)
      .map((part) => {
        if (part.kind === 'text') return part.text;
        if (part.kind === 'link') return part.text;
        if (part.kind === 'everyone') return '@everyone';
        if (part.kind === 'emoji') return emojiToken(part.name);
        return mentionToken(part.userId);
      })
      .join('');
    assert.equal(rebuilt, body);
  });
});

describe('emoji names', () => {
  it('accepts lowercase, digits and underscore', () => {
    for (const name of ['ok', 'cheer', 'd20', 'nat_20', 'a'.repeat(32)]) {
      assert.equal(validateEmojiName(name).ok, true, name);
    }
  });

  it('refuses anything that would make `:name:` ambiguous', () => {
    for (const name of ['a', 'a'.repeat(33), 'Cheer', 'not-ok', 'with space', 'colon:inside', '']) {
      assert.equal(validateEmojiName(name).ok, false, name);
    }
  });

  it('recognises a whole token, which is how a custom reaction is stored', () => {
    assert.equal(isEmojiToken(':cheer:'), true);
    assert.equal(isEmojiToken('cheer'), false);
    assert.equal(isEmojiToken(':cheer: '), false);
    assert.equal(isEmojiToken('a :cheer: b'), false);
    assert.equal(isEmojiToken('👍'), false);
  });
});

describe('hrefFor', () => {
  it('refuses anything that is not http or https', () => {
    assert.equal(hrefFor('javascript:alert(1)'), null);
    assert.equal(hrefFor('data:text/plain,hi'), null);
    assert.equal(hrefFor('not a url at all'), null);
  });

  it('accepts both http and https, unchanged in scheme', () => {
    assert.equal(hrefFor('http://example.test/'), 'http://example.test/');
    assert.equal(hrefFor('https://example.test/'), 'https://example.test/');
  });
});

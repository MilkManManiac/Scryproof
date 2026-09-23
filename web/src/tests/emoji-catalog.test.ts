/**
 * Every emoji, for the scrolling picker.
 *
 * The data file is generated from Unicode's list by `scripts/emoji-data.mjs`.
 * What must hold whatever Unicode version it was made from: every name that
 * worked before still means the same emoji, no name means two emoji, no
 * category is empty, and search finds things by name and by keyword.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { REACTION_MAX_LENGTH } from '@scryproof/shared';
import { EMOJI_DATA_VERSION } from '../lib/emoji-data';
import {
  catalogSearchScore,
  emojiByName,
  emojiCatalog,
  emojiOffers,
  expandShortcodes,
  searchEmoji,
  SHORTCODES,
  withTone,
} from '../lib/emoji';

const all = emojiCatalog().flatMap((group) => group.emoji);

describe('the emoji data', () => {
  it('says which Unicode version it came from', () => {
    assert.match(EMOJI_DATA_VERSION, /^\d+\.\d+$/);
  });

  it('has the eight categories in order, none empty', () => {
    assert.deepEqual(
      emojiCatalog().map((group) => group.label),
      [
        'Smileys & People',
        'Animals & Nature',
        'Food & Drink',
        'Activities',
        'Travel & Places',
        'Objects',
        'Symbols',
        'Flags',
      ],
    );
    for (const group of emojiCatalog()) assert.ok(group.emoji.length > 0, group.label);
  });

  it('is well over a thousand emoji, each listed once', () => {
    assert.ok(all.length > 1500, `only ${all.length}`);
    assert.equal(new Set(all.map((entry) => entry.emoji)).size, all.length);
  });

  it('gives no name to two emoji', () => {
    const seen = new Map<string, string>();
    for (const entry of all) {
      for (const name of entry.names) {
        assert.equal(seen.get(name), undefined, `:${name}: is both ${seen.get(name)} and ${entry.emoji}`);
        seen.set(name, entry.emoji);
      }
    }
  });

  it('keeps every hand-picked name meaning what it meant, and in the picker', () => {
    for (const [name, emoji] of Object.entries(SHORTCODES)) {
      assert.equal(emojiByName(name), emoji, name);
      assert.equal(expandShortcodes(`:${name}:`), emoji, name);
      const entry = all.find((each) => each.emoji === emoji);
      assert.ok(entry?.names.includes(name), `:${name}: is not on ${emoji} in the picker`);
    }
  });

  it('shows the hand-picked name when there is one', () => {
    assert.equal(all.find((entry) => entry.emoji === '🔥')?.name, 'fire');
    assert.equal(all.find((entry) => entry.emoji === '🫃')?.name, 'pregnant_man');
  });

  it('names everything else after Unicode, without taking a hand-picked name', () => {
    assert.equal(emojiByName('grinning_face'), '😀');
    // SHORTCODES has `cat` for the cat face; the whole cat moves aside.
    assert.equal(emojiByName('cat'), '🐱');
    assert.equal(emojiByName('cat2'), '🐈');
    assert.equal(expandShortcodes('hi :flag_japan:'), 'hi 🇯🇵');
  });

  it('still leaves unknown names and the typing list alone', () => {
    assert.equal(expandShortcodes(':not_an_emoji_at_all:'), ':not_an_emoji_at_all:');
    // The list under the message box offers hand-picked names only.
    for (const offer of emojiOffers('face', 50)) assert.ok(offer.name in SHORTCODES, offer.name);
  });

  it('fits every emoji, skin tones included, in a reaction', () => {
    for (const entry of all) {
      for (const each of [entry.emoji, ...(entry.tones ?? [])]) {
        assert.ok(each.length <= REACTION_MAX_LENGTH, `${entry.name} is ${each.length} long`);
      }
    }
  });

  it('has all five skin tones where it has any', () => {
    const thumbs = all.find((entry) => entry.emoji === '👍');
    assert.ok(thumbs);
    assert.equal(thumbs.tones?.length, 5);
    assert.equal(withTone(thumbs, 0), '👍');
    assert.equal(withTone(thumbs, 3), '👍🏽');
    for (const entry of all) if (entry.tones) assert.equal(entry.tones.length, 5, entry.name);
    const fire = all.find((entry) => entry.emoji === '🔥');
    assert.ok(fire);
    assert.equal(withTone(fire, 5), '🔥');
  });
});

describe('searchEmoji', () => {
  it('finds by a hand-picked name first', () => {
    assert.equal(searchEmoji('fire')[0]?.entry.emoji, '🔥');
  });

  it('puts the emoji named exactly that ahead of longer names starting with it', () => {
    // 💘's Unicode name, "heart with arrow", also starts with "heart".
    assert.equal(searchEmoji('heart')[0]?.entry.emoji, '❤️');
    assert.equal(searchEmoji('cat')[0]?.entry.emoji, '🐱');
  });

  it('finds by Unicode name, spaces and underscores alike', () => {
    const hits = searchEmoji('pregnant man').map((hit) => hit.entry.emoji);
    assert.ok(hits.includes('🫃'));
    assert.ok(searchEmoji('grinning_face').some((hit) => hit.entry.emoji === '😀'));
  });

  it('finds a word inside a name ahead of letters inside a word', () => {
    const cat = all.find((entry) => entry.emoji === '🐈')!;
    const kiss = all.find((entry) => entry.label === 'kissing cat')!;
    assert.equal(catalogSearchScore(cat, 'cat'), 0);
    assert.equal(catalogSearchScore(kiss, 'cat'), 1);
    const card = all.find((entry) => entry.emoji === '🪪')!;
    assert.equal(catalogSearchScore(card, 'cat'), 2);
  });

  it('falls back to the Unicode subgroup as a keyword', () => {
    const hits = searchEmoji('mammal').map((hit) => hit.entry.emoji);
    assert.ok(hits.includes('🐈'));
    assert.ok(searchEmoji('mammal').every((hit) => hit.score === 3));
  });

  it('is empty for an empty query or no match, and respects the limit', () => {
    assert.equal(searchEmoji('').length, 0);
    assert.equal(searchEmoji('   ').length, 0);
    assert.equal(searchEmoji('xyzzyplugh').length, 0);
    assert.equal(searchEmoji('a', 5).length, 5);
  });

  it('finds flags by country', () => {
    assert.ok(searchEmoji('japan').some((hit) => hit.entry.emoji === '🇯🇵'));
  });
});

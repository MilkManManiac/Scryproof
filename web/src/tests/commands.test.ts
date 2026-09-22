import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { commandOffers, commandQueryAt, expandTextCommand, spawnOf } from '../lib/commands';
import { emojiOffers, expandShortcodes } from '../lib/emoji';

describe('spawnOf', () => {
  it('reads a character jump and nothing else', () => {
    assert.equal(spawnOf('/tang-jump')?.name, 'Tang');
    assert.equal(spawnOf('  /Tang-Jump ')?.name, 'Tang');
    assert.equal(spawnOf('/tang-jump now'), null);
    assert.equal(spawnOf('/nobody-jump'), null);
    assert.equal(spawnOf('tang-jump'), null);
    assert.equal(spawnOf(null), null);
  });
});

describe('expandTextCommand', () => {
  it('replaces a text command and keeps what follows', () => {
    assert.equal(expandTextCommand('/shrug'), '¯\\_(ツ)_/¯');
    assert.equal(expandTextCommand('/shrug no idea'), '¯\\_(ツ)_/¯ no idea');
  });
  it('leaves everything else alone', () => {
    assert.equal(expandTextCommand('/tang-jump'), '/tang-jump');
    assert.equal(expandTextCommand('/roll 2d6'), '/roll 2d6');
    assert.equal(expandTextCommand('shrug'), 'shrug');
  });
});

describe('commandQueryAt', () => {
  it('only answers a slash word at the very start', () => {
    assert.deepEqual(commandQueryAt('/ta', 3), { start: 0, query: 'ta' });
    assert.deepEqual(commandQueryAt('/', 1), { start: 0, query: '' });
    assert.equal(commandQueryAt('/roll 2', 7), null);
    assert.equal(commandQueryAt('a /ta', 5), null);
  });
});

describe('commandOffers', () => {
  it('puts what starts with the query first and caps the list', () => {
    const offers = commandOffers('t');
    assert.equal(offers.length, 7);
    assert.ok(offers[0]?.written.startsWith('/t'));
    assert.ok(commandOffers('tang')[0]?.note.includes('Tang'));
    assert.equal(commandOffers('zzz').length, 0);
    assert.ok(commandOffers('shr').some((offer) => offer.written === '/shrug'));
  });
});

describe('expandShortcodes', () => {
  it('turns known names into the emoji and leaves unknown ones', () => {
    assert.equal(expandShortcodes('nice :+1: :fire:'), 'nice 👍 🔥');
    assert.equal(expandShortcodes(':nope: :fire:'), ':nope: 🔥');
    assert.equal(expandShortcodes('a:fire:'), 'a:fire:');
  });
  it('keeps the names a server owns', () => {
    assert.equal(expandShortcodes(':fire:', (name) => name === 'fire'), ':fire:');
  });
});

describe('emojiOffers', () => {
  it('matches by name, best first, one row per emoji', () => {
    const offers = emojiOffers('thumb');
    assert.equal(offers[0]?.emoji, '👍');
    assert.equal(offers.filter((offer) => offer.emoji === '👍').length, 1);
    assert.equal(emojiOffers('').length, 0);
  });
});

/**
 * When a message makes a sound.
 *
 * Two failures matter and they pull in opposite directions: a client that
 * pings on everything gets muted within a day, and a client that stays silent
 * for the one message addressed to you is the reason people go back to
 * Discord. These are the rules that hold the line between them.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { soundFor } from '../lib/notify';
import type { NotifyPrefs, SoundContext } from '../lib/notify';

const ME = 'me';
const THEM = 'them';

const prefs: NotifyPrefs = { mention: true, message: 'unfocused' };

const base: SoundContext = {
  authorId: THEM,
  mentions: [],
  mentionsEveryone: false,
  selfId: ME,
  channelId: 'c1',
  openChannelId: 'c1',
  windowFocused: true,
  prefs,
};

const sound = (patch: Partial<SoundContext>) => soundFor({ ...base, ...patch });

describe('soundFor', () => {
  it('never sounds for something you said yourself', () => {
    assert.equal(sound({ authorId: ME, mentions: [ME], windowFocused: false }), null);
  });

  it('sounds when you are named, wherever you are', () => {
    assert.equal(sound({ mentions: [ME] }), 'mention');
    assert.equal(sound({ mentions: [ME], channelId: 'c2', windowFocused: false }), 'mention');
  });

  it('treats an accepted @everyone as naming you', () => {
    assert.equal(sound({ mentionsEveryone: true }), 'mention');
  });

  it('stays quiet about a name that is not yours', () => {
    assert.equal(sound({ mentions: ['someone-else'], windowFocused: false, prefs: { ...prefs, message: 'off' } }), null);
  });

  it('says nothing for a channel you are sitting in front of', () => {
    assert.equal(sound({ prefs: { ...prefs, message: 'always' } }), null);
  });

  it('sounds for another channel even while you are looking at this one', () => {
    assert.equal(sound({ channelId: 'c2', prefs: { ...prefs, message: 'always' } }), 'message');
  });

  it('honours "when I am somewhere else"', () => {
    assert.equal(sound({ windowFocused: false }), 'message');
    assert.equal(sound({ windowFocused: true, channelId: 'c2' }), null);
  });

  it('honours "never"', () => {
    assert.equal(sound({ windowFocused: false, prefs: { ...prefs, message: 'off' } }), null);
    // A mention still gets through: "never" is about everything else.
    assert.equal(sound({ windowFocused: false, mentions: [ME], prefs: { ...prefs, message: 'off' } }), 'mention');
  });

  it('can be told to stop pinging on mentions too', () => {
    assert.equal(
      sound({ mentions: [ME], windowFocused: false, prefs: { mention: false, message: 'off' } }),
      null,
    );
  });

  it('says nothing at all before anyone is signed in', () => {
    assert.equal(sound({ selfId: null, mentions: [ME] }), null);
  });
});

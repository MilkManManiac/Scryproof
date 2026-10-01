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

import { DEFAULT_MOMENTS, load, momentSounds, placeMode, popupFor, soundFor, withPlace } from '../lib/notify';
import type { NotifyPrefs, PopupContext, SoundContext } from '../lib/notify';

const ME = 'me';
const THEM = 'them';

const prefs: NotifyPrefs = {
  mention: true,
  message: 'unfocused',
  mutedServers: [],
  mutedChannels: [],
  volume: 1,
  pushEvery: false,
  pushWhileAttending: true,
  moments: DEFAULT_MOMENTS,
  watched: [],
  mentionsOnly: [],
  popupDetail: 'where',
};
const NEW_FIELDS = { moments: DEFAULT_MOMENTS, watched: [], mentionsOnly: [], popupDetail: 'where' };

const base: SoundContext = {
  authorId: THEM,
  mentions: [],
  mentionsEveryone: false,
  selfId: ME,
  channelId: 'c1',
  serverId: 's1',
  openChannelId: 'c1',
  windowFocused: true,
  blocked: false,
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
      sound({ mentions: [ME], windowFocused: false, prefs: { ...prefs, mention: false, message: 'off' } }),
      null,
    );
  });

  it('says nothing at all before anyone is signed in', () => {
    assert.equal(sound({ selfId: null, mentions: [ME] }), null);
  });

  it('stays silent for a blocked person, even a mention', () => {
    assert.equal(sound({ mentions: [ME], windowFocused: false, blocked: true }), null);
    assert.equal(sound({ windowFocused: false, blocked: true }), null);
  });

  it('stays silent for a muted server, even a mention', () => {
    assert.equal(
      sound({ mentions: [ME], windowFocused: false, prefs: { ...prefs, mutedServers: ['s1'] } }),
      null,
    );
    // A different server is not touched by that mute.
    assert.equal(
      sound({ mentions: [ME], serverId: 's2', windowFocused: false, prefs: { ...prefs, mutedServers: ['s1'] } }),
      'mention',
    );
  });

  it('stays silent for a muted channel, even a mention', () => {
    assert.equal(
      sound({ mentions: [ME], windowFocused: false, prefs: { ...prefs, mutedChannels: ['c1'] } }),
      null,
    );
    // Muting one channel does not mute the rest of its server.
    assert.equal(
      sound({ mentions: [ME], channelId: 'c2', windowFocused: false, prefs: { ...prefs, mutedChannels: ['c1'] } }),
      'mention',
    );
  });
});

describe('loading saved prefs', () => {
  const fakeStorage = (value: string | null) => ({
    getItem: () => value,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  });

  it('fills in the mute lists for prefs saved before muting existed', () => {
    const globalWithStorage = globalThis as { localStorage?: unknown };
    const previous = globalWithStorage.localStorage;
    globalWithStorage.localStorage = fakeStorage(JSON.stringify({ mention: false, message: 'off' }));
    try {
      assert.deepEqual(load(), { mention: false, message: 'off', mutedServers: [], mutedChannels: [], volume: 1, pushEvery: false, pushWhileAttending: true, ...NEW_FIELDS });
    } finally {
      globalWithStorage.localStorage = previous;
    }
  });

  it('keeps a saved volume only when it is a number on the slider', () => {
    const globalWithStorage = globalThis as { localStorage?: unknown };
    const previous = globalWithStorage.localStorage;
    try {
      globalWithStorage.localStorage = fakeStorage(JSON.stringify({ volume: 1.5 }));
      assert.equal(load().volume, 1.5);
      globalWithStorage.localStorage = fakeStorage(JSON.stringify({ volume: 9 }));
      assert.equal(load().volume, 2);
      globalWithStorage.localStorage = fakeStorage(JSON.stringify({ volume: 'loud' }));
      assert.equal(load().volume, 1);
    } finally {
      globalWithStorage.localStorage = previous;
    }
  });

  it('falls back to defaults when there is nothing saved', () => {
    const globalWithStorage = globalThis as { localStorage?: unknown };
    const previous = globalWithStorage.localStorage;
    globalWithStorage.localStorage = fakeStorage(null);
    try {
      assert.deepEqual(load(), { mention: true, message: 'unfocused', mutedServers: [], mutedChannels: [], volume: 1, pushEvery: false, pushWhileAttending: true, ...NEW_FIELDS });
    } finally {
      globalWithStorage.localStorage = previous;
    }
  });
});

describe('a channel or server set differently (2026-10-01)', () => {
  it("a channel's own setting wins over its server's", () => {
    const set = withPlace(withPlace(prefs, 's1', 'server', 'mentions'), 'c1', 'channel', 'watch');
    assert.equal(placeMode(set, 's1', 'c1'), 'watch');
    assert.equal(placeMode(set, 's1', 'c2'), 'mentions');
  });

  it('moving a place to a mode takes it out of every other list', () => {
    let set = withPlace(prefs, 'c1', 'channel', 'mute');
    set = withPlace(set, 'c1', 'channel', 'watch');
    assert.deepEqual(set.mutedChannels, []);
    assert.deepEqual(set.watched, ['c1']);
    set = withPlace(set, 'c1', 'channel', 'default');
    assert.deepEqual(set.watched, []);
  });

  it('a watched channel sounds for every message, even with channel sounds off', () => {
    const watching = withPlace({ ...prefs, message: 'off' }, 'c1', 'channel', 'watch');
    assert.equal(sound({ channelId: 'c1', openChannelId: 'c2', prefs: watching }), 'message');
    // Still not for the one on screen.
    assert.equal(sound({ channelId: 'c1', openChannelId: 'c1', prefs: watching }), null);
  });

  it('mentions only lets mentions through and nothing else', () => {
    const quiet = withPlace({ ...prefs, message: 'always' }, 's1', 'server', 'mentions');
    assert.equal(sound({ channelId: 'c2', windowFocused: false, prefs: quiet }), null);
    assert.equal(sound({ channelId: 'c2', windowFocused: false, mentions: [ME], prefs: quiet }), 'mention');
  });

  it('a direct message has its own sound, and none while you are reading it', () => {
    assert.equal(sound({ isDm: true, serverId: null, channelId: 'd1', openChannelId: null }), 'dm');
    assert.equal(sound({ isDm: true, serverId: null, channelId: 'd1', openChannelId: 'd1' }), null);
    const silent = { ...prefs, moments: { ...DEFAULT_MOMENTS, dm: { sound: 'none' as const, popup: true } } };
    assert.equal(sound({ isDm: true, serverId: null, channelId: 'd1', openChannelId: null, prefs: silent }), null);
  });
});

describe('popupFor', () => {
  const pop: PopupContext = { moment: 'message', authorId: THEM, selfId: ME, blocked: false, mode: 'default', onScreen: false, prefs };
  const popup = (patch: Partial<PopupContext>) => popupFor({ ...pop, ...patch });

  it("follows each moment's switch by default", () => {
    assert.equal(popup({ moment: 'mention' }), true);
    assert.equal(popup({ moment: 'message' }), false);
    assert.equal(popup({ moment: 'game' }), false);
  });

  it('never for your own, a blocked person, something on screen, or a muted place', () => {
    assert.equal(popup({ moment: 'mention', authorId: ME }), false);
    assert.equal(popup({ moment: 'mention', blocked: true }), false);
    assert.equal(popup({ moment: 'mention', onScreen: true }), false);
    assert.equal(popup({ moment: 'mention', mode: 'mute' }), false);
  });

  it('a watched channel pops up for every message; a watched room for arrivals', () => {
    assert.equal(popup({ moment: 'message', mode: 'watch' }), true);
    assert.equal(popup({ moment: 'joined', mode: 'watch' }), true);
  });

  it('mentions only is mentions only', () => {
    const loud = { ...prefs, moments: { ...DEFAULT_MOMENTS, message: { sound: 'one-note' as const, popup: true } } };
    assert.equal(popup({ moment: 'message', mode: 'mentions', prefs: loud }), false);
    assert.equal(popup({ moment: 'live', mode: 'mentions' }), false);
    assert.equal(popup({ moment: 'mention', mode: 'mentions' }), true);
  });

  it('the other moments sound only where they are allowed to', () => {
    assert.equal(momentSounds(prefs, 'game', 'default'), false);
    assert.equal(momentSounds(prefs, 'live', 'default'), true);
    assert.equal(momentSounds(prefs, 'live', 'mute'), false);
    assert.equal(momentSounds(prefs, 'joined', 'watch'), true);
  });
});

describe('loading the newer settings', () => {
  it('drops a sound that no longer exists and keeps the rest', () => {
    const globalWithStorage = globalThis as { localStorage?: unknown };
    const previous = globalWithStorage.localStorage;
    globalWithStorage.localStorage = {
      getItem: () => JSON.stringify({ moments: { dm: { sound: 'kazoo', popup: false } }, watched: ['c1', 7], popupDetail: 'everything' }),
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    try {
      const loaded = load();
      assert.deepEqual(loaded.moments.dm, { sound: DEFAULT_MOMENTS.dm.sound, popup: false });
      assert.deepEqual(loaded.moments.mention, DEFAULT_MOMENTS.mention);
      assert.deepEqual(loaded.watched, ['c1']);
      assert.equal(loaded.popupDetail, 'where');
    } finally {
      globalWithStorage.localStorage = previous;
    }
  });
});

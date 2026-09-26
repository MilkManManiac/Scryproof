/**
 * What the red label says, which tone plays, and when "You're muted" speaks up.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COOLDOWN_MS, MutedTalkWatch, WATCH_EVERY_MS, muteCue, muteLabel, talkingLevel } from '../lib/mute-state';

const clear = { selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false };

describe('the label', () => {
  it('says nothing when you can talk and hear', () => {
    assert.equal(muteLabel(clear), null);
    assert.equal(muteLabel(undefined), null);
  });

  it('says muted, and clicking unmutes', () => {
    const label = muteLabel({ ...clear, selfMute: true });
    assert.equal(label?.text, 'Muted');
    assert.deepEqual(label?.undo, { selfMute: false });
  });

  it('deafened wins over muted', () => {
    const label = muteLabel({ ...clear, selfMute: true, selfDeaf: true });
    assert.equal(label?.kind, 'deafened');
    assert.deepEqual(label?.undo, { selfDeaf: false });
  });

  it('a moderator’s mute or deafen names them and cannot be undone here', () => {
    assert.equal(muteLabel({ ...clear, serverMute: true })?.text, 'Muted by a moderator');
    assert.equal(muteLabel({ ...clear, serverMute: true })?.undo, null);
    assert.equal(muteLabel({ ...clear, selfDeaf: true, serverDeaf: true })?.text, 'Deafened by a moderator');
    assert.equal(muteLabel({ ...clear, serverMute: true, selfMute: true })?.undo, null);
  });

  it('your own deafen outranks a moderator’s mute, and clicking it undeafens', () => {
    const label = muteLabel({ ...clear, selfDeaf: true, serverMute: true });
    assert.equal(label?.text, 'Deafened');
    assert.deepEqual(label?.undo, { selfDeaf: false });
  });
});

describe('the tones', () => {
  it('plays nothing on the first state of a call', () => {
    assert.equal(muteCue(undefined, { ...clear, selfMute: true }), null);
  });

  it('mute and unmute', () => {
    assert.equal(muteCue(clear, { ...clear, selfMute: true }), 'muted');
    assert.equal(muteCue({ ...clear, selfMute: true }, clear), 'unmuted');
  });

  it('a moderator muting you sounds the same', () => {
    assert.equal(muteCue(clear, { ...clear, serverMute: true }), 'muted');
  });

  it('deafen says deafened, not muted, and undeafen into a mute says undeafened', () => {
    assert.equal(muteCue(clear, { ...clear, selfDeaf: true }), 'deafened');
    assert.equal(muteCue({ ...clear, selfMute: true, selfDeaf: true }, { ...clear, selfMute: true }), 'undeafened');
  });

  it('muting while deafened changes nothing you would hear', () => {
    assert.equal(muteCue({ ...clear, selfDeaf: true }, { ...clear, selfDeaf: true, selfMute: true }), null);
  });

  it('a change that is not mute or deafen plays nothing', () => {
    assert.equal(muteCue(clear, clear), null);
  });
});

/** Feed the watch every tick from `from` to `to`, loud or not; true if it spoke up. */
function run(watch: MutedTalkWatch, from: number, to: number, loud: (at: number) => boolean, watching = true) {
  const fired: number[] = [];
  for (let at = from; at < to; at += WATCH_EVERY_MS) if (watch.feed(at, loud(at), watching)) fired.push(at);
  return fired;
}

describe('talking while muted', () => {
  it('speaks up after about a second of talking', () => {
    const watch = new MutedTalkWatch();
    run(watch, 0, 2000, () => false);
    const fired = run(watch, 2000, 4000, () => true);
    assert.equal(fired.length, 1);
    assert.ok(fired[0]! >= 2700 && fired[0]! <= 2900, `fired at ${fired[0]}`);
  });

  it('ignores a cough', () => {
    const watch = new MutedTalkWatch();
    run(watch, 0, 2000, () => false);
    assert.deepEqual(run(watch, 2000, 6000, (at) => at >= 3000 && at < 3300), []);
  });

  it('counts speech with pauses in it', () => {
    const watch = new MutedTalkWatch();
    run(watch, 0, 2000, () => false);
    // Loud two ticks in three, like words with gaps.
    const fired = run(watch, 2000, 4000, (at) => (at / WATCH_EVERY_MS) % 3 !== 0);
    assert.equal(fired.length, 1);
  });

  it('does not count the end of the sentence you muted in the middle of', () => {
    const watch = new MutedTalkWatch();
    assert.deepEqual(run(watch, 0, 1400, () => true), []);
  });

  it('says it once, then not again for twenty seconds', () => {
    const watch = new MutedTalkWatch();
    run(watch, 0, 2000, () => false);
    const fired = run(watch, 2000, 2000 + COOLDOWN_MS + 3000, () => true);
    assert.equal(fired.length, 2);
    assert.ok(fired[1]! - fired[0]! >= COOLDOWN_MS);
  });

  it('forgets everything when you unmute', () => {
    const watch = new MutedTalkWatch();
    run(watch, 0, 2000, () => false);
    run(watch, 2000, 2600, () => true);
    run(watch, 2600, 2700, () => true, false);
    // Muted again: the settle time starts over, and the old half-second does not count.
    assert.deepEqual(run(watch, 2700, 4200, () => true), []);
  });

  it('listens for speech, not room noise', () => {
    assert.equal(talkingLevel(-50), -42);
    assert.equal(talkingLevel(-30), -30);
  });
});

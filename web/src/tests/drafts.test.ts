import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isShortDraft } from '../lib/drafts';
import { channelDrafts as sharedChannelDrafts } from '../lib/drafts';

// A fresh store per test would be nicer, but the module only exports the two
// singletons the app uses, so each test picks its own id to avoid stepping
// on another test's draft.

describe('draft store', () => {
  it('has nothing for an id that was never set', () => {
    assert.equal(sharedChannelDrafts.get('never-touched'), '');
  });

  it('remembers text by id until it is cleared', () => {
    sharedChannelDrafts.set('channel-a', 'half a thought');
    assert.equal(sharedChannelDrafts.get('channel-a'), 'half a thought');
    sharedChannelDrafts.clear('channel-a');
    assert.equal(sharedChannelDrafts.get('channel-a'), '');
  });

  it('keeps drafts for different ids apart', () => {
    sharedChannelDrafts.set('channel-b', 'for b');
    sharedChannelDrafts.set('channel-c', 'for c');
    assert.equal(sharedChannelDrafts.get('channel-b'), 'for b');
    assert.equal(sharedChannelDrafts.get('channel-c'), 'for c');
  });

  it('treats setting an empty string as clearing it', () => {
    sharedChannelDrafts.set('channel-d', 'something');
    sharedChannelDrafts.set('channel-d', '');
    assert.equal(sharedChannelDrafts.get('channel-d'), '');
  });

  it('bumps its version on every set and clear, and not otherwise', () => {
    const before = sharedChannelDrafts.getVersion();
    sharedChannelDrafts.set('channel-e', 'x');
    const afterSet = sharedChannelDrafts.getVersion();
    assert.ok(afterSet > before);
    sharedChannelDrafts.clear('channel-e');
    assert.ok(sharedChannelDrafts.getVersion() > afterSet);
    // Clearing an id with nothing in it is a no-op, version included.
    const steady = sharedChannelDrafts.getVersion();
    sharedChannelDrafts.clear('channel-never-set');
    assert.equal(sharedChannelDrafts.getVersion(), steady);
  });

  it('notifies subscribers on a change and stops once unsubscribed', () => {
    let calls = 0;
    const unsubscribe = sharedChannelDrafts.subscribe(() => {
      calls += 1;
    });
    sharedChannelDrafts.set('channel-f', 'ping');
    assert.equal(calls, 1);
    unsubscribe();
    sharedChannelDrafts.set('channel-f', 'ping again');
    assert.equal(calls, 1);
  });
});

describe('isShortDraft', () => {
  it('is false for nothing, or only whitespace', () => {
    assert.equal(isShortDraft(''), false);
    assert.equal(isShortDraft('   \n  '), false);
  });

  it('is true for a line or two', () => {
    assert.equal(isShortDraft('be there at 8?'), true);
    assert.equal(isShortDraft('line one\nline two'), true);
  });

  it('is false past three lines', () => {
    assert.equal(isShortDraft('one\ntwo\nthree\nfour'), false);
  });

  it('is false past the character limit even on one line', () => {
    assert.equal(isShortDraft('x'.repeat(141)), false);
  });
});

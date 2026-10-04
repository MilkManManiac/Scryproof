/**
 * Click to watch. The failure this guards against is a stream that costs
 * bandwidth, or makes noise, before anyone asked for it: a share that starts
 * playing the moment somebody presses Share, with its sound, for people who
 * were only there to talk.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { screenGain, shouldSubscribe, streamState, type PublicationFacts } from '../lib/stream-watch';

const mic: PublicationFacts = { source: 'microphone', kind: 'audio' };
const camera: PublicationFacts = { source: 'camera', kind: 'video' };
const screen: PublicationFacts = { source: 'screen', kind: 'video' };
const screenSound: PublicationFacts = { source: 'screen-audio', kind: 'audio' };
const board: PublicationFacts = { source: 'other', kind: 'audio' };

const none = { camera: false, screen: false, cameraHidden: false };

describe('shouldSubscribe', () => {
  it('always fetches voices and the soundboard, watching or not', () => {
    assert.equal(shouldSubscribe(mic, none), true);
    assert.equal(shouldSubscribe(board, none), true);
    assert.equal(shouldSubscribe(mic, { camera: true, screen: true, cameraHidden: true }), true);
  });

  it('fetches no picture and no screen sound until Watch is pressed', () => {
    assert.equal(shouldSubscribe(camera, none), false);
    assert.equal(shouldSubscribe(screen, none), false);
    assert.equal(shouldSubscribe(screenSound, none), false);
  });

  it('watching a screen brings its picture and its sound, and not the same person\'s camera', () => {
    const watch = { ...none, screen: true };
    assert.equal(shouldSubscribe(screen, watch), true);
    assert.equal(shouldSubscribe(screenSound, watch), true);
    assert.equal(shouldSubscribe(camera, watch), false);
  });

  it('watching a camera brings the camera and not the screen', () => {
    const watch = { ...none, camera: true };
    assert.equal(shouldSubscribe(camera, watch), true);
    assert.equal(shouldSubscribe(screen, watch), false);
    assert.equal(shouldSubscribe(screenSound, watch), false);
  });

  it('a hidden camera stays unfetched even when watched', () => {
    assert.equal(shouldSubscribe(camera, { camera: true, screen: false, cameraHidden: true }), false);
  });

  it('hiding a camera does not touch that person\'s screen', () => {
    assert.equal(shouldSubscribe(screen, { camera: false, screen: true, cameraHidden: true }), true);
  });

  it('never fetches a picture published under the soundboard\'s source', () => {
    assert.equal(shouldSubscribe({ source: 'other', kind: 'video' }, { camera: true, screen: true, cameraHidden: false }), false);
  });
});

describe('streamState', () => {
  it('is a card until watched, loading until the picture arrives, then playing', () => {
    assert.equal(streamState({ watching: false, hasTrack: false }), 'waiting');
    assert.equal(streamState({ watching: true, hasTrack: false }), 'loading');
    assert.equal(streamState({ watching: true, hasTrack: true }), 'playing');
  });

  it('is still a card if a track is somehow there while not watched', () => {
    assert.equal(streamState({ watching: false, hasTrack: true }), 'waiting');
  });
});

describe('screenGain', () => {
  it('is silent until the sound is turned on, whatever the saved volume', () => {
    assert.equal(screenGain(1, false), 0);
    assert.equal(screenGain(2, false), 0);
  });

  it('follows the saved volume once it is on', () => {
    assert.equal(screenGain(0.4, true), 0.4);
    assert.equal(screenGain(1.5, true), 1.5);
  });
});


describe('mixer subscriptions', () => {
  it('listens to stream audio independently of video', () => {
    const listen = { ...none, screenSound: true };
    assert.equal(shouldSubscribe(screenSound, listen), true);
    assert.equal(shouldSubscribe(screen, listen), false);
    assert.equal(shouldSubscribe(camera, listen), false);
  });
  it('music requires its own consent even when watching or hearing the person’s screen', () => {
    const music: PublicationFacts = { source: 'music', kind: 'audio' };
    assert.equal(shouldSubscribe(music, { ...none, screen: true, screenSound: true }), false);
    assert.equal(shouldSubscribe(music, { ...none, music: true }), true);
    assert.equal(shouldSubscribe({ source: 'music', kind: 'video' }, { ...none, music: true }), false);
  });
});

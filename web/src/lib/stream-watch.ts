/**
 * What this device fetches from the call, and what it plays.
 *
 * Pure, and out here rather than inside the call session, so the rule is one
 * place to read and to test. The rule: voices are always fetched, and other
 * people's pictures (a camera, a screen, and the sound of a screen) are only
 * fetched after this viewer pressed Watch. Nothing subscribed costs no
 * bandwidth, so a share nobody here asked for costs this device nothing.
 *
 * It knows nothing about LiveKit. The session turns a publication into these
 * plain words and does whatever the answer says.
 */

export interface PublicationFacts {
  /** 'other' is the soundboard's track, and anything a client should not be sending. */
  source: 'microphone' | 'camera' | 'screen' | 'screen-audio' | 'other';
  kind: 'audio' | 'video';
}

/** What this viewer has chosen about one person, for now. */
export interface WatchFacts {
  camera: boolean;
  screen: boolean;
  /** The viewer used Hide on this person's camera. Hide wins over Watch. */
  cameraHidden: boolean;
}

/** Whether to be receiving this publication right now. */
export function shouldSubscribe(publication: PublicationFacts, watch: WatchFacts): boolean {
  switch (publication.source) {
    case 'microphone':
      return true;
    case 'camera':
      return watch.camera && !watch.cameraHidden;
    case 'screen':
    case 'screen-audio':
      return watch.screen;
    default:
      // The soundboard is sound. A picture under that source is somebody's
      // client misbehaving, and nobody asked to see it.
      return publication.kind === 'audio';
  }
}

/**
 * How a picture somebody else is sending shows up on a tile:
 *   waiting  not watched: the card with the Watch button, nothing fetched
 *   loading  Watch was pressed and the first frames have not arrived
 *   playing  the picture is here
 */
export type StreamState = 'waiting' | 'loading' | 'playing';

export function streamState(input: { watching: boolean; hasTrack: boolean }): StreamState {
  if (!input.watching) return 'waiting';
  return input.hasTrack ? 'playing' : 'loading';
}

/** The volume a screen's sound plays at: nothing until the viewer turned it on, then their saved level. */
export function screenGain(saved: number, soundOn: boolean): number {
  return soundOn ? saved : 0;
}

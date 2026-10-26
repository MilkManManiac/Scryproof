import { canShareSound, onMacApp, prepareScreenShare } from './desktop';
import { takeAppSound } from './app-sound';

/** Audio-only publication through the existing encrypted screen-audio grant.
 * Keeping it off Unknown also keeps older clients from auto-playing it as a soundboard.
 */
export const MUSIC_TRACK = 'scryproof-music';
export const musicSound = (userId: string): string => `${userId}:music`;

export async function captureMusic(): Promise<MediaStreamTrack> {
  if (onMacApp && !canShareSound)
    throw new Error('Music sharing needs macOS 14.2 or newer and the latest Scryproof app. You can still listen.');
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw new Error('This browser cannot share audio. You can still listen to other people.');
  // Capture requires video permission, but no video track is ever published.
  await prepareScreenShare();
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      restrictOwnAudio: true,
    } as MediaTrackConstraints,
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
  } as DisplayMediaStreamOptions);
  // A window chosen in the desktop app comes without sound: the shell records
  // that program alone and hands it over separately (app-sound.ts).
  let audio: MediaStreamTrack | null | undefined;
  try {
    audio = stream.getAudioTracks()[0] ?? (await takeAppSound());
  } catch (problem) {
    for (const track of stream.getTracks()) track.stop();
    throw problem;
  }
  for (const track of stream.getTracks()) if (track !== audio) track.stop();
  if (!audio)
    throw new Error(
      'No audio was shared. Choose a music tab or supported audio source and turn on Share audio in the picker.',
    );
  if (audio.readyState === 'ended') throw new Error('The audio source stopped. Choose another source.');
  audio.contentHint = 'music';
  return audio;
}

/** Audio-only publication through the existing encrypted screen-audio grant.
 * Keeping it off Unknown also keeps older clients from auto-playing it as a soundboard.
 */
export const MUSIC_TRACK = 'scryproof-music';
export const musicSound = (userId: string): string => `${userId}:music`;

export async function captureMusic(): Promise<MediaStreamTrack> {
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw new Error('This browser cannot share audio. You can still listen to other people.');
  // Capture requires video permission, but no video track is ever published.
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
  const [audio] = stream.getAudioTracks();
  for (const track of stream.getTracks()) if (track !== audio) track.stop();
  if (!audio)
    throw new Error(
      'No audio was shared. Choose a music tab or supported audio source and turn on Share audio in the picker.',
    );
  if (audio.readyState === 'ended') throw new Error('The audio source stopped. Choose another source.');
  audio.contentHint = 'music';
  return audio;
}

/**
 * Cutting a soundboard clip, the browser half: read a whole song, then turn
 * the chosen stretch into a small Ogg Opus file for upload. Only the clip
 * leaves this device; the song never does.
 *
 * Encoding uses WebCodecs' `AudioEncoder`, which Chromium (and so the desktop
 * app) has had since 2021. Where it is missing, a file that is already short
 * enough can still be added as it is (`uploadAsIs`).
 */

import { LIMITS, muxOggOpus } from '@scryproof/shared';

import type { Selection } from './sound-clip';
import { SoundFileError, prepareSound } from './sounds';
import { audioContext } from './voice-audio';

/** A song is a few megabytes; this is room for a long one without letting a film freeze the tab. */
export const SOURCE_BYTES = 50 * 1024 * 1024;
/** Decoded audio is about 23 MB a minute, so a song is fine and an album is not. */
export const SOURCE_SECONDS = 10 * 60;

/** Anything a browser can play. It is decoded and re-encoded here, so the server's short list does not apply. */
export const SOURCE_ACCEPT = 'audio/*,video/webm,video/mp4,.webm,.ogg,.oga,.opus,.mp3,.wav,.m4a,.aac,.flac,.mp4';

const RATE = 48000;
const BITRATE = 96000;
/** A few milliseconds of fade at each cut, so the clip does not start or stop with a click. */
const FADE_SECONDS = 0.008;

/** How long a file plays, from its header, before committing to decoding all of it. */
function probeLength(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const done = (value: number | null) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 10_000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** Decode a whole file, within the limits above. Throws `SoundFileError` with a sentence for the person. */
export async function readSource(file: File): Promise<AudioBuffer> {
  if (file.size > SOURCE_BYTES) {
    throw new SoundFileError(
      `That file is over ${Math.round(SOURCE_BYTES / 1024 / 1024)} MB. Pick a song, not a whole album.`,
    );
  }
  const probed = await probeLength(file);
  if (probed !== null && probed > SOURCE_SECONDS) {
    throw new SoundFileError(`That file is over ${SOURCE_SECONDS / 60} minutes long. Pick something shorter.`);
  }
  let buffer: AudioBuffer;
  try {
    buffer = await audioContext().decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new SoundFileError('This browser could not play that file, so it cannot be a sound.');
  }
  if (buffer.duration <= 0) throw new SoundFileError('That file has no sound in it.');
  if (buffer.duration > SOURCE_SECONDS) {
    throw new SoundFileError(`That file is over ${SOURCE_SECONDS / 60} minutes long. Pick something shorter.`);
  }
  return buffer;
}

/** The chosen stretch, resampled to 48 kHz, faded at both ends. */
async function render(source: AudioBuffer, selection: Selection): Promise<AudioBuffer> {
  const length = selection.end - selection.start;
  const channels = Math.min(2, source.numberOfChannels);
  const offline = new OfflineAudioContext(channels, Math.max(1, Math.round(length * RATE)), RATE);
  const player = offline.createBufferSource();
  player.buffer = source;
  const fade = offline.createGain();
  const edge = Math.min(FADE_SECONDS, length / 4);
  fade.gain.setValueAtTime(0, 0);
  fade.gain.linearRampToValueAtTime(1, edge);
  fade.gain.setValueAtTime(1, Math.max(edge, length - edge));
  fade.gain.linearRampToValueAtTime(0, length);
  player.connect(fade);
  fade.connect(offline.destination);
  player.start(0, selection.start, length);
  return offline.startRendering();
}

const opusConfig = (channels: number): AudioEncoderConfig => ({
  codec: 'opus',
  sampleRate: RATE,
  numberOfChannels: channels,
  bitrate: BITRATE,
});

/** Whether this browser can cut a clip at all. */
export async function canCut(): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return false;
  try {
    return (await AudioEncoder.isConfigSupported(opusConfig(2))).supported === true;
  } catch {
    return false;
  }
}

/** The lookahead an encoder reports in its Opus header, or the usual one for libopus. */
function preSkipFrom(description: AllowSharedBufferSource | undefined): number {
  if (!description) return 312;
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  const head = new TextDecoder().decode(bytes.slice(0, 8));
  if (head !== 'OpusHead' || bytes.length < 12) return 312;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, true);
}

/** Encode the chosen stretch as Ogg Opus, named for the upload. */
export async function cutClip(source: AudioBuffer, selection: Selection, name: string): Promise<File> {
  const audio = await render(source, selection);
  const channels = audio.numberOfChannels;
  const packets: { data: Uint8Array; samples: number }[] = [];
  let preSkip = 312;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      if (metadata?.decoderConfig?.description) preSkip = preSkipFrom(metadata.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const samples = chunk.duration ? Math.round((chunk.duration * RATE) / 1_000_000) : 960;
      packets.push({ data, samples });
    },
    error: (problem) => {
      failure = problem;
    },
  });
  encoder.configure(opusConfig(channels));

  // Handed over a second at a time, planar, the way the encoder takes it.
  const step = RATE;
  for (let from = 0; from < audio.length; from += step) {
    const frames = Math.min(step, audio.length - from);
    const planes = new Float32Array(frames * channels);
    for (let channel = 0; channel < channels; channel += 1) {
      planes.set(audio.getChannelData(channel).subarray(from, from + frames), channel * frames);
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: RATE,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((from / RATE) * 1_000_000),
      data: planes,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (failure || packets.length === 0) throw new SoundFileError('This browser could not cut that clip.');

  const bytes = muxOggOpus({ channels, preSkip, inputRate: RATE, packets, totalSamples: audio.length });
  if (bytes.length > LIMITS.soundBytes) throw new SoundFileError('That clip came out too big to upload.');
  const base =
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .slice(0, 40) || 'sound';
  return new File([bytes], `${base}.ogg`, { type: 'audio/ogg' });
}

/**
 * For a browser that cannot cut: the file as it is, if the whole of it is
 * selected and it already passes as a sound. Otherwise says why not.
 */
export async function uploadAsIs(file: File, source: AudioBuffer, selection: Selection): Promise<File> {
  const whole = selection.start <= 0.05 && selection.end >= source.duration - 0.05;
  if (!whole) {
    throw new SoundFileError(
      'This browser cannot cut a clip out of a longer file. Use the Scryproof desktop app or Chrome, or pick a file that is already the clip you want.',
    );
  }
  return prepareSound(file);
}

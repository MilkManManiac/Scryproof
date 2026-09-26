/**
 * One voice call, from this device's side.
 *
 * Three things have to line up for a call to work, and this file is where they
 * meet:
 *
 *   - the gateway, which says who is in the channel and relays sealed messages;
 *   - `voice-crypto.ts`, which decides whose keys to trust and makes ours;
 *   - LiveKit, which moves the audio and encrypts each frame with those keys.
 *
 * Encryption is not an option here. The room is created with E2EE on and there
 * is no code path that connects without it (non-negotiable 2). If a browser
 * cannot do it, it is refused with an explanation before anything connects.
 *
 * On every membership event, in order:
 *   1. forget anyone who is no longer in the channel
 *   2. rotate: new epoch, brand new media key, everyone else's keys dropped
 *   3. give LiveKit our new key
 *   4. announce ourselves, and send the new key to everyone we already trust
 * and whenever somebody's announcement arrives, check it and send them a key.
 *
 * The snapshot this publishes is what the connection panel draws. It never
 * contains a number that was not measured: before there are stats, the fields
 * are null and the panel prints a dash.
 */

import {
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  TrackEvent,
  VideoQuality,
  type LocalAudioTrack,
  type Participant as LiveKitParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import E2EEWorker from 'livekit-client/e2ee-worker?worker';

import type { VoiceMembership, VoiceSignal } from '@scryproof/shared';

import { api, ApiError } from './api';
import { holdPushKey } from './desktop';
import { noteFrames, stalledSeconds, type FrameWatch } from './frame-watch';
import { loadSound, soundGain } from './sounds';
import { HOLD_MS, MicGate, OutputMix, audioContext, sounds, withHold } from './voice-audio';
import { MicProcessor, isVoiceEffect, needsProcessor, type MicChoice } from './voice-effects';
import { cameraEncoding, cameraOptions, captureOptions, screenShareOptions, usesModel, voicePrefs, type VoicePrefs } from './voice-prefs';
import {
  VoiceCall,
  announce,
  createCallKeypair,
  createDeviceIdentity,
  type Announcement,
  type PinVerdict,
  type WrappedKey,
} from './voice-crypto';
import { IndexedDbIdentityStore, letInEverywhere, loadDeviceIdentity } from './voice-identity';
import { ScryproofKeyProvider, voiceSupport } from './voice-key-provider';

/** LiveKit keeps a ring of this many keys per participant, addressed by index. */
const KEYRING_SIZE = 16;
/** The name the soundboard's track is published under. Receivers go by its source, not this. */
const SOUNDBOARD_TRACK = 'soundboard';
const STATS_INTERVAL_MS = 2000;

export type VoicePhase = 'idle' | 'connecting' | 'connected' | 'failed';

export interface VoicePerson {
  userId: string;
  deviceId: string;
  fingerprint: string;
  /**
   * secured:  we hold their key and they have been sent ours
   * waiting:  in the call, key not arrived yet; cannot be heard
   * held:     identity needs approving; no keys move in either direction
   */
  state: 'secured' | 'waiting' | 'held';
  verdict: PinVerdict;
}

/** A picture somebody in the call is sending: their camera, or their screen. */
export interface VoiceVideo {
  userId: string;
  source: 'camera' | 'screen';
  /** Changes when the underlying track does, so the screen knows to re-attach. */
  sid: string;
  /** A screen that carries sound, so its volume slider has something to turn. Always false for a camera. */
  sound: boolean;
}

/** Why this device's own screen share ended without Stop being pressed, and when. */
export interface ShareStop {
  reason: string;
  at: number;
}

export interface VoiceStats {
  rttMs: number | null;
  jitterMs: number | null;
  lossPercent: number | null;
  codec: string | null;
  /** The codec of the pictures coming in, if any are. */
  videoCodec: string | null;
  /** True when media is going through the TURN relay rather than direct. */
  relayed: boolean | null;
  /** The largest picture arriving right now, as "1280x720". Null while none is. */
  receiving: string | null;
}

/**
 * Where a call is: a server's voice channel, or a direct message
 * conversation. Only the token and the labels differ; the key agreement and
 * the media are the same for both, keyed by the id.
 */
export type CallPlace = { kind: 'channel'; id: string } | { kind: 'dm'; id: string };

export interface VoiceSnapshot {
  phase: VoicePhase;
  /** The voice channel this call is in. Null for a call in a conversation. */
  channelId: string | null;
  /** The conversation this call is in. Null for a call in a server. */
  dmId: string | null;
  error: string | null;
  /** True when the error's remedy is the desktop app, so its download link belongs under the words. */
  installer: boolean;
  /** True only when LiveKit reports E2EE on and our own key is in place. */
  encrypted: boolean;
  epoch: number;
  /** The number to read aloud. Null until it has been computed for this membership. */
  code: string | null;
  people: VoicePerson[];
  /** Announcements that failed their signature check. Shown, because it should never happen. */
  rejected: number;
  speaking: string[];
  /** False while the gate (threshold or push-to-talk) is holding the microphone shut. */
  transmitting: boolean;
  /** Whether this device is sending its camera, and its screen. Read off LiveKit, never assumed. */
  camera: boolean;
  sharing: boolean;
  videos: VoiceVideo[];
  /** Why the camera or screen share did not start, in words. */
  mediaError: string | null;
  /** One line for the voice panel when our share stopped on its own. Cleared by the next share. */
  shareNotice: string | null;
  /** The last time our share stopped on its own, kept for the connection panel for the rest of the call. */
  lastShareStop: ShareStop | null;
  /**
   * Screens we are watching that have decoded no new frame for a while, as
   * "<userId>:screen" to whole seconds. Absent while the picture is moving.
   */
  stalled: Record<string, number>;
  /** People whose camera is on but not being fetched, because this device asked to hide it. */
  hiddenCameras: string[];
  stats: VoiceStats;
  can: { speak: boolean; video: boolean; screenShare: boolean };
  /** True once the soundboard's track is published, so a click will be heard by the room. */
  soundboard: boolean;
}

const EMPTY_STATS: VoiceStats = {
  rttMs: null,
  jitterMs: null,
  lossPercent: null,
  codec: null,
  videoCodec: null,
  relayed: null,
  receiving: null,
};

const IDLE: VoiceSnapshot = {
  phase: 'idle',
  channelId: null,
  dmId: null,
  error: null,
  installer: false,
  encrypted: false,
  epoch: 0,
  code: null,
  people: [],
  rejected: 0,
  speaking: [],
  transmitting: false,
  camera: false,
  sharing: false,
  videos: [],
  mediaError: null,
  shareNotice: null,
  lastShareStop: null,
  stalled: {},
  hiddenCameras: [],
  stats: EMPTY_STATS,
  can: { speak: false, video: false, screenShare: false },
  soundboard: false,
};

type SendSignal = (signal: VoiceSignal & { to?: string }) => void;

function isAnnouncement(value: Record<string, unknown>): value is Record<string, unknown> & Announcement {
  return ['userId', 'deviceId', 'identityKey', 'callKey', 'signature'].every(
    (field) => typeof value[field] === 'string',
  );
}

function isWrappedKey(value: Record<string, unknown>): value is Record<string, unknown> & WrappedKey {
  return (
    typeof value.epoch === 'number' &&
    ['senderId', 'senderDeviceId', 'recipientId', 'recipientDeviceId', 'iv', 'ciphertext'].every(
      (field) => typeof value[field] === 'string',
    )
  );
}

/**
 * A shared screen's sound is mixed separately from the same person's
 * microphone, and so is their soundboard. Each is its own entry in the mix.
 * The soundboard follows the person's volume slider; the screen has a slider
 * of its own, saved under this same key, because a loud game and a quiet
 * friend want opposite things. The soundboard is the only thing published
 * with an unknown source, since the voice token grants that source for
 * nothing else.
 */
export const screenSound = (userId: string): string => `${userId}:screen`;
const boardSound = (userId: string): string => `${userId}:soundboard`;
const mixKey = (userId: string, source: Track.Source): string =>
  source === Track.Source.ScreenShareAudio
    ? screenSound(userId)
    : source === Track.Source.Unknown
      ? boardSound(userId)
      : userId;
/** The saved volume for one entry in the mix: the screen's own, or the person's. */
const savedVolume = (prefs: VoicePrefs, userId: string, source: Track.Source): number => {
  if (source === Track.Source.ScreenShareAudio) return prefs.volumes[screenSound(userId)] ?? 1;
  const volume = prefs.volumes[userId] ?? 1;
  // The soundboard arrives under the "unknown" source (see TrackSubscribed).
  return source === Track.Source.Unknown ? volume * prefs.soundboardVolume : volume;
};

/**
 * The soundboard's outgoing side. Clips are played into `destination`, whose
 * track is published once for the whole call and is silent between clips.
 * `local` carries the same clip to this device's speakers, so you hear what
 * you played at the volume you hear everyone else.
 */
interface Soundboard {
  destination: MediaStreamAudioDestinationNode;
  track: MediaStreamTrack;
  local: GainNode;
  playing: AudioBufferSourceNode | null;
}

function describeCaptureProblem(problem: unknown, what: 'camera' | 'screen'): string {
  const name = problem instanceof Error ? problem.name : '';
  if (what === 'camera') {
    if (name === 'NotAllowedError') return 'The browser is not allowed to use the camera. Check the icon in the address bar.';
    if (name === 'NotFoundError') return 'No camera was found.';
    if (name === 'NotReadableError') return 'The camera is in use by another program.';
    return 'The camera could not be started.';
  }
  const detail = problem instanceof Error && problem.message ? `: ${problem.message}` : '.';
  return `The screen share could not be started${detail}`;
}

/** One inbound picture's counters from a stats report, or null when it has none yet. */
function inboundVideo(report: RTCStatsReport): { frames: number; width: number; packets: number } | null {
  let found: { frames: number; width: number; packets: number } | null = null;
  report.forEach((entry: Record<string, unknown>) => {
    if (entry.type !== 'inbound-rtp') return;
    found = {
      frames: typeof entry.framesDecoded === 'number' ? entry.framesDecoded : 0,
      width: typeof entry.frameWidth === 'number' ? entry.frameWidth : 0,
      packets: typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0,
    };
  });
  return found;
}

export class VoiceSession {
  private snapshot: VoiceSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();

  private call: VoiceCall | null = null;
  private myAnnouncement: Announcement | null = null;
  private room: Room | null = null;
  private keyProvider: ScryproofKeyProvider | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private mix: OutputMix | null = null;
  private ears: ReturnType<typeof setInterval> | null = null;
  private serverSpeakers: string[] = [];
  private gate: MicGate | null = null;
  /** The hold-until clock for our own ring, kept apart from the mix's per-person ones. */
  private selfLoudUntil = 0;
  private board: Soundboard | null = null;
  /**
   * A moderator's mute, which silences the soundboard as well as the
   * microphone. Not reset on leave: the gateway reports it again on the next
   * join, and until then the safe answer is the last one it gave.
   */
  private serverMuted = false;
  private prefs: VoicePrefs = voicePrefs.get();
  private stopWatching: (() => void) | null = null;
  /** Stops the shell's system-wide key watch, when one is running. */
  private globalHold: (() => void) | null = null;
  /** Voice changer switches, one at a time, so two quick clicks cannot race each other onto the track. */
  private effectWork: Promise<void> = Promise.resolve();

  private members: string[] = [];
  /** Seats we have sent this epoch's key to, so an announcement does not trigger a second copy. */
  private readonly keySentTo = new Set<string>();
  private rejected = 0;
  private deafened = false;
  /** Guards against a slow join finishing after the user has already left. */
  private generation = 0;
  /** A membership event that arrived before the call state was ready. */
  private pendingMembership: VoiceMembership | null = null;
  private previousLoss: { lost: number; received: number } | null = null;
  /** Decoded-frame counts of the screens we are watching, by track sid. Fed by `measure`. */
  private frameWatch = new Map<string, FrameWatch>();
  /** Cameras this device has asked not to fetch, by user id. Until undone or the call ends. */
  private readonly hiddenCameras = new Set<string>();
  /** True while our own Stop is taking the share down, so that is not reported as the share dying. */
  private stoppingShare = false;
  /** Set when the screen track itself ended (the window closed, the browser's own Stop bar). */
  private shareEnded: string | null = null;

  constructor(
    /** Read when needed: the session outlives sign-in, so the id is not known at construction. */
    private readonly whoAmI: () => string,
    private readonly send: SendSignal,
  ) {}

  private get userId(): string {
    return this.whoAmI();
  }

  /** The id the gateway knows this call by: its channel, or its conversation. */
  private get roomId(): string | null {
    return this.snapshot.channelId ?? this.snapshot.dmId;
  }

  /* ------------------------------- observing ------------------------------ */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): VoiceSnapshot => this.snapshot;

  private update(patch: Partial<VoiceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /**
   * The gateway refused the join (no CONNECT, or timed out). Nothing media-side
   * has started yet, so there is nothing to tear down: just say why.
   */
  fail(message: string): void {
    if (this.snapshot.phase !== 'connecting') return;
    this.generation += 1;
    this.update({ phase: 'failed', error: message });
  }

  /* -------------------------------- joining ------------------------------- */

  /**
   * Prepare keys, then call `enterChannel` (which tells the gateway we have
   * joined), then connect media. The order matters: the gateway answers a join
   * with a membership event straight away, and the call state has to exist to
   * receive it.
   */
  async join(place: CallPlace, enterChannel: () => void): Promise<void> {
    await this.leave();
    const generation = (this.generation += 1);
    const stale = () => generation !== this.generation;
    const roomId = place.id;

    this.update({
      ...IDLE,
      phase: 'connecting',
      channelId: place.kind === 'channel' ? place.id : null,
      dmId: place.kind === 'dm' ? place.id : null,
    });

    const support = voiceSupport();
    if (!support.ok) {
      this.update({
        phase: 'failed',
        error: support.reason ?? 'This browser cannot join encrypted calls.',
        installer: support.installer === true,
      });
      return;
    }

    try {
      const identity = await loadDeviceIdentity(createDeviceIdentity);
      const callKeys = await createCallKeypair();
      if (stale()) return;

      this.call = new VoiceCall({
        callId: roomId,
        userId: this.userId,
        identity,
        callKeys,
        pins: new IndexedDbIdentityStore(),
      });
      this.myAnnouncement = await announce(roomId, this.userId, identity, callKeys);
      await this.call.admit([this.myAnnouncement]);

      this.keyProvider = new ScryproofKeyProvider();
      const room = new Room({
        encryption: { keyProvider: this.keyProvider, worker: new E2EEWorker() },
        // Only fetch the picture sizes somebody is actually looking at, and
        // only send the sizes somebody is fetching.
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: captureOptions(voicePrefs.get()),
        videoCaptureDefaults: cameraOptions(voicePrefs.get()),
        // A shared game at 15 frames a second is a slideshow. VP9 over VP8:
        // the same upload buys a noticeably sharper picture, and every browser
        // this app runs in decodes it. VP8 stays as the fallback for one that
        // cannot.
        publishDefaults: {
          videoCodec: 'vp9',
          backupCodec: { codec: 'vp8' },
          screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
          videoEncoding: cameraEncoding(voicePrefs.get()),
        },
      });
      this.room = room;
      this.listenTo(room);
      await room.setE2EEEnabled(true);
      if (stale()) return;

      enterChannel();
      if (this.pendingMembership) {
        const pending = this.pendingMembership;
        this.pendingMembership = null;
        await this.onMembership(pending);
      }

      // The only step that knows what kind of place this is. Each route
      // decides on the server what this person may do there.
      const grant = place.kind === 'channel' ? await api.voice.token(place.id) : await api.voice.dmToken(place.id);
      if (stale()) return;
      this.update({ can: grant.can });

      await room.connect(grant.url, grant.token);
      if (stale()) return;

      if (grant.can.speak) await this.publishMicrophone(room);
      if (stale()) return;
      if (grant.can.speak) await this.openSoundboard(room);
      if (stale()) return;
      this.rebuildGate();
      this.watchPrefs();
      // Our own ring needs no one else's track to start: it is driven by the
      // local microphone meter from the moment the call is up.
      this.ears = setInterval(() => this.refreshSpeaking(), 100);

      this.update({ phase: 'connected', encrypted: room.isE2EEEnabled });
      if (voicePrefs.get().sounds) sounds.joined();
      this.statsTimer = setInterval(() => void this.measure(), STATS_INTERVAL_MS);
    } catch (problem) {
      if (stale()) return;
      const message =
        problem instanceof ApiError
          ? problem.message
          : problem instanceof Error
            ? problem.message
            : 'Could not join the call.';
      this.update({ phase: 'failed', error: message });
    }
  }

  async leave(): Promise<void> {
    this.generation += 1;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;

    const room = this.room;
    this.room = null;
    this.call = null;
    this.myAnnouncement = null;
    this.keyProvider = null;
    this.members = [];
    this.keySentTo.clear();
    this.rejected = 0;
    this.pendingMembership = null;
    this.previousLoss = null;
    this.frameWatch = new Map();
    this.hiddenCameras.clear();
    this.stoppingShare = false;
    this.shareEnded = null;
    this.stopWatching?.();
    this.stopWatching = null;
    this.gate?.close();
    this.gate = null;
    this.closeSoundboard();
    this.mix?.close();
    this.mix = null;
    if (this.ears) clearInterval(this.ears);
    this.ears = null;
    this.serverSpeakers = [];
    this.selfLoudUntil = 0;

    if (room && this.snapshot.phase === 'connected' && voicePrefs.get().sounds) sounds.left();
    if (room) await room.disconnect().catch(() => undefined);
    if (this.snapshot.phase !== 'idle') this.update(IDLE);
  }

  /* ---------------------------- mute and deafen --------------------------- */

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room || !this.snapshot.can.speak) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted).catch(() => undefined);
    // Unmuting can hand back a different underlying track; the gate follows it.
    if (!muted) this.rebuildGate();
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    this.mix?.setDeafened(deafened);
    this.tuneSoundboard();
  }

  /* ------------------------------- soundboard ------------------------------ */

  /**
   * Publish the soundboard's track: the output of a Web Audio node, silent
   * until a clip is played into it. It goes through the same encrypted room as
   * the microphone, so LiveKit encrypts it with this person's key like every
   * other track, and nobody's side needs anything new to decrypt it.
   *
   * It is a separate track on purpose. The gate and push-to-talk switch the
   * microphone track's `enabled` flag, and mute turns the microphone off;
   * neither reaches this one, so a clip is heard whether or not you are
   * talking. If publishing fails, the call carries on without a soundboard.
   */
  private async openSoundboard(room: Room): Promise<void> {
    const context = audioContext();
    const destination = context.createMediaStreamDestination();
    const [track] = destination.stream.getAudioTracks();
    if (!track) return;
    try {
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Unknown,
        name: SOUNDBOARD_TRACK,
        // Silence between clips costs next to nothing on the wire this way.
        dtx: true,
      });
    } catch {
      track.stop();
      return;
    }
    if (this.room !== room) {
      track.stop();
      return;
    }
    const local = context.createGain();
    local.connect(context.destination);
    this.board = { destination, track, local, playing: null };
    this.tuneSoundboard();
    this.update({ soundboard: true });
  }

  private closeSoundboard(): void {
    const board = this.board;
    this.board = null;
    if (!board) return;
    board.playing?.stop();
    board.local.disconnect();
    board.track.stop();
  }

  /** What you hear of your own clips follows your output and soundboard volumes, and deafen. */
  private tuneSoundboard(): void {
    const prefs = voicePrefs.get();
    if (this.board) this.board.local.gain.value = this.deafened ? 0 : prefs.outputVolume * prefs.soundboardVolume;
  }

  setServerMuted(muted: boolean): void {
    this.serverMuted = muted;
    if (muted) this.board?.playing?.stop();
  }

  /**
   * Play one clip into the call, and on this device. A second click cuts off
   * the first rather than stacking on it, so one person cannot build a wall
   * of sound. When nothing was played, says why in words.
   *
   * `volume` is the sound's own, in percent, set by whoever added it. It is
   * applied here, before the clip goes into the call, so everyone hears it at
   * that level; each listener's soundboard slider then turns it down for them.
   */
  async playSound(url: string, volume = 100): Promise<{ ok: true } | { ok: false; reason: string }> {
    const muted = { ok: false as const, reason: 'A moderator has muted you, and that includes the soundboard.' };
    const board = this.board;
    if (!board) return { ok: false, reason: 'The soundboard is not ready in this call.' };
    if (this.serverMuted) return muted;
    let buffer: AudioBuffer;
    try {
      buffer = await loadSound(url);
    } catch {
      return { ok: false, reason: 'That sound could not be loaded.' };
    }
    // Fetching and decoding take a moment, in which the call can end or a
    // moderator can step in.
    if (this.board !== board) return { ok: false, reason: 'The call ended.' };
    if (this.serverMuted) return muted;

    board.playing?.stop();
    const context = audioContext();
    const source = context.createBufferSource();
    source.buffer = buffer;
    const level = context.createGain();
    level.gain.value = soundGain(volume);
    source.connect(level);
    level.connect(board.destination);
    level.connect(board.local);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
      if (board.playing === source) board.playing = null;
    };
    board.playing = source;
    source.start();
    return { ok: true };
  }

  /* --------------------------- camera and screen --------------------------- */

  /**
   * Both of these go through the same encrypted room as the microphone. The
   * worker encrypts every frame of every track with the same per-person key,
   * so there is no separate switch for video and nothing to forget to turn on.
   */
  async setCamera(on: boolean): Promise<void> {
    const room = this.room;
    if (!room || !this.snapshot.can.video) return;
    this.update({ mediaError: null });
    try {
      await room.localParticipant.setCameraEnabled(on, cameraOptions(voicePrefs.get()), {
        videoEncoding: cameraEncoding(voicePrefs.get()),
      });
    } catch (problem) {
      this.update({ mediaError: describeCaptureProblem(problem, 'camera') });
    }
    if (this.room === room) this.refreshVideos();
  }

  async setScreenShare(on: boolean): Promise<void> {
    const room = this.room;
    if (!room || !this.snapshot.can.screenShare) return;
    this.update(on ? { mediaError: null, shareNotice: null } : { mediaError: null });
    const quality = screenShareOptions(voicePrefs.get());
    this.stoppingShare = !on;
    try {
      await room.localParticipant.setScreenShareEnabled(
        on,
        {
          // Game sound, untouched: the voice clean-up would mangle it. Where the
          // browser can, leave this call's own voices out of what is captured,
          // or everyone hears themselves come back. Asking for sound is what
          // puts the sound checkbox in Chrome's picker; the person ticks it or
          // not. The desktop app has its own switch in its picker, off until
          // turned on, and this restriction does not reach it
          // (desktop/src/share-menu.js, components/SharePicker.tsx).
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },
          systemAudio: 'include',
          resolution: quality.resolution,
          contentHint: 'motion',
          selfBrowserSurface: 'exclude',
        },
        {
          screenShareEncoding: quality.encoding,
          // VP8, not the VP9 the cameras use: Chrome cannot encode a VP9 screen
          // share in more than one size, and LiveKit 1.13.6 (ours) will not
          // take VP9 as rid simulcast either. Two VP8 sizes let a watcher on a
          // bad line ask for the small one. A LiveKit newer than 1.13.6 lifts
          // this and VP9 could come back here.
          videoCodec: 'vp8',
          simulcast: true,
        },
      );
    } catch (problem) {
      // Closing the picker without choosing is not an error worth a message.
      const cancelled = problem instanceof Error && problem.name === 'NotAllowedError';
      if (!cancelled) {
        const message = describeCaptureProblem(problem, 'screen');
        this.update({ mediaError: message, ...(on ? { lastShareStop: { reason: message, at: Date.now() } } : {}) });
      }
    } finally {
      this.stoppingShare = false;
    }
    if (this.room === room) this.refreshVideos();
  }

  /** Our share ended without Stop being pressed: say so now, and keep it for the connection panel. */
  private noteShareStop(reason: string): void {
    const line = `Your share stopped: ${reason}.`;
    this.update({ shareNotice: line, lastShareStop: { reason: line, at: Date.now() } });
  }

  /**
   * Stop fetching one person's camera, or start again. Only this device
   * changes: they keep sending, and everyone else keeps seeing them. Saves
   * the bandwidth of a picture nobody here wants.
   */
  setCameraHidden(userId: string, hidden: boolean): void {
    if (hidden) this.hiddenCameras.add(userId);
    else this.hiddenCameras.delete(userId);
    this.room?.remoteParticipants.get(userId)?.getTrackPublication(Track.Source.Camera)?.setSubscribed(!hidden);
    this.refreshVideos();
  }

  /** Show one person's camera or screen in a <video>. Returns the undo. */
  attachVideo(userId: string, source: VoiceVideo['source'], element: HTMLVideoElement): () => void {
    const room = this.room;
    const participant = userId === this.userId ? room?.localParticipant : room?.remoteParticipants.get(userId);
    const track = participant?.getTrackPublication(
      source === 'screen' ? Track.Source.ScreenShare : Track.Source.Camera,
    )?.track;
    if (!track) return () => undefined;
    track.attach(element);
    return () => void track.detach(element);
  }

  /**
   * What your own camera is doing, in its own words: what was asked of it,
   * what it is giving, and the most it says it can do. When the picture is
   * slower than asked, this says whether the camera cannot, or will not in
   * this light (cameras slow their shutter in a dim room).
   */
  cameraReport(): string | null {
    const track = this.room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
    if (!track) return null;
    const asked = cameraOptions(voicePrefs.get()).resolution;
    const giving = track.getSettings();
    const can = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    const fps = giving.frameRate ? Math.round(giving.frameRate) : null;
    const parts = [`asked for ${asked.height}p at ${asked.frameRate}`];
    if (giving.height && fps !== null) parts.push(`camera is giving ${giving.height}p at ${fps}`);
    if (can.frameRate?.max) parts.push(`it says it can do up to ${Math.round(can.frameRate.max)} fps`);
    if (fps !== null && fps < asked.frameRate && (!can.frameRate?.max || can.frameRate.max >= asked.frameRate)) {
      parts.push('slower than it could be usually means the room is too dark for it');
    }
    return parts.join('; ');
  }

  private refreshVideos(): void {
    const room = this.room;
    if (!room) return;
    const videos: VoiceVideo[] = [];
    const hiddenCameras: string[] = [];
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      for (const publication of participant.trackPublications.values()) {
        if (
          publication.source === Track.Source.Camera &&
          participant !== room.localParticipant &&
          this.hiddenCameras.has(participant.identity) &&
          !publication.isMuted
        ) {
          hiddenCameras.push(participant.identity);
        }
        if (publication.kind !== Track.Kind.Video || !publication.track || publication.isMuted) continue;
        const source =
          publication.source === Track.Source.ScreenShare
            ? 'screen'
            : publication.source === Track.Source.Camera
              ? 'camera'
              : null;
        if (!source) continue;
        const sound = source === 'screen' && Boolean(participant.getTrackPublication(Track.Source.ScreenShareAudio)?.track);
        videos.push({ userId: participant.identity, source, sid: publication.trackSid, sound });
      }
    }
    this.update({
      videos,
      hiddenCameras,
      camera: room.localParticipant.isCameraEnabled,
      sharing: room.localParticipant.isScreenShareEnabled,
    });
  }

  /** The microphone's level right now in dBFS, before the gate. -100 when there is no microphone. */
  micLevel(): number {
    return this.gate?.level ?? -100;
  }

  /* ------------------------ microphone gate and settings ------------------- */

  private micTrack(): LocalAudioTrack | undefined {
    return this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack as
      | LocalAudioTrack
      | undefined;
  }

  private rebuildGate(): void {
    this.gate?.close();
    this.gate = null;
    const track = this.micTrack();
    // With the noise model or a voice changer on, what is sent is their
    // output and the gate flips that; it listens to the raw microphone
    // underneath.
    const sent = track?.mediaStreamTrack;
    const processor = track?.getProcessor();
    const heard = processor instanceof MicProcessor && processor.microphone ? processor.microphone : sent;
    if (!track || !sent || !heard) {
      this.update({ transmitting: false });
      return;
    }
    // Closing a gate switches its track back on. When a voice changer has just
    // been put in front, that track is the raw microphone, whose flag is also
    // where LiveKit keeps mute; if we are muted, it has to stay off.
    if (track.isMuted) heard.enabled = false;
    this.gate = new MicGate(
      sent,
      () => ({ mode: voicePrefs.get().inputMode, thresholdDb: voicePrefs.get().thresholdDb, muted: track.isMuted }),
      () => this.update({ transmitting: this.gate?.open ?? false }),
      heard,
    );
    this.update({ transmitting: this.gate.open });
  }

  /* ------------------- the noise model and voice changers ------------------- */

  private micChoice(): MicChoice {
    const prefs = voicePrefs.get();
    return {
      suppress: usesModel(prefs),
      guard: prefs.loudnessGuard,
      effect: isVoiceEffect(prefs.voiceEffect) ? prefs.voiceEffect : 'none',
    };
  }

  /**
   * Opens the microphone and publishes it. With the noise model or a voice
   * changer chosen, they go on before the track is published rather than
   * after, so not one frame of the raw room or the unchanged voice is sent.
   * It is still the microphone as far as LiveKit and everyone else can tell:
   * same source, same one track.
   */
  private async publishMicrophone(room: Room): Promise<void> {
    const choice = this.micChoice();
    if (!needsProcessor(choice)) {
      await room.localParticipant.setMicrophoneEnabled(true);
      return;
    }
    const [track] = await room.localParticipant.createTracks({ audio: captureOptions(voicePrefs.get()) });
    if (!track || track.kind !== Track.Kind.Audio) throw new Error('The microphone could not be opened.');
    const microphone = track as LocalAudioTrack;
    const context = audioContext();
    const processor = new MicProcessor(choice, context);
    try {
      microphone.setAudioContext(context);
      await microphone.setProcessor(processor);
    } catch {
      // The changer could not be built (the pitch shifter did not load). A
      // call where nobody can hear you is worse than your own voice, so the
      // plain microphone goes out. The settings preview builds the same
      // chain and says so in words when it cannot.
      await processor.destroy();
    }
    await this.fallBackIfModelFailed(microphone);
    try {
      await room.localParticipant.publishTrack(microphone, { source: Track.Source.Microphone });
    } catch (problem) {
      // We opened this microphone ourselves, so nobody else will close it.
      microphone.stop();
      throw problem;
    }
  }

  /**
   * The browser's suppression was left off because the model was going to
   * do the job. If the model did not start, the browser's goes back on, so
   * Strong never quietly means none.
   */
  private async fallBackIfModelFailed(track: LocalAudioTrack): Promise<void> {
    const prefs = voicePrefs.get();
    if (!usesModel(prefs)) return;
    const processor = track.getProcessor();
    if (processor instanceof MicProcessor && processor.suppressing) return;
    await track.restartTrack({ ...captureOptions(prefs), noiseSuppression: true }).catch(() => undefined);
  }

  private applyMicChoice(): Promise<void> {
    this.effectWork = this.effectWork.then(() => this.switchMicChoice()).catch(() => undefined);
    return this.effectWork;
  }

  /**
   * A change of model or voice mid-call. With a processor already in front
   * only its middle is rebuilt; putting one in or taking it out swaps the
   * track on the existing sender. Either way it is the same publication with
   * the same encryption, and nobody sees the call change.
   */
  private async switchMicChoice(): Promise<void> {
    const track = this.micTrack();
    if (!track) return;
    const choice = this.micChoice();
    const processor = track.getProcessor();
    const current = processor instanceof MicProcessor ? processor : null;

    if (current && needsProcessor(choice)) {
      await current.set(choice);
    } else if (current) {
      await track.stopProcessor();
      this.rebuildGate();
    } else if (needsProcessor(choice)) {
      const context = audioContext();
      track.setAudioContext(context);
      await track.setProcessor(new MicProcessor(choice, context));
      this.rebuildGate();
    }
    await this.fallBackIfModelFailed(track);
  }

  /**
   * Settings apply to a call in progress. Each kind of change does the least
   * it can: a volume is one number, a new microphone restarts one track, and
   * nothing here ever reconnects the call or touches a key.
   */
  private watchPrefs(): void {
    this.stopWatching?.();
    this.prefs = voicePrefs.get();

    // In the desktop app the shell hears the key even with a game in front;
    // then the window's own events are not needed and would only disagree
    // (a blur while the key is held is not a release). Anywhere else, the
    // window is all there is, and losing focus is treated as letting go.
    const onKey = (event: KeyboardEvent) => {
      if (this.globalHold) return;
      if (voicePrefs.get().inputMode !== 'push' || event.code !== voicePrefs.get().pushKey) return;
      if (event.repeat) return;
      this.gate?.hold(event.type === 'keydown');
    };
    const onBlur = () => {
      if (!this.globalHold) this.gate?.hold(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    void this.armGlobalHold();

    const unsubscribe = voicePrefs.subscribe(() => void this.applyPrefs());
    this.stopWatching = () => {
      unsubscribe();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      this.dropGlobalHold();
    };

    const { outputDeviceId, outputVolume } = this.prefs;
    this.mix?.setVolume(outputVolume);
    this.tuneSoundboard();
    if (outputDeviceId) void this.mix?.setOutputDevice(outputDeviceId);
  }

  /** Ask the shell for the key, when there is a shell and push-to-talk is on. */
  private async armGlobalHold(): Promise<void> {
    this.dropGlobalHold();
    const { inputMode, pushKey } = voicePrefs.get();
    if (inputMode !== 'push') return;
    const stop = await holdPushKey(pushKey, (held) => this.gate?.hold(held));
    // The prefs may have moved on while the shell was answering.
    if (!stop) return;
    if (voicePrefs.get().inputMode !== 'push' || voicePrefs.get().pushKey !== pushKey) return stop();
    this.globalHold = stop;
  }

  private dropGlobalHold(): void {
    this.globalHold?.();
    this.globalHold = null;
    this.gate?.hold(false);
  }

  /**
   * The picture cap this device asked for, on one incoming picture. LiveKit
   * keeps fitting the picture to the tile underneath the cap, so "auto" is
   * the cap lifted, not the cap set to the top. The sender is not told to
   * change anything: they keep sending every layer and the server forwards
   * the one asked for, so one person on a bad line costs nobody else.
   */
  private capPicture(publication: RemoteTrackPublication): void {
    if (publication.kind !== Track.Kind.Video) return;
    const quality = voicePrefs.get().receiveQuality;
    publication.setVideoQuality(
      quality === 'low' ? VideoQuality.LOW : quality === 'medium' ? VideoQuality.MEDIUM : VideoQuality.HIGH,
    );
  }

  private capPictures(): void {
    for (const person of this.room?.remoteParticipants.values() ?? []) {
      for (const publication of person.trackPublications.values()) this.capPicture(publication);
    }
  }

  private async applyPrefs(): Promise<void> {
    const before = this.prefs;
    const now = (this.prefs = voicePrefs.get());
    if (before.receiveQuality !== now.receiveQuality) this.capPictures();
    if (before.inputMode !== now.inputMode || before.pushKey !== now.pushKey) void this.armGlobalHold();

    this.mix?.setVolume(now.outputVolume);
    this.tuneSoundboard();
    for (const person of this.room?.remoteParticipants.values() ?? []) {
      const volume = now.volumes[person.identity] ?? 1;
      this.mix?.setVolumeFor(person.identity, volume);
      this.mix?.setVolumeFor(screenSound(person.identity), now.volumes[screenSound(person.identity)] ?? 1);
      this.mix?.setVolumeFor(boardSound(person.identity), volume * now.soundboardVolume);
    }
    if (now.outputDeviceId !== before.outputDeviceId) await this.mix?.setOutputDevice(now.outputDeviceId);

    const captureChanged =
      now.inputDeviceId !== before.inputDeviceId ||
      now.noiseMode !== before.noiseMode ||
      now.echoCancellation !== before.echoCancellation ||
      now.autoGain !== before.autoGain;
    if (captureChanged) {
      await this.micTrack()?.restartTrack(captureOptions(now)).catch(() => undefined);
      this.rebuildGate();
    }
    if (now.loudnessGuard !== before.loudnessGuard) this.mix?.setGuarding(now.loudnessGuard);
    if (
      now.voiceEffect !== before.voiceEffect ||
      now.noiseMode !== before.noiseMode ||
      now.loudnessGuard !== before.loudnessGuard
    ) {
      await this.applyMicChoice();
    }

    if ((now.shareHeight !== before.shareHeight || now.shareFps !== before.shareFps) && this.snapshot.sharing) {
      await this.retuneShare(now);
    }

    if (now.cameraDeviceId !== before.cameraDeviceId && this.snapshot.camera) {
      const camera = this.room?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      await camera?.restartTrack(cameraOptions(now)).catch(() => undefined);
      this.refreshVideos();
    }
  }

  /**
   * A share already running, made to match a new choice of size and frames
   * without asking for the screen again: the capture is told its new ceiling,
   * and every layer the encoder sends is scaled to the new spend. Best effort:
   * a browser that refuses either keeps what it had, and the next share
   * starts with the new choice anyway.
   */
  private async retuneShare(prefs: VoicePrefs): Promise<void> {
    const track = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
    if (!track) return;
    const quality = screenShareOptions(prefs);
    const fps = quality.encoding.maxFramerate;
    await track.mediaStreamTrack
      .applyConstraints(
        quality.resolution
          ? { width: { max: quality.resolution.width }, height: { max: quality.resolution.height }, frameRate: { max: fps } }
          : { frameRate: { max: fps } },
      )
      .catch(() => undefined);
    const sender = track.sender;
    if (!sender) return;
    try {
      const parameters = sender.getParameters();
      const top = Math.max(0, ...parameters.encodings.map((encoding) => encoding.maxBitrate ?? 0));
      if (top > 0) {
        const scale = quality.encoding.maxBitrate / top;
        for (const encoding of parameters.encodings) {
          if (encoding.maxBitrate) encoding.maxBitrate = Math.round(encoding.maxBitrate * scale);
          encoding.maxFramerate = fps;
        }
        await sender.setParameters(parameters);
      }
    } catch {
      // Kept what it had; see above.
    }
  }

  /* --------------------------- the key agreement -------------------------- */

  /**
   * Events are handled strictly one at a time, in the order they arrived.
   * Each handler awaits real cryptography, and without this a wrapped key
   * overtakes the announcement sent just before it, finds a sender it has not
   * admitted yet, and is thrown away for good. The two-browser test caught
   * exactly that: one side secured, the other waiting for ever.
   */
  private queue: Promise<void> = Promise.resolve();

  private inOrder(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  onMembership(event: VoiceMembership): Promise<void> {
    return this.inOrder(() => this.handleMembership(event));
  }

  onSignal(event: VoiceSignal & { from: string }): Promise<void> {
    return this.inOrder(() => this.handleSignal(event));
  }

  private async handleMembership(event: VoiceMembership): Promise<void> {
    if (event.channelId !== this.roomId) return;
    const call = this.call;
    if (!call || !this.myAnnouncement) {
      this.pendingMembership = event;
      return;
    }

    if (this.snapshot.phase === 'connected' && voicePrefs.get().sounds) {
      const others = (list: string[]) => list.filter((id) => id !== this.userId);
      const was = new Set(others(this.members));
      const is = new Set(others(event.members));
      if ([...is].some((id) => !was.has(id))) sounds.joined();
      else if ([...was].some((id) => !is.has(id))) sounds.left();
    }

    this.members = event.members;
    const present = new Set(event.members);
    for (const person of [...call.members, ...call.awaitingConsent]) {
      const { userId, deviceId } = person.announcement;
      if (!present.has(userId)) call.remove(userId, deviceId);
    }

    const epoch = call.rotate(event.epoch);
    this.keySentTo.clear();
    await this.keyProvider?.setParticipantKey(this.userId, call.mediaKey, epoch % KEYRING_SIZE);

    // Newcomers need our public keys; everyone we already trust needs the new media key.
    this.send({ channelId: event.channelId, epoch, kind: 'announce', payload: { ...this.myAnnouncement } });
    await this.sendKeys(call);
    await this.publish(call);
  }

  private async handleSignal(event: VoiceSignal & { from: string }): Promise<void> {
    const call = this.call;
    if (!call || event.channelId !== this.roomId) return;
    // The gateway sends a membership event before it relays anything labelled
    // with that epoch, on one ordered connection, so "ahead of us" cannot
    // happen honestly and "behind us" is simply stale.
    if (event.epoch !== call.epoch) return;

    if (event.kind === 'announce') {
      if (!isAnnouncement(event.payload)) return;
      // The signature is what we trust. These two checks only stop a relay
      // from wasting our time with announcements for people who are not here.
      if (event.payload.userId !== event.from) return;
      if (!this.members.includes(event.payload.userId)) return;

      const result = await call.admit([event.payload]);
      this.rejected += result.rejected.length;
      await this.sendKeys(call);
      await this.publish(call);
      return;
    }

    if (!isWrappedKey(event.payload)) return;
    const mediaKey = await call.accept(event.payload);
    if (!mediaKey) return;
    await this.keyProvider?.setParticipantKey(event.payload.senderId, mediaKey, call.epoch % KEYRING_SIZE);
    await this.publish(call);
  }

  /** The person looked at the warning and said this device is expected. */
  async approve(userId: string, deviceId: string): Promise<void> {
    return this.inOrder(async () => {
      const call = this.call;
      if (!call) return;
      // The yes lets them in now. Remembering it, for later calls and for
      // channels, is written behind it and never holds up the key.
      const unsaved = (problem: unknown) =>
        console.warn('Scryproof let that device into this call, but could not save the approval on this device. It will ask again next time.', problem);
      const approved = await call.approve(userId, deviceId, unsaved);
      if (!approved) return;
      void letInEverywhere(userId, deviceId, approved.fingerprint, unsaved);
      await this.sendKeys(call);
      await this.publish(call);
    });
  }

  private async sendKeys(call: VoiceCall): Promise<void> {
    const channelId = this.roomId;
    if (!channelId) return;
    for (const wrapped of await call.distribute()) {
      const seat = `${wrapped.recipientId}:${wrapped.recipientDeviceId}`;
      if (this.keySentTo.has(seat)) continue;
      this.keySentTo.add(seat);
      this.send({
        channelId,
        epoch: call.epoch,
        kind: 'key',
        to: wrapped.recipientId,
        payload: { ...wrapped },
      });
    }
  }

  /** Recompute everything the panel shows about who is in the call. */
  private async publish(call: VoiceCall): Promise<void> {
    const mine = (userId: string, deviceId: string) =>
      userId === this.userId && deviceId === call.identity.deviceId;

    const people: VoicePerson[] = [];
    for (const member of call.members) {
      const { userId, deviceId } = member.announcement;
      if (mine(userId, deviceId)) continue;
      people.push({
        userId,
        deviceId,
        fingerprint: member.fingerprint,
        verdict: member.verdict,
        state: call.keyFor(userId, deviceId) ? 'secured' : 'waiting',
      });
    }
    for (const member of call.awaitingConsent) {
      const { userId, deviceId } = member.announcement;
      people.push({ userId, deviceId, fingerprint: member.fingerprint, verdict: member.verdict, state: 'held' });
    }

    const epoch = call.epoch;
    this.update({ people, epoch, rejected: this.rejected, code: null });

    // Half a second of deliberate work. Do not hold the rest up for it, and do
    // not show a code for a membership that has already changed again.
    const code = await call.verificationCode();
    if (this.call === call && call.epoch === epoch) this.update({ code });
  }

  /* --------------------------------- media -------------------------------- */

  private listenTo(room: Room): void {
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
      // The unknown source is granted for the soundboard, which is sound. The
      // grant cannot say "sound only", so a picture under that source is
      // somebody's client misbehaving: stop fetching it and draw nothing.
      if (publication.source === Track.Source.Unknown && track.kind !== Track.Kind.Audio) {
        publication.setSubscribed(false);
        return;
      }
      // A camera hidden on this device, arriving anyway (it was already on
      // its way when Hide was pressed, or the person turned it off and on).
      if (publication.source === Track.Source.Camera && this.hiddenCameras.has(participant.identity)) {
        publication.setSubscribed(false);
        return this.refreshVideos();
      }
      if (track.kind !== Track.Kind.Audio) {
        this.capPicture(publication);
        return this.refreshVideos();
      }
      if (!this.mix) {
        this.mix = new OutputMix();
        this.mix.setVolume(voicePrefs.get().outputVolume);
        this.mix.setDeafened(this.deafened);
        this.mix.setGuarding(voicePrefs.get().loudnessGuard);
        const speaker = voicePrefs.get().outputDeviceId;
        if (speaker) void this.mix.setOutputDevice(speaker);
      }
      const volume = savedVolume(voicePrefs.get(), participant.identity, publication.source);
      const voice = publication.source === Track.Source.Microphone;
      this.mix.add(mixKey(participant.identity, publication.source), track.mediaStreamTrack, volume, voice);
      // A screen's sound arriving is what puts a volume slider on its tile.
      if (publication.source === Track.Source.ScreenShareAudio) this.refreshVideos();
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant) => {
      if (track.kind === Track.Kind.Audio) this.mix?.remove(mixKey(participant.identity, publication.source));
      if (track.kind !== Track.Kind.Audio || publication.source === Track.Source.ScreenShareAudio) this.refreshVideos();
    });

    // Someone turning a camera on while it is hidden here: do not fetch it.
    // Either way the list of hidden cameras may have changed.
    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (publication.source === Track.Source.Camera && this.hiddenCameras.has(participant.identity)) {
        publication.setSubscribed(false);
      }
      this.refreshVideos();
    });
    room.on(RoomEvent.TrackUnpublished, () => this.refreshVideos());

    // Our own share ending without our Stop. The track's own "ended" comes
    // from the window closing or the browser's Stop bar; LiveKit answers it
    // by unpublishing inside the same event, before our listener on the track
    // has run. So the unpublish waits one turn for the reason.
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.source !== Track.Source.ScreenShare) return;
      this.shareEnded = null;
      publication.track?.on(TrackEvent.Ended, () => {
        this.shareEnded = 'the screen or window it showed went away, or it was stopped outside Scryproof';
      });
    });
    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.source !== Track.Source.ScreenShare || this.stoppingShare) return;
      setTimeout(() => {
        if (this.room === room) this.noteShareStop(this.shareEnded ?? 'the call stopped sending it, with no reason given');
      }, 0);
    });

    // Includes the browser's own "Stop sharing" bar, which ends a share
    // without going anywhere near our button.
    for (const event of [
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
    ] as const) {
      room.on(event, () => this.refreshVideos());
    }

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: LiveKitParticipant[]) => {
      this.serverSpeakers = speakers.map((speaker) => speaker.identity);
      this.refreshSpeaking();
    });

    room.on(RoomEvent.Disconnected, () => {
      if (this.room !== room) return;
      this.update({ phase: 'failed', encrypted: false, error: 'The call connection was lost.' });
    });
  }

  /**
   * Read the numbers off WebRTC. Every field stays null until its stat has
   * actually appeared in a report.
   */
  private async measure(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const reports: RTCStatsReport[] = [];
    for (const publication of room.localParticipant.trackPublications.values()) {
      const report = await publication.track?.getRTCStatsReport();
      if (report) reports.push(report);
    }
    // The same reports say whether each screen we are watching still moves.
    const watched = new Map<string, FrameWatch>();
    const stalled: Record<string, number> = {};
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const report = await publication.track?.getRTCStatsReport();
        if (!report) continue;
        reports.push(report);
        // A screen paused because its tile is out of sight is not a stalled one.
        if (publication.source !== Track.Source.ScreenShare || !publication.isEnabled) continue;
        const inbound = inboundVideo(report);
        if (!inbound) continue;
        const now = Date.now();
        const watch = noteFrames(this.frameWatch.get(publication.trackSid), inbound.frames, now);
        watched.set(publication.trackSid, watch);
        const seconds = stalledSeconds(watch, now);
        if (seconds !== null) stalled[screenSound(participant.identity)] = seconds;
      }
    }
    if (this.room !== room) return;
    this.frameWatch = watched;

    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let codec: string | null = null;
    let videoCodec: string | null = null;
    let relayed: boolean | null = null;
    let receiving: string | null = null;
    let receivingArea = 0;
    let lost = 0;
    let received = 0;

    for (const report of reports) {
      const byId = new Map<string, Record<string, unknown>>();
      report.forEach((entry: Record<string, unknown>) => byId.set(entry.id as string, entry));

      for (const entry of byId.values()) {
        if (entry.type === 'candidate-pair' && entry.nominated === true && entry.state === 'succeeded') {
          if (typeof entry.currentRoundTripTime === 'number') {
            rttMs = Math.max(rttMs ?? 0, entry.currentRoundTripTime * 1000);
          }
          const local = byId.get(entry.localCandidateId as string);
          if (local) relayed = (relayed ?? false) || local.candidateType === 'relay';
        }
        if (entry.type === 'inbound-rtp' && entry.kind === 'audio') {
          if (typeof entry.jitter === 'number') jitterMs = Math.max(jitterMs ?? 0, entry.jitter * 1000);
          if (typeof entry.packetsLost === 'number') lost += entry.packetsLost;
          if (typeof entry.packetsReceived === 'number') received += entry.packetsReceived;
        }
        if (entry.type === 'outbound-rtp' && entry.kind === 'audio') {
          const described = byId.get(entry.codecId as string);
          if (described && typeof described.mimeType === 'string') codec = described.mimeType.replace(/^audio\//, '');
        }
        if ((entry.type === 'inbound-rtp' || entry.type === 'outbound-rtp') && entry.kind === 'video') {
          const described = byId.get(entry.codecId as string);
          if (described && typeof described.mimeType === 'string' && (videoCodec === null || entry.type === 'inbound-rtp')) {
            videoCodec = described.mimeType.replace(/^video\//, '');
          }
        }
        if (entry.type === 'inbound-rtp' && entry.kind === 'video') {
          const width = typeof entry.frameWidth === 'number' ? entry.frameWidth : 0;
          const height = typeof entry.frameHeight === 'number' ? entry.frameHeight : 0;
          if (width * height > receivingArea) {
            receivingArea = width * height;
            receiving = `${width}x${height}`;
          }
        }
      }
    }

    // Loss over the last interval, not since the call began: a bad minute an
    // hour ago should not still be colouring the number.
    let lossPercent: number | null = null;
    if (this.previousLoss) {
      const deltaLost = lost - this.previousLoss.lost;
      const deltaTotal = deltaLost + (received - this.previousLoss.received);
      if (deltaTotal > 0) lossPercent = Math.max(0, (deltaLost / deltaTotal) * 100);
    }
    this.previousLoss = { lost, received };

    this.update({
      stats: { rttMs, jitterMs, lossPercent, codec, videoCodec, relayed, receiving },
      stalled,
      encrypted: room.isE2EEEnabled,
    });
  }

  /* ------------------------ for the browser test only ---------------------- */

  /**
   * How much sound has actually reached the speakers' mix from each person.
   * With the right key this climbs; with the wrong one, frames fail to decrypt,
   * are dropped, and it stays flat while packets keep arriving. Measured at
   * the mix, after the person's volume, because that is what would be heard.
   * Used by `npm run test:voice`.
   */
  /**
   * Our own ring, for the local microphone: the same meter behind the
   * settings bar and the gate, not the server's guess. That is what makes
   * mute and push-to-talk exact (a muted or PTT-silent person never rings)
   * and removes the round trip through `ActiveSpeakersChanged` for the one
   * voice we do not need LiveKit's help to hear.
   *
   * `gate.open` already carries push-to-talk (in that mode it is exactly
   * whether the key is held) and mute has no other effect on it, so it is
   * checked again here through LiveKit's own publication state, which mute
   * always updates. Before the gate exists (no microphone yet) the server's
   * list is the only thing that knows.
   */
  private selfSpeaking(): boolean {
    if (!this.gate || !this.room) return this.serverSpeakers.includes(this.userId);
    const now = Date.now();
    const loud = this.gate.level >= voicePrefs.get().thresholdDb;
    const { speaking, until } = withHold(now, loud, this.selfLoudUntil, HOLD_MS);
    this.selfLoudUntil = until;
    return speaking && this.gate.open && this.room.localParticipant.isMicrophoneEnabled;
  }

  /**
   * Merge our own ears with the server's guess, and publish only on change.
   * For anyone we already have decoded audio from, our own ears alone decide:
   * a union with the server's list is only ever as quick to let go as the
   * slower of the two, and the server's list both arrives late and updates
   * only a few times a second. The server's list is used only as a fallback,
   * for someone whose track has not subscribed yet (or, for ourselves,
   * before the microphone is open).
   */
  private refreshSpeaking(): void {
    const heard = (this.mix?.talking() ?? []).filter(
      (key) => !key.endsWith(':screen') && !key.endsWith(':soundboard'),
    );
    const fallback = this.serverSpeakers.filter(
      (id) => id !== this.userId && !(this.mix?.has(id) ?? false),
    );
    const speaking = new Set([...heard, ...fallback]);
    if (this.selfSpeaking()) speaking.add(this.userId);

    const sorted = [...speaking].sort();
    const before = this.snapshot.speaking;
    if (before.length === sorted.length && before.every((id, i) => id === sorted[i])) return;
    this.update({ speaking: sorted });
  }

  /**
   * What is really running on the microphone and in front of each voice we
   * hear, as opposed to what was asked for. For the checks: a stage that
   * fails to start falls back quietly, by design, so only this can tell.
   */
  debugMic(): { processor: boolean; suppressing: boolean; guarding: boolean; effect: string | null; guarded: string[] } {
    const processor = this.micTrack()?.getProcessor();
    const mic = processor instanceof MicProcessor ? processor : null;
    return {
      processor: mic !== null,
      suppressing: mic?.suppressing ?? false,
      guarding: mic?.guarding ?? false,
      effect: mic?.choice.effect ?? null,
      guarded: this.mix?.guarded() ?? [],
    };
  }

  async debugInbound(): Promise<Record<string, { energy: number; packets: number }>> {
    const result: Record<string, { energy: number; packets: number }> = {};
    for (const participant of this.room?.remoteParticipants.values() ?? []) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.source !== Track.Source.Microphone) continue;
        const report = await publication.track?.getRTCStatsReport();
        report?.forEach((entry: Record<string, unknown>) => {
          if (entry.type !== 'inbound-rtp') return;
          result[participant.identity] = {
            energy: this.mix?.energyOf(participant.identity) ?? 0,
            packets: typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0,
          };
        });
      }
    }
    return result;
  }

  /**
   * Pictures actually decoded from each person, per source. With the wrong key
   * the packets keep coming and this number stops: an undecryptable frame is
   * not a frame.
   */
  async debugVideo(): Promise<Record<string, { frames: number; width: number; packets: number }>> {
    const result: Record<string, { frames: number; width: number; packets: number }> = {};
    for (const participant of this.room?.remoteParticipants.values() ?? []) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== Track.Kind.Video) continue;
        const source = publication.source === Track.Source.ScreenShare ? 'screen' : 'camera';
        const report = await publication.track?.getRTCStatsReport();
        const inbound = report ? inboundVideo(report) : null;
        if (inbound) result[`${participant.identity}:${source}`] = inbound;
      }
    }
    return result;
  }

  /**
   * Every STUN or TURN address this browser has been told to use. LiveKit hands
   * out Google's STUN servers unless told otherwise, which would send each
   * caller's IP address to Google at the start of every call.
   */
  debugIceServers(): string[] {
    type Transport = { pc?: RTCPeerConnection } | undefined;
    const manager = (this.room as unknown as { engine?: { pcManager?: Record<string, Transport> } })?.engine
      ?.pcManager;
    const urls: string[] = [];
    let found = 0;
    for (const side of ['publisher', 'subscriber']) {
      const connection = manager?.[side]?.pc;
      if (!connection) continue;
      found += 1;
      for (const server of connection.getConfiguration().iceServers ?? []) urls.push(...[server.urls].flat());
    }
    // An instrument that cannot see must say so, not report a clean result.
    if (found === 0) throw new Error('no peer connection found to inspect');
    return [...new Set(urls)];
  }

  /**
   * Sound decoded from each person's soundboard so far, by user id. The same
   * measure as `debugInbound`, on the second track instead of the microphone.
   */
  debugSoundboard(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const participant of this.room?.remoteParticipants.values() ?? []) {
      result[participant.identity] = this.mix?.energyOf(boardSound(participant.identity)) ?? 0;
    }
    return result;
  }

  /** Play a generated tone through the soundboard, so a test needs no uploaded clip. */
  debugPlayTone(seconds = 1): boolean {
    const board = this.board;
    if (!board) return false;
    const context = audioContext();
    const buffer = context.createBuffer(1, Math.round(context.sampleRate * seconds), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = 0.4 * Math.sin((2 * Math.PI * 660 * i) / context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(board.destination);
    source.start();
    return true;
  }

  debugGate(): { level: number; open: boolean } {
    return { level: this.gate?.level ?? -100, open: this.gate?.open ?? false };
  }

  /** Swap one person's key for random bytes, as if the wrong key had been delivered. */
  async debugCorruptKeyFor(userId: string): Promise<void> {
    if (!this.call) return;
    const wrong = crypto.getRandomValues(new Uint8Array(32));
    await this.keyProvider?.setParticipantKey(userId, wrong, this.call.epoch % KEYRING_SIZE);
  }
}

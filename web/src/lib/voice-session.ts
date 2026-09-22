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
  type LocalAudioTrack,
  type Participant as LiveKitParticipant,
  type RemoteTrack,
} from 'livekit-client';
import E2EEWorker from 'livekit-client/e2ee-worker?worker';

import type { VoiceMembership, VoiceSignal } from '@scryproof/shared';

import { api, ApiError } from './api';
import { holdPushKey } from './desktop';
import { MicGate, OutputMix, sounds } from './voice-audio';
import { cameraEncoding, cameraOptions, captureOptions, screenShareOptions, voicePrefs, type VoicePrefs } from './voice-prefs';
import {
  VoiceCall,
  announce,
  createCallKeypair,
  createDeviceIdentity,
  type Announcement,
  type PinVerdict,
  type WrappedKey,
} from './voice-crypto';
import { IndexedDbIdentityStore, loadDeviceIdentity } from './voice-identity';
import { ScryproofKeyProvider, voiceSupport } from './voice-key-provider';

/** LiveKit keeps a ring of this many keys per participant, addressed by index. */
const KEYRING_SIZE = 16;
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
}

export interface VoiceSnapshot {
  phase: VoicePhase;
  channelId: string | null;
  error: string | null;
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
  stats: VoiceStats;
  can: { speak: boolean; video: boolean; screenShare: boolean };
}

const EMPTY_STATS: VoiceStats = { rttMs: null, jitterMs: null, lossPercent: null, codec: null, videoCodec: null, relayed: null };

const IDLE: VoiceSnapshot = {
  phase: 'idle',
  channelId: null,
  error: null,
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
  stats: EMPTY_STATS,
  can: { speak: false, video: false, screenShare: false },
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

/** A shared screen's sound is mixed separately from the same person's microphone. */
const screenSound = (userId: string): string => `${userId}:screen`;
const mixKey = (userId: string, source: Track.Source): string =>
  source === Track.Source.ScreenShareAudio ? screenSound(userId) : userId;

function describeCaptureProblem(problem: unknown, what: 'camera' | 'screen'): string {
  const name = problem instanceof Error ? problem.name : '';
  if (what === 'camera') {
    if (name === 'NotAllowedError') return 'The browser is not allowed to use the camera. Check the icon in the address bar.';
    if (name === 'NotFoundError') return 'No camera was found.';
    if (name === 'NotReadableError') return 'The camera is in use by another program.';
    return 'The camera could not be started.';
  }
  return 'The screen share could not be started.';
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
  private gate: MicGate | null = null;
  private prefs: VoicePrefs = voicePrefs.get();
  private stopWatching: (() => void) | null = null;
  /** Stops the shell's system-wide key watch, when one is running. */
  private globalHold: (() => void) | null = null;

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

  constructor(
    /** Read when needed: the session outlives sign-in, so the id is not known at construction. */
    private readonly whoAmI: () => string,
    private readonly send: SendSignal,
  ) {}

  private get userId(): string {
    return this.whoAmI();
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

  /* -------------------------------- joining ------------------------------- */

  /**
   * Prepare keys, then call `enterChannel` (which tells the gateway we have
   * joined), then connect media. The order matters: the gateway answers a join
   * with a membership event straight away, and the call state has to exist to
   * receive it.
   */
  async join(channelId: string, enterChannel: () => void): Promise<void> {
    await this.leave();
    const generation = (this.generation += 1);
    const stale = () => generation !== this.generation;

    this.update({ ...IDLE, phase: 'connecting', channelId });

    const support = voiceSupport();
    if (!support.ok) {
      this.update({ phase: 'failed', error: support.reason ?? 'This browser cannot join encrypted calls.' });
      return;
    }

    try {
      const identity = await loadDeviceIdentity(createDeviceIdentity);
      const callKeys = await createCallKeypair();
      if (stale()) return;

      this.call = new VoiceCall({
        callId: channelId,
        userId: this.userId,
        identity,
        callKeys,
        pins: new IndexedDbIdentityStore(),
      });
      this.myAnnouncement = await announce(channelId, this.userId, identity, callKeys);
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

      const grant = await api.voice.token(channelId);
      if (stale()) return;
      this.update({ can: grant.can });

      await room.connect(grant.url, grant.token);
      if (stale()) return;

      if (grant.can.speak) await room.localParticipant.setMicrophoneEnabled(true);
      if (stale()) return;
      this.rebuildGate();
      this.watchPrefs();

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
    this.stopWatching?.();
    this.stopWatching = null;
    this.gate?.close();
    this.gate = null;
    this.mix?.close();
    this.mix = null;

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
    this.update({ mediaError: null });
    const quality = screenShareOptions(voicePrefs.get());
    try {
      await room.localParticipant.setScreenShareEnabled(
        on,
        {
          // Game sound, untouched: the voice clean-up would mangle it. Where the
          // browser can, leave this call's own voices out of what is captured,
          // or everyone hears themselves come back.
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },
          resolution: quality.resolution,
          contentHint: 'motion',
          selfBrowserSurface: 'exclude',
        },
        { screenShareEncoding: quality.encoding },
      );
    } catch (problem) {
      // Closing the picker without choosing is not an error worth a message.
      const cancelled = problem instanceof Error && problem.name === 'NotAllowedError';
      if (!cancelled) this.update({ mediaError: describeCaptureProblem(problem, 'screen') });
    }
    if (this.room === room) this.refreshVideos();
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
    for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== Track.Kind.Video || !publication.track || publication.isMuted) continue;
        const source =
          publication.source === Track.Source.ScreenShare
            ? 'screen'
            : publication.source === Track.Source.Camera
              ? 'camera'
              : null;
        if (source) videos.push({ userId: participant.identity, source, sid: publication.trackSid });
      }
    }
    this.update({
      videos,
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
    const media = this.micTrack()?.mediaStreamTrack;
    if (!media) {
      this.update({ transmitting: false });
      return;
    }
    this.gate = new MicGate(
      media,
      () => ({ mode: voicePrefs.get().inputMode, thresholdDb: voicePrefs.get().thresholdDb }),
      () => this.update({ transmitting: this.gate?.open ?? false }),
    );
    this.update({ transmitting: this.gate.open });
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

  private async applyPrefs(): Promise<void> {
    const before = this.prefs;
    const now = (this.prefs = voicePrefs.get());
    if (before.inputMode !== now.inputMode || before.pushKey !== now.pushKey) void this.armGlobalHold();

    this.mix?.setVolume(now.outputVolume);
    for (const person of this.room?.remoteParticipants.values() ?? []) {
      const volume = now.volumes[person.identity] ?? 1;
      this.mix?.setVolumeFor(person.identity, volume);
      this.mix?.setVolumeFor(screenSound(person.identity), volume);
    }
    if (now.outputDeviceId !== before.outputDeviceId) await this.mix?.setOutputDevice(now.outputDeviceId);

    const captureChanged =
      now.inputDeviceId !== before.inputDeviceId ||
      now.noiseSuppression !== before.noiseSuppression ||
      now.echoCancellation !== before.echoCancellation ||
      now.autoGain !== before.autoGain;
    if (captureChanged) {
      await this.micTrack()?.restartTrack(captureOptions(now)).catch(() => undefined);
      this.rebuildGate();
    }

    if (now.cameraDeviceId !== before.cameraDeviceId && this.snapshot.camera) {
      const camera = this.room?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      await camera?.restartTrack(cameraOptions(now)).catch(() => undefined);
      this.refreshVideos();
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
    if (event.channelId !== this.snapshot.channelId) return;
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
    if (!call || event.channelId !== this.snapshot.channelId) return;
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
      if (!(await call.approve(userId, deviceId))) return;
      await this.sendKeys(call);
      await this.publish(call);
    });
  }

  private async sendKeys(call: VoiceCall): Promise<void> {
    const channelId = this.snapshot.channelId;
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
      if (track.kind !== Track.Kind.Audio) return this.refreshVideos();
      if (!this.mix) {
        this.mix = new OutputMix();
        this.mix.setVolume(voicePrefs.get().outputVolume);
        this.mix.setDeafened(this.deafened);
        const speaker = voicePrefs.get().outputDeviceId;
        if (speaker) void this.mix.setOutputDevice(speaker);
      }
      const volume = voicePrefs.get().volumes[participant.identity] ?? 1;
      this.mix.add(mixKey(participant.identity, publication.source), track.mediaStreamTrack, volume);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant) => {
      if (track.kind === Track.Kind.Audio) this.mix?.remove(mixKey(participant.identity, publication.source));
      else this.refreshVideos();
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
      this.update({ speaking: speakers.map((speaker) => speaker.identity) });
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
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const report = await publication.track?.getRTCStatsReport();
        if (report) reports.push(report);
      }
    }
    if (this.room !== room) return;

    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let codec: string | null = null;
    let videoCodec: string | null = null;
    let relayed: boolean | null = null;
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

    this.update({ stats: { rttMs, jitterMs, lossPercent, codec, videoCodec, relayed }, encrypted: room.isE2EEEnabled });
  }

  /* ------------------------ for the browser test only ---------------------- */

  /**
   * How much sound has actually reached the speakers' mix from each person.
   * With the right key this climbs; with the wrong one, frames fail to decrypt,
   * are dropped, and it stays flat while packets keep arriving. Measured at
   * the mix, after the person's volume, because that is what would be heard.
   * Used by `npm run test:voice`.
   */
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
        report?.forEach((entry: Record<string, unknown>) => {
          if (entry.type !== 'inbound-rtp') return;
          result[`${participant.identity}:${source}`] = {
            frames: typeof entry.framesDecoded === 'number' ? entry.framesDecoded : 0,
            width: typeof entry.frameWidth === 'number' ? entry.frameWidth : 0,
            packets: typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0,
          };
        });
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

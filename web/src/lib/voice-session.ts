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
  Track,
  type Participant as LiveKitParticipant,
  type RemoteTrack,
} from 'livekit-client';
import E2EEWorker from 'livekit-client/e2ee-worker?worker';

import type { VoiceMembership, VoiceSignal } from '@gooffline/shared';

import { api, ApiError } from './api';
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
import { GoOfflineKeyProvider, voiceSupport } from './voice-key-provider';

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

export interface VoiceStats {
  rttMs: number | null;
  jitterMs: number | null;
  lossPercent: number | null;
  codec: string | null;
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
  stats: VoiceStats;
  can: { speak: boolean; video: boolean; screenShare: boolean };
}

const EMPTY_STATS: VoiceStats = { rttMs: null, jitterMs: null, lossPercent: null, codec: null, relayed: null };

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

export class VoiceSession {
  private snapshot: VoiceSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();

  private call: VoiceCall | null = null;
  private myAnnouncement: Announcement | null = null;
  private room: Room | null = null;
  private keyProvider: GoOfflineKeyProvider | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private audioSink: HTMLElement | null = null;

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

      this.keyProvider = new GoOfflineKeyProvider();
      const room = new Room({
        encryption: { keyProvider: this.keyProvider, worker: new E2EEWorker() },
        // Audio first. These two matter for video, which comes later.
        adaptiveStream: true,
        dynacast: true,
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

      this.update({ phase: 'connected', encrypted: room.isE2EEEnabled });
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
    this.audioSink?.remove();
    this.audioSink = null;

    if (room) await room.disconnect().catch(() => undefined);
    if (this.snapshot.phase !== 'idle') this.update(IDLE);
  }

  /* ---------------------------- mute and deafen --------------------------- */

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room || !this.snapshot.can.speak) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted).catch(() => undefined);
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    for (const element of this.audioSink?.querySelectorAll('audio') ?? []) element.muted = deafened;
  }

  /* --------------------------- the key agreement -------------------------- */

  async onMembership(event: VoiceMembership): Promise<void> {
    if (event.channelId !== this.snapshot.channelId) return;
    const call = this.call;
    if (!call || !this.myAnnouncement) {
      this.pendingMembership = event;
      return;
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

  async onSignal(event: VoiceSignal & { from: string }): Promise<void> {
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
    const call = this.call;
    if (!call) return;
    if (!(await call.approve(userId, deviceId))) return;
    await this.sendKeys(call);
    await this.publish(call);
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
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      if (!this.audioSink) {
        this.audioSink = document.createElement('div');
        this.audioSink.hidden = true;
        document.body.append(this.audioSink);
      }
      const element = track.attach();
      element.dataset.userId = participant.identity;
      element.muted = this.deafened;
      this.audioSink.append(element);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      for (const element of track.detach()) element.remove();
    });

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

    this.update({ stats: { rttMs, jitterMs, lossPercent, codec, relayed }, encrypted: room.isE2EEEnabled });
  }

  /* ------------------------ for the browser test only ---------------------- */

  /**
   * How much sound has actually been decoded from each person. With the right
   * key this climbs; with the wrong one, frames fail to decrypt, are dropped,
   * and it stays flat while packets keep arriving. Used by `npm run test:voice`.
   */
  async debugInbound(): Promise<Record<string, { energy: number; packets: number }>> {
    const result: Record<string, { energy: number; packets: number }> = {};
    for (const participant of this.room?.remoteParticipants.values() ?? []) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== Track.Kind.Audio) continue;
        const report = await publication.track?.getRTCStatsReport();
        report?.forEach((entry: Record<string, unknown>) => {
          if (entry.type !== 'inbound-rtp') return;
          result[participant.identity] = {
            energy: typeof entry.totalAudioEnergy === 'number' ? entry.totalAudioEnergy : 0,
            packets: typeof entry.packetsReceived === 'number' ? entry.packetsReceived : 0,
          };
        });
      }
    }
    return result;
  }

  /** Swap one person's key for random bytes, as if the wrong key had been delivered. */
  async debugCorruptKeyFor(userId: string): Promise<void> {
    if (!this.call) return;
    const wrong = crypto.getRandomValues(new Uint8Array(32));
    await this.keyProvider?.setParticipantKey(userId, wrong, this.call.epoch % KEYRING_SIZE);
  }
}

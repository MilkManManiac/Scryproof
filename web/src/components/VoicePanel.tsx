/**
 * Everything on screen about a call: who is in it, the numbers, and whether it
 * is actually private.
 *
 * Two rules shape this file.
 *
 * The numbers are always visible during a call (non-negotiable 7), and none of
 * them is ever invented. A stat that has not been measured prints a dash.
 *
 * The word "encrypted" appears only when it is true (non-negotiable 8): LiveKit
 * reports E2EE on, our key is set, and every person shown as secured is someone
 * whose key this device verified and holds. Anyone else is labelled as what
 * they are. A person this device has reason to doubt is not tucked away in a
 * menu; they get a banner that names them and says what approving means.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useStore } from '../state/store';
import { voicePrefs } from '../lib/voice-prefs';
import { initials } from './Avatar';
import type { VoicePerson, VoiceSnapshot, VoiceVideo } from '../lib/voice-session';

function useVoice(): VoiceSnapshot {
  const { voice } = useStore();
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot);
}

function useNames(): (userId: string) => string {
  const { state } = useStore();
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  return (userId) => {
    const member = members.find((entry) => entry.userId === userId);
    return member?.nickname ?? member?.user.displayName ?? 'Someone';
  };
}

/** The same colour a person has everywhere else, so a tile is recognisably them. */
function useAccents(): (userId: string) => string | undefined {
  const { state } = useStore();
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  return (userId) => members.find((entry) => entry.userId === userId)?.user.accent;
}


/* --------------------------------- pictures --------------------------------- */

/**
 * One camera or one screen. The element is handed to the call session, which
 * points the decrypted track at it; nothing in this file touches media.
 */
function VideoView({ video, className }: { video: VoiceVideo; className: string }) {
  const { state, voice } = useStore();
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!element.current) return undefined;
    return voice.attachVideo(video.userId, video.source, element.current);
  }, [voice, video.userId, video.source, video.sid]);

  // Your own camera is shown mirrored, because that is what a mirror has
  // taught everyone to expect. Everyone else sees it the right way round.
  const mirrored = video.source === 'camera' && video.userId === state.user?.id;
  return <video ref={element} className={`${className}${mirrored ? ' mirrored' : ''}`} autoPlay playsInline muted />;
}

const videoKey = (video: VoiceVideo): string => `${video.userId}:${video.source}`;

/* --------------------------------- the stage -------------------------------- */

export function VoiceStage({ channelId, channelName }: { channelId: string; channelName: string }) {
  const { state, voice: session, joinVoice, leaveVoice } = useStore();
  const voice = useVoice();
  const nameOf = useNames();
  const accentOf = useAccents();
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const focusFrame = useRef<HTMLDivElement>(null);

  const occupants = Object.values(state.voiceStates).filter((entry) => entry.channelId === channelId);
  const here = occupants.some((entry) => entry.userId === state.user?.id);
  const live = here && voice.channelId === channelId;

  const securityOf = (userId: string): VoicePerson['state'] | 'self' | 'unknown' => {
    if (userId === state.user?.id) return 'self';
    if (!live) return 'unknown';
    return voice.people.find((person) => person.userId === userId)?.state ?? 'waiting';
  };

  // A picture is only drawn for someone whose key this device holds. Anyone
  // else's frames cannot be decrypted, and a black rectangle explains nothing.
  const videos = live
    ? voice.videos.filter((video) => ['self', 'secured'].includes(securityOf(video.userId)))
    : [];
  const screens = videos.filter((video) => video.source === 'screen');
  const cameraOf = (userId: string) => videos.find((video) => video.userId === userId && video.source === 'camera');

  // Someone else starting to share is the one moment the stage rearranges
  // itself without being asked: it is almost always what you want to look at.
  const newestScreen = screens.filter((video) => video.userId !== state.user?.id).at(-1);
  const newestScreenSid = newestScreen?.sid;
  useEffect(() => {
    if (newestScreen) setFocused(videoKey(newestScreen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestScreenSid]);

  const big = videos.find((video) => videoKey(video) === focused) ?? null;
  const labelOf = (video: VoiceVideo): string => {
    const mine = video.userId === state.user?.id;
    if (video.source === 'camera') return mine ? 'You' : nameOf(video.userId);
    return mine ? 'Your screen' : `${nameOf(video.userId)}'s screen`;
  };

  return (
    <div className={`voice-stage${big ? ' has-focus' : ''}`}>
      <h2 className="voice-stage-title">{channelName}</h2>

      {big ? (
        <div className="voice-focus" ref={focusFrame}>
          <div className="voice-focus-frame">
            <VideoView key={big.sid} video={big} className="voice-focus-video" />
          </div>
          <div className="voice-focus-bar">
            <span className="voice-focus-label">{labelOf(big)}</span>
            <button
              type="button"
              className="link-button"
              onClick={() =>
                document.fullscreenElement
                  ? void document.exitFullscreen()
                  : void focusFrame.current?.requestFullscreen().catch(() => undefined)
              }
            >
              Full screen
            </button>
            <button type="button" className="link-button" onClick={() => setFocused(null)}>
              Make small
            </button>
          </div>
        </div>
      ) : null}

      {occupants.length === 0 ? (
        <p className="voice-stage-empty">Nobody is in here.</p>
      ) : (
        <div className="voice-tiles">
          {screens
            .filter((video) => video !== big)
            .map((video) => (
              <div
                key={videoKey(video)}
                className="voice-tile wide adjustable"
                onClick={() => setFocused(videoKey(video))}
                title="Make this bigger"
              >
                <VideoView key={video.sid} video={video} className="voice-tile-video" />
                <div className="voice-tile-name">{labelOf(video)}</div>
              </div>
            ))}

          {occupants.map((occupant) => {
            const name = nameOf(occupant.userId);
            const security = securityOf(occupant.userId);
            const speaking = live && voice.speaking.includes(occupant.userId);
            const muted = occupant.selfMute || occupant.serverMute;
            const mine = occupant.userId === state.user?.id;
            const volume = prefs.volumes[occupant.userId] ?? 1;
            const camera = cameraOf(occupant.userId);
            const showCamera = camera && camera !== big;
            const open = adjusting === occupant.userId;
            return (
              <div
                key={occupant.userId}
                className={`voice-tile${showCamera ? ' wide' : ''}${speaking ? ' speaking' : ''}${security === 'held' ? ' held' : ''}${mine && !camera ? '' : ' adjustable'}`}
                onClick={() => {
                  if (mine) return camera ? setFocused(videoKey(camera)) : undefined;
                  setAdjusting(open ? null : occupant.userId);
                }}
                title={mine ? undefined : `Change how loud ${name} is for you`}
              >
                {showCamera ? (
                  <VideoView key={camera.sid} video={camera} className="voice-tile-video" />
                ) : (
                  <div className="voice-tile-avatar" style={{ background: accentOf(occupant.userId) }}>
                    {initials(name)}
                  </div>
                )}
                <div className="voice-tile-name">{name}</div>
                <div className="voice-tile-note">
                  {security === 'held'
                    ? 'Needs your OK'
                    : security === 'waiting'
                      ? 'Securing…'
                      : occupant.serverDeaf || occupant.selfDeaf
                        ? 'Deafened'
                        : muted
                          ? 'Muted'
                          : volume !== 1
                            ? `${Math.round(volume * 100)}%`
                            : !live && occupant.sharingScreen
                              ? 'Sharing their screen'
                              : !live && occupant.cameraOn
                                ? 'Camera on'
                                : ' '}
                </div>
                {open ? (
                  <div className="voice-tile-volume" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="range"
                      className="voice-range"
                      min={0}
                      max={200}
                      step={5}
                      value={Math.round(volume * 100)}
                      onChange={(event) => voicePrefs.setVolumeFor(occupant.userId, Number(event.target.value) / 100)}
                      aria-label={`Volume of ${name}, for you only`}
                    />
                    <div className="voice-tile-volume-note">
                      {Math.round(volume * 100)}% · only you hear the change
                    </div>
                    {camera ? (
                      <button type="button" className="link-button" onClick={() => setFocused(videoKey(camera))}>
                        Make their camera bigger
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {live && voice.phase === 'failed' ? <p className="voice-stage-error">{voice.error}</p> : null}
      {live && voice.mediaError ? <p className="voice-stage-error">{voice.mediaError}</p> : null}

      <div className="voice-stage-controls">
        {live && voice.phase === 'connected' && voice.can.video ? (
          <button
            type="button"
            className={voice.camera ? 'button inline' : 'button secondary inline'}
            onClick={() => void session.setCamera(!voice.camera)}
          >
            {voice.camera ? 'Turn camera off' : 'Turn camera on'}
          </button>
        ) : null}
        {live && voice.phase === 'connected' && voice.can.screenShare ? (
          <button
            type="button"
            className={voice.sharing ? 'button inline' : 'button secondary inline'}
            onClick={() => void session.setScreenShare(!voice.sharing)}
          >
            {voice.sharing ? 'Stop sharing' : 'Share your screen'}
          </button>
        ) : null}
        <button
          type="button"
          className={here ? 'button secondary inline' : 'button inline'}
          onClick={() => (here ? leaveVoice() : joinVoice(channelId))}
        >
          {here ? 'Leave' : 'Join'}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- the identity banner ---------------------------- */

function ConsentBanner({ person }: { person: VoicePerson }) {
  const { voice } = useStore();
  const nameOf = useNames();
  const name = nameOf(person.userId);
  const [working, setWorking] = useState(false);

  const changed = person.verdict === 'changed';

  return (
    <div className="voice-consent" role="alert">
      <div className="voice-consent-text">
        <strong>
          {changed
            ? `${name}'s security key is different from last time.`
            : `${name} is on a device this computer has not seen before.`}
        </strong>{' '}
        Right now {name} cannot hear you and you cannot hear them. If {name} really did{' '}
        {changed ? 'reinstall or clear their browser' : 'switch devices'}, approve it. If you are
        not sure, ask them in a way you trust before you do: this is also what it looks like when
        someone is trying to listen in.
        <span className="voice-consent-print">Key {person.fingerprint.slice(0, 16)}</span>
      </div>
      <button
        type="button"
        className="button inline"
        disabled={working}
        onClick={() => {
          setWorking(true);
          void voice.approve(person.userId, person.deviceId).finally(() => setWorking(false));
        }}
      >
        Approve {name}
      </button>
    </div>
  );
}

/* ----------------------------- the connection bar ---------------------------- */

const dash = '—';
const ms = (value: number | null): string => (value === null ? dash : `${Math.round(value)} ms`);

export function ConnectionPanel() {
  const { state } = useStore();
  const voice = useVoice();
  const [showCode, setShowCode] = useState(false);

  const signalling = state.connection === 'open';
  const held = voice.people.filter((person) => person.state === 'held');
  const waiting = voice.people.filter((person) => person.state === 'waiting');
  const secured = voice.people.filter((person) => person.state === 'secured');

  let tone: 'good' | 'warn' | 'bad' = 'good';
  let headline = 'Encrypted';
  if (voice.phase === 'failed') {
    tone = 'bad';
    headline = voice.error ?? 'Not connected';
  } else if (voice.phase !== 'connected') {
    tone = 'warn';
    headline = 'Connecting…';
  } else if (!voice.encrypted) {
    // There is no path that connects without E2EE, so this should be
    // unreachable. If it ever is reached, it must not say "encrypted".
    tone = 'bad';
    headline = 'NOT encrypted';
  } else if (held.length > 0) {
    tone = 'warn';
    headline = `Encrypted · ${held.length} waiting for your OK`;
  } else if (waiting.length > 0) {
    tone = 'warn';
    headline = 'Encrypted · exchanging keys';
  } else if (secured.length === 0) {
    headline = 'Encrypted · only you here';
  } else {
    headline = `Encrypted end to end · ${secured.length + 1} people`;
  }

  const { stats } = voice;

  return (
    <>
      {held.map((person) => (
        <ConsentBanner key={`${person.userId}:${person.deviceId}`} person={person} />
      ))}

      {voice.rejected > 0 ? (
        <div className="voice-consent" role="alert">
          <div className="voice-consent-text">
            <strong>
              {voice.rejected} forged key announcement{voice.rejected === 1 ? ' was' : 's were'} refused.
            </strong>{' '}
            Something between you and the others sent keys that did not match their signatures.
            The call is still private, because they were thrown away, but this should never
            happen by accident.
          </div>
        </div>
      ) : null}

      {showCode ? (
        <div className="voice-code">
          <div className="voice-code-digits">{voice.code ?? 'Working it out…'}</div>
          <p>
            Read this aloud. If everyone in the call sees the same twenty digits, nobody is in the
            middle, including this server. It changes whenever someone joins or leaves. You only
            need to do it once per group.
          </p>
        </div>
      ) : null}

      <div className="connection-panel">
        <span className="connection-stat">
          <i className={`connection-dot ${signalling ? tone : 'bad'}`} />
          {signalling ? headline : 'Signal lost'}
        </span>
        <span className="connection-stat">RTT {ms(stats.rttMs)}</span>
        <span className="connection-stat">Jitter {ms(stats.jitterMs)}</span>
        <span className="connection-stat">
          Loss {stats.lossPercent === null ? dash : `${stats.lossPercent.toFixed(1)}%`}
        </span>
        <span className="connection-stat">
          TURN {stats.relayed === null ? dash : stats.relayed ? 'yes' : 'no'}
        </span>
        <span className="connection-stat">{stats.codec ?? dash}</span>
        {voice.phase === 'connected' ? (
          <button
            type="button"
            className="connection-verify"
            onClick={() => setShowCode((open) => !open)}
          >
            {showCode ? 'Hide code' : 'Verify'}
          </button>
        ) : null}
      </div>
    </>
  );
}

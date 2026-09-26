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
import type { PublicUser, VoiceState } from '@scryproof/shared';

import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { useTimeoutEnd } from '../lib/usePermissions';
import { publicOrigin } from '../lib/desktop';
import { voicePrefs } from '../lib/voice-prefs';
import { nameFor, useLocalNames } from '../lib/local-names';
import { initials } from './Avatar';
import { noPictureLabel } from '../lib/frame-watch';
import { screenSound, type CallPlace, type VoicePerson, type VoiceVideo } from '../lib/voice-session';
import { useVoice } from '../state/useVoice';
import { VolumeMenu, spotOf, type MenuSpot } from './VolumeMenu';
import { CallQuality } from './CallQuality';
import { VoiceSettings } from './VoiceSettings';
import { SoundBoard } from './SoundBoard';
import { MuteBanner } from './MuteStatus';
import {
  CameraGlyph,
  ExpandGlyph,
  GridGlyph,
  HangUpGlyph,
  HeadphonesGlyph,
  MicGlyph,
  ScreenGlyph,
  SlidersGlyph,
  SoundboardGlyph,
} from './glyphs';

/**
 * Someone from one of this person's conversations. A call in a conversation
 * is often with somebody who is not in the server on screen, and the
 * conversation already knows who they are.
 */
function useDmPeople(): (userId: string) => PublicUser | undefined {
  const { state } = useDms();
  return (userId) => {
    for (const dm of Object.values(state.dms)) {
      const found = dm.members.find((member) => member.id === userId);
      if (found) return found;
    }
    return undefined;
  };
}

function useNames(): (userId: string) => string {
  const { state } = useStore();
  const dmPerson = useDmPeople();
  useLocalNames();
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  return (userId) => {
    const member = members.find((entry) => entry.userId === userId);
    return nameFor(userId, member?.nickname ?? member?.user.displayName ?? dmPerson(userId)?.displayName ?? 'Someone');
  };
}

/** The person themselves, for their picture: you, someone in this server, or someone from a conversation. */
function usePeople(): (userId: string) => PublicUser | undefined {
  const { state } = useStore();
  const dmPerson = useDmPeople();
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  return (userId) =>
    (userId === state.user?.id ? state.user : undefined) ??
    members.find((entry) => entry.userId === userId)?.user ??
    dmPerson(userId);
}

/** The same colour a person has everywhere else, so a tile is recognisably them. */
function useAccents(): (userId: string) => string | undefined {
  const { state } = useStore();
  const dmPerson = useDmPeople();
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  return (userId) => members.find((entry) => entry.userId === userId)?.user.accent ?? dmPerson(userId)?.accent;
}


/* --------------------------------- pictures --------------------------------- */

interface Picture {
  width: number;
  height: number;
  fps: number | null;
}

const pictureLabel = (picture: Picture, codec: string | null): string =>
  `${picture.width}×${picture.height}${picture.fps === null ? '' : `, ${picture.fps} fps`}${codec ? `, ${codec}` : ''}`;

/**
 * One camera or one screen. The element is handed to the call session, which
 * points the decrypted track at it; nothing in this file touches media.
 */
function VideoView({
  video,
  className,
  onPicture,
}: {
  video: VoiceVideo;
  className: string;
  /** Once a second: what is actually being drawn, in pixels and frames. */
  onPicture?: (picture: Picture | null) => void;
}) {
  const { state, voice } = useStore();
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!element.current) return undefined;
    return voice.attachVideo(video.userId, video.source, element.current);
  }, [voice, video.userId, video.source, video.sid]);

  // Measured off the <video> itself, not asked of anyone: the number of
  // frames it painted in the last second, and the size of the picture it has.
  useEffect(() => {
    if (!onPicture) return undefined;
    let last = { frames: 0, at: performance.now() };
    const tick = setInterval(() => {
      const el = element.current;
      if (!el || el.videoWidth === 0) return onPicture(null);
      const quality = el.getVideoPlaybackQuality?.();
      const now = performance.now();
      const frames = quality ? quality.totalVideoFrames : 0;
      const fps = quality ? Math.round(((frames - last.frames) * 1000) / Math.max(1, now - last.at)) : null;
      last = { frames, at: now };
      onPicture({ width: el.videoWidth, height: el.videoHeight, fps });
    }, 1000);
    return () => {
      clearInterval(tick);
      onPicture(null);
    };
  }, [onPicture, video.sid]);

  // Your own camera is shown mirrored, because that is what a mirror has
  // taught everyone to expect. Everyone else sees it the right way round.
  const mirrored = video.source === 'camera' && video.userId === state.user?.id;
  return <video ref={element} className={`${className}${mirrored ? ' mirrored' : ''}`} autoPlay playsInline muted />;
}

const videoKey = (video: VoiceVideo): string => `${video.userId}:${video.source}`;

/* --------------------------------- the stage -------------------------------- */

/**
 * The tile width for this many 16:9 tiles in a box this size. The biggest
 * that fits, except that side by side wins over stacked when it costs less
 * than a fifth of the size: two people read as a conversation in a row, and
 * as a list in a column.
 */
function tileWidth(count: number, width: number, height: number, gap = 8): number {
  const fits: number[] = [];
  for (let cols = 1; cols <= Math.max(1, count); cols += 1) {
    const rows = Math.ceil(count / cols);
    fits.push(Math.min((width - (cols - 1) * gap) / cols, (((height - (rows - 1) * gap) / rows) * 16) / 9));
  }
  const best = Math.max(...fits);
  const wide = [...fits].reverse().find((fit) => fit >= best * 0.8) ?? best;
  return Math.max(120, Math.floor(wide));
}

/** The size of an element, kept current as the window or the panel changes. */
function useBoxSize(): [(node: HTMLElement | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, size];
}

type Tile =
  | { key: string; kind: 'screen'; video: VoiceVideo }
  | { key: string; kind: 'person'; occupant: VoiceState; camera: VoiceVideo | undefined };

/**
 * The call's stage, for a voice channel or for the call inside a
 * conversation. Everything below the first lines is the same for both: the
 * same tiles, the same encryption labels, the same controls.
 *
 * Laid out the way Discord lays it out (Wes, 2026-09-23: "make it act like
 * discord"): every screen and every person is a tile in one grid that fills
 * the room, so two people sharing are two streams playing side by side.
 * Clicking a picture makes it the big one with the rest in a strip under it;
 * the grid button puts everyone back. Along the bottom, round buttons for
 * microphone, sound, camera, screen, quality and hanging up.
 */
export function VoiceStage(
  props: { channelId: string; channelName: string } | { dmId: string; channelName: string },
) {
  const { channelName } = props;
  const place: CallPlace = 'dmId' in props ? { kind: 'dm', id: props.dmId } : { kind: 'channel', id: props.channelId };
  const { state, voice: session, joinVoice, joinDmCall, leaveVoice, updateVoice } = useStore();
  const voice = useVoice();
  const nameOf = useNames();
  const accentOf = useAccents();
  const personOf = usePeople();
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);
  /** Whose right-click volume menu is open: the same setting as the profile card, where Discord keeps it. */
  const [volumeMenu, setVolumeMenu] = useState<{ userId: string; spot: MenuSpot } | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const focusFrame = useRef<HTMLDivElement>(null);
  const [gridBox, grid] = useBoxSize();

  const inPlace = (entry: { channelId: string | null; dmId: string | null }): boolean =>
    place.kind === 'dm' ? entry.dmId === place.id : entry.channelId === place.id;
  const occupants = Object.values(state.voiceStates).filter(inPlace);
  const selfId = state.user?.id;
  const myState = occupants.find((entry) => entry.userId === selfId);
  const here = Boolean(myState);
  // `mine` from the moment Join is pressed; `live` only once the server lists
  // us. A join that dies before that point (a browser that cannot encrypt,
  // a refusal from the gateway) is still ours to explain.
  const mine = inPlace(voice);
  const live = here && mine;
  const joining = mine && !here && voice.phase === 'connecting';
  const connected = live && voice.phase === 'connected';
  // The soundboard, here as well as in the card by your name: a server call's,
  // once its track is up, and not while a moderator has you muted.
  const boardServer = myState?.serverId ? state.servers[myState.serverId] : undefined;
  const boardReady = connected && Boolean(boardServer) && voice.soundboard && !myState?.serverMute;

  // Timed out, the token request is refused, so offering Join would only
  // produce an error. Leave stays: a timeout should not trap anyone in a room.
  // A timeout is a server's, and says nothing about a call in a conversation.
  const timedOutUntil = useTimeoutEnd(
    place.kind === 'channel' && state.selectedServerId
      ? state.members[state.selectedServerId]?.find((member) => member.userId === selfId)
      : undefined,
  );

  const securityOf = (userId: string): VoicePerson['state'] | 'self' | 'unknown' => {
    if (userId === selfId) return 'self';
    if (!live) return 'unknown';
    return voice.people.find((person) => person.userId === userId)?.state ?? 'waiting';
  };

  // A picture is only drawn for someone whose key this device holds. Anyone
  // else's frames cannot be decrypted, and a black rectangle explains nothing.
  const videos = live
    ? voice.videos.filter((video) => ['self', 'secured'].includes(securityOf(video.userId)))
    : [];
  const screens = videos.filter((video) => video.source === 'screen');
  const cameraOf = (userId: string) =>
    voice.hiddenCameras.includes(userId)
      ? undefined
      : videos.find((video) => video.userId === userId && video.source === 'camera');

  // Someone else starting to share is the one moment the stage rearranges
  // itself without being asked. The first screen becomes the big picture;
  // a second one going up while a screen is big puts everything back in the
  // grid, so both play at once and you pick.
  const otherScreens = screens.filter((video) => video.userId !== selfId);
  const newestScreen = otherScreens.at(-1);
  const newestScreenSid = newestScreen?.sid;
  useEffect(() => {
    if (!newestScreen) return;
    setFocused((current) =>
      current?.endsWith(':screen') && otherScreens.length > 1 ? null : videoKey(newestScreen),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestScreenSid]);

  const tiles: Tile[] = [
    ...screens.map((video): Tile => ({ key: videoKey(video), kind: 'screen', video })),
    ...occupants.map(
      (occupant): Tile => ({ key: `${occupant.userId}:person`, kind: 'person', occupant, camera: cameraOf(occupant.userId) }),
    ),
  ];
  // A person with their camera on is focused by their camera's key, so a
  // camera turning off takes the focus with it.
  const focusKeyOf = (tile: Tile): string | null =>
    tile.kind === 'screen' ? tile.key : tile.camera ? videoKey(tile.camera) : null;
  const big = focused === null ? null : (tiles.find((tile) => focusKeyOf(tile) === focused) ?? null);
  const bigVideo = big ? (big.kind === 'screen' ? big.video : (big.camera ?? null)) : null;

  const labelOf = (video: VoiceVideo): string => {
    const own = video.userId === selfId;
    if (video.source === 'camera') return own ? 'You' : nameOf(video.userId);
    return own ? 'Your screen' : `${nameOf(video.userId)}'s screen`;
  };
  // Only other people's screens are watched for stalls: our own is not decoded here.
  const stalledNote = (video: VoiceVideo): string | null => {
    const seconds = video.source === 'screen' ? voice.stalled[screenSound(video.userId)] : undefined;
    return seconds === undefined ? null : noPictureLabel(nameOf(video.userId), seconds);
  };
  const screenVolume = (userId: string): number => prefs.volumes[screenSound(userId)] ?? 1;

  const openVolume = (userId: string, event: React.MouseEvent) => {
    event.preventDefault();
    if (userId === selfId) return;
    setVolumeMenu({ userId, spot: spotOf(event) });
  };

  /** One tile, in the grid or in the strip under the big picture. */
  const renderTile = (tile: Tile) => {
    if (tile.kind === 'screen') {
      const { video } = tile;
      const note = stalledNote(video);
      return (
        <div
          key={tile.key}
          className="call-tile screen"
          onClick={() => setFocused(tile.key)}
          onContextMenu={(event) => openVolume(video.userId, event)}
          title="Watch this one big"
        >
          <VideoView key={video.sid} video={video} className="voice-tile-video contain" />
          <span className="call-tile-live">Live</span>
          <span className="call-tile-name">{labelOf(video)}</span>
          {note ? <span className="call-tile-note voice-stalled">{note}</span> : null}
        </div>
      );
    }

    const { occupant, camera } = tile;
    const userId = occupant.userId;
    const own = userId === selfId;
    const name = nameOf(userId);
    const person = personOf(userId);
    const security = securityOf(userId);
    const speaking = live && voice.speaking.includes(userId);
    const deaf = occupant.serverDeaf || occupant.selfDeaf;
    const muted = occupant.selfMute || occupant.serverMute;
    const volume = prefs.volumes[userId] ?? 1;
    const accent = person?.accent ?? accentOf(userId);
    const note =
      security === 'held'
        ? 'Needs your OK'
        : security === 'waiting'
          ? 'Securing…'
          : !own && volume !== 1
            ? `${Math.round(volume * 100)}%`
            : !live && occupant.sharingScreen
              ? 'Sharing their screen'
              : null;
    return (
      <div
        key={tile.key}
        className={`call-tile${speaking ? ' speaking' : ''}${security === 'held' ? ' held' : ''}`}
        style={{ '--tile-accent': accent ?? 'var(--panel-2)' } as React.CSSProperties}
        onClick={(event) => {
          if (camera) setFocused(videoKey(camera));
          else openVolume(userId, event);
        }}
        onContextMenu={(event) => openVolume(userId, event)}
        title={camera ? 'Make this bigger' : own ? undefined : `Change how loud ${name} is for you`}
      >
        {camera ? (
          <VideoView key={camera.sid} video={camera} className="voice-tile-video" />
        ) : (
          <span className="call-tile-avatar">
            {person?.avatarUrl ? <img src={person.avatarUrl} alt="" /> : initials(name)}
          </span>
        )}
        <span className="call-tile-name">
          {name}
          {deaf ? (
            <span className="call-tile-mark" title="Deafened">
              <HeadphonesGlyph off />
            </span>
          ) : muted ? (
            <span className="call-tile-mark" title="Muted">
              <MicGlyph off />
            </span>
          ) : null}
        </span>
        {note ? <span className="call-tile-note">{note}</span> : null}
        {voice.hiddenCameras.includes(userId) ? (
          <span className="call-tile-note lower">
            Camera hidden{' '}
            <button
              type="button"
              className="link-button"
              onClick={(event) => {
                event.stopPropagation();
                session.setCameraHidden(userId, false);
              }}
            >
              Show
            </button>
          </span>
        ) : null}
        {volumeMenu?.userId === userId ? (
          <VolumeMenu userId={userId} name={name} spot={volumeMenu.spot} onClose={() => setVolumeMenu(null)} />
        ) : null}
      </div>
    );
  };

  const rest = big ? tiles.filter((tile) => tile !== big) : tiles;
  const width = tileWidth(tiles.length, grid.width, grid.height);

  return (
    <div className={`voice-stage call${big ? ' has-focus' : ''}`}>
      {/* The header already names the room; the title is for the lobby, before you are in. */}
      {!here ? <h2 className="voice-stage-title">{channelName}</h2> : null}

      {big && bigVideo ? (
        <div className="voice-focus" ref={focusFrame}>
          <div className="voice-focus-frame">
            <VideoView key={bigVideo.sid} video={bigVideo} className="voice-focus-video" onPicture={setPicture} />
          </div>
          <div className="voice-focus-bar">
            <span className="voice-focus-label">{labelOf(bigVideo)}</span>
            {picture ? (
              <span className="voice-focus-picture" title="What is being drawn on your screen right now">
                {pictureLabel(picture, voice.stats.videoCodec)}
              </span>
            ) : null}
            {stalledNote(bigVideo) ? <span className="voice-stalled">{stalledNote(bigVideo)}</span> : null}
            {bigVideo.source === 'screen' && bigVideo.sound && bigVideo.userId !== selfId ? (
              <label
                className="voice-focus-volume"
                title="The sound of this screen, apart from their voice. Only you hear the change."
              >
                Screen sound
                <input
                  type="range"
                  className="voice-range"
                  min={0}
                  max={200}
                  step={5}
                  value={Math.round(screenVolume(bigVideo.userId) * 100)}
                  onChange={(event) =>
                    voicePrefs.setVolumeFor(screenSound(bigVideo.userId), Number(event.target.value) / 100)
                  }
                  aria-label={`Volume of ${nameOf(bigVideo.userId)}'s screen, for you only`}
                />
                {Math.round(screenVolume(bigVideo.userId) * 100)}%
              </label>
            ) : null}
            {bigVideo.source === 'camera' && bigVideo.userId !== selfId ? (
              <button type="button" className="link-button" onClick={() => session.setCameraHidden(bigVideo.userId, true)}>
                Hide for me
              </button>
            ) : null}
            <button
              type="button"
              className="icon-button"
              title="Full screen"
              aria-label="Full screen"
              onClick={() =>
                document.fullscreenElement
                  ? void document.exitFullscreen()
                  : void focusFrame.current?.requestFullscreen().catch(() => undefined)
              }
            >
              <ExpandGlyph />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Everyone at once"
              aria-label="Make small"
              onClick={() => setFocused(null)}
            >
              <GridGlyph />
            </button>
          </div>
          {bigVideo.source === 'camera' && bigVideo.userId === selfId && picture ? (
            <div className="voice-focus-report">{session.cameraReport()}</div>
          ) : null}
        </div>
      ) : null}

      {occupants.length === 0 ? (
        <p className="voice-stage-empty">Nobody is in here.</p>
      ) : big ? (
        <div className="call-strip">{rest.map(renderTile)}</div>
      ) : (
        <div className="call-grid" ref={gridBox} style={{ '--tile-width': `${width}px` } as React.CSSProperties}>
          {tiles.map(renderTile)}
        </div>
      )}

      {mine && voice.phase === 'failed' ? (
        <p className="voice-stage-error">
          {voice.error}
          {voice.installer ? (
            <a className="voice-stage-error-link" href={`${publicOrigin()}/download/Scryproof-Setup.exe`}>
              Get the desktop app for Windows
            </a>
          ) : null}
        </p>
      ) : null}
      {live && voice.mediaError ? <p className="voice-stage-error">{voice.mediaError}</p> : null}
      {live && voice.shareNotice && !voice.sharing ? <p className="voice-stage-error">{voice.shareNotice}</p> : null}

      {live && myState ? <MuteBanner state={myState} onChange={updateVoice} where="call" /> : null}
      <div className="call-controls">
        {myState ? (
          <>
            <button
              type="button"
              className={`call-button${myState.selfMute || myState.serverMute ? ' off' : ''}`}
              title={myState.selfMute ? 'Unmute' : 'Mute'}
              aria-label={myState.selfMute ? 'Unmute' : 'Mute'}
              onClick={() => updateVoice({ selfMute: !myState.selfMute })}
            >
              <MicGlyph size={20} off={myState.selfMute || myState.serverMute} />
            </button>
            <button
              type="button"
              className={`call-button${myState.selfDeaf || myState.serverDeaf ? ' off' : ''}`}
              title={myState.selfDeaf ? 'Undeafen' : 'Deafen'}
              aria-label={myState.selfDeaf ? 'Undeafen' : 'Deafen'}
              onClick={() => updateVoice({ selfDeaf: !myState.selfDeaf })}
            >
              <HeadphonesGlyph size={20} off={myState.selfDeaf || myState.serverDeaf} />
            </button>
          </>
        ) : null}
        {connected && voice.can.video ? (
          <button
            type="button"
            className={`call-button${voice.camera ? ' on' : ''}`}
            title={voice.camera ? 'Turn camera off' : 'Turn camera on'}
            aria-label={voice.camera ? 'Turn camera off' : 'Turn camera on'}
            onClick={() => void session.setCamera(!voice.camera)}
          >
            <CameraGlyph size={20} />
          </button>
        ) : null}
        {connected && voice.can.screenShare ? (
          <button
            type="button"
            className={`call-button${voice.sharing ? ' on' : ''}`}
            title={voice.sharing ? 'Stop sharing' : 'Share your screen'}
            aria-label={voice.sharing ? 'Stop sharing' : 'Share your screen'}
            onClick={() => void session.setScreenShare(!voice.sharing)}
          >
            <ScreenGlyph size={20} />
          </button>
        ) : null}
        {live && boardServer ? (
          <span className="call-quality-anchor">
            <button
              type="button"
              className={`call-button${boardOpen ? ' on' : ''}`}
              disabled={!boardReady}
              title={boardReady ? 'Soundboard: play a sound for everyone' : 'Soundboard (getting ready)'}
              aria-label="Soundboard"
              aria-expanded={boardOpen}
              onMouseDown={(event) => {
                if (boardOpen) event.stopPropagation();
              }}
              onClick={() => setBoardOpen((open) => !open)}
            >
              <SoundboardGlyph size={20} />
            </button>
            {boardOpen && boardReady ? <SoundBoard server={boardServer} onClose={() => setBoardOpen(false)} /> : null}
          </span>
        ) : null}
        {live ? (
          <span className="call-quality-anchor">
            <button
              type="button"
              className={`call-button${qualityOpen ? ' on' : ''}`}
              title="Stream quality"
              aria-label="Stream quality"
              onClick={() => setQualityOpen((open) => !open)}
            >
              <SlidersGlyph size={20} />
            </button>
            {qualityOpen ? (
              <CallQuality
                sharing={voice.sharing}
                canShare={voice.can.screenShare}
                onClose={() => setQualityOpen(false)}
                onAllSettings={() => setSettingsOpen(true)}
              />
            ) : null}
          </span>
        ) : null}
        {here ? (
          <button type="button" className="call-button hang-up" title="Leave" aria-label="Leave" onClick={() => leaveVoice()}>
            <HangUpGlyph size={22} />
          </button>
        ) : !timedOutUntil ? (
          <button
            type="button"
            className="button inline call-join"
            disabled={joining}
            onClick={() => (place.kind === 'dm' ? joinDmCall(place.id) : joinVoice(place.id))}
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        ) : (
          <p className="voice-stage-error">You are timed out until {timedOutUntil.toLocaleString()}.</p>
        )}
      </div>
      {settingsOpen ? <VoiceSettings onClose={() => setSettingsOpen(false)} /> : null}
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

  // Everyone whose key the code is worked out over: this device, and every
  // device in the call's own key list (secured or still waiting; the held ones
  // get no keys and are not in it). Named here from that list, not from the
  // server's picture of the room, because a server can also listen unseen.
  const nameOf = useNames();
  const devices = new Map<string, number>();
  for (const person of voice.people) {
    if (person.state !== 'held') devices.set(person.userId, (devices.get(person.userId) ?? 0) + 1);
  }
  const covered = [
    'you',
    ...[...devices].map(([userId, count]) => {
      if (userId === state.user?.id) return count > 1 ? `${count} other devices of yours` : 'your other device';
      return count > 1 ? `${nameOf(userId)} (${count} devices)` : nameOf(userId);
    }),
  ];

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
            middle of the people named below, including this server. The server decides who gets
            named, so check that it is exactly who is really in the call, every call. The digits
            change whenever someone joins or leaves; comparing them once per group is enough.
          </p>
          <p className="voice-code-covers">Covers: {covered.join(', ')}.</p>
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
        {stats.receiving ? (
          <span className="connection-stat" title="The largest picture arriving right now">
            Video {stats.receiving}
          </span>
        ) : null}
        {voice.lastShareStop ? (
          <span className="connection-stat" title="The last time your screen share ended without Stop being pressed">
            {new Date(voice.lastShareStop.at).toLocaleTimeString()} {voice.lastShareStop.reason}
          </span>
        ) : null}
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

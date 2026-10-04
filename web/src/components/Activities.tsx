import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import {
  ACTIVITIES,
  ACTIVITY_ORIGIN,
  activities,
  activityUrl,
  type Activity,
} from '../lib/activities';
import {
  idleShareHint,
  readActivityStatus,
  type ActivityStatus,
} from '../lib/activity-status';
import {
  canEmbedActivities,
  canInstallShellUpdate,
  isDesktop,
  onMacApp,
  publicOrigin,
} from '../lib/desktop';
import { DesktopInstallerLink } from './DesktopInstallerLink';
import { useBackButton } from '../lib/back';
import { usePhone } from '../lib/usePhone';
import { useStore } from '../state/store';
import { useVoice } from '../state/useVoice';
import { Modal } from './Modal';
import { ConnectionPanel } from './VoicePanel';

export function ActivityGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 7h10c3 0 5 11 2 11-2 0-3-3-5-3h-4c-2 0-3 3-5 3C2 18 4 7 7 7Z" />
      <path d="M8 10v4m-2-2h4m6-1h.01m2 2h.01" />
    </svg>
  );
}

export function ActivitiesButton({ inCall = false }: { inCall?: boolean }) {
  const view = useSyncExternalStore(activities.subscribe, activities.get);
  return (
    <button
      type="button"
      className={inCall ? 'voice-dock-button' : 'rail-item'}
      title={view.game ? `Return to ${view.game.name}` : 'Activities'}
      aria-label={view.game ? `Return to ${view.game.name}` : 'Activities'}
      onClick={activities.open}
    >
      <ActivityGlyph />
      {inCall ? <span>Activities</span> : null}
    </button>
  );
}

/** Mounted once under the authenticated shell. Minimize never reloads the game. */
export function ActivitiesGate() {
  const view = useSyncExternalStore(activities.subscribe, activities.get);
  useEffect(() => () => activities.end(), []);
  return (
    <>
      {view.picker ? (
        <Modal
          title="Activities"
          onClose={activities.closePicker}
          footer={
            <button type="button" onClick={activities.closePicker}>
              Close
            </button>
          }
        >
          <p>
            Play here. Join a call and share your gameplay so friends can watch.
          </p>
          {!canEmbedActivities ? (
            <div className="activity-update-needed">
              <p>This desktop version needs an update for Activities.</p>
              {canInstallShellUpdate ? (
                <>
                  <p>
                    Your app will offer Restart to install when the update is
                    ready.
                  </p>
                  <details className="activity-update-help">
                    <summary>Trouble updating?</summary>
                    <p>
                      <DesktopInstallerLink /> and run the installer when your
                      call is over.
                    </p>
                  </details>
                </>
              ) : (
                <p>
                  <DesktopInstallerLink /> and run the installer when your call
                  is over.
                </p>
              )}
              <p>
                <a
                  href={publicOrigin()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Play in your browser
                </a>{' '}
                while you wait.
              </p>
            </div>
          ) : null}
          {ACTIVITIES.map((game) => (
            <button
              type="button"
              key={game.id}
              className="activity-choice"
              disabled={!canEmbedActivities}
              onClick={() => activities.start(game)}
            >
              <ActivityGlyph size={32} />
              <span>
                <strong>{game.name}</strong>
                <span>{game.description}</span>
                <small>Single player · Progress saved on this device</small>
              </span>
              <span className="activity-play">Play</span>
            </button>
          ))}
        </Modal>
      ) : null}
      {view.game ? (
        <ActivityPlayer
          key={view.game.id}
          game={view.game}
          minimized={view.minimized}
        />
      ) : null}
    </>
  );
}

function ActivityPlayer({
  game,
  minimized,
}: {
  game: Activity;
  minimized: boolean;
}) {
  const { state, voice: session, leaveVoice, updateVoice } = useStore();
  const call = useVoice();
  const phone = usePhone();
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | ActivityStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [ending, setEnding] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const visible = useRef(!minimized);
  visible.current = !minimized;
  const ownedShare = useRef<string | null>(null);
  const mounted = useRef(true);
  const mine = Object.values(state.voiceStates).find(
    (person) => person.userId === state.user?.id,
  );
  const connected = call.phase === 'connected';
  useBackButton(phone && !minimized, () => void minimize());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setStatus('error'), 120_000);
    const onMessage = (event: MessageEvent) => {
      const next = readActivityStatus(
        event,
        ACTIVITY_ORIGIN,
        frame.current?.contentWindow ?? null,
        game.id,
      );
      if (next) {
        clearTimeout(timer);
        setStatus(next);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [game, attempt]);

  async function share() {
    if (shareBusy) return;
    setShareBusy(true);
    setControlError(null);
    try {
      await session.setScreenShare(!call.sharing, true);
      const now = session.getSnapshot();
      const sameCall =
        now.channelId === call.channelId && now.dmId === call.dmId;
      ownedShare.current =
        !call.sharing && sameCall && now.sharing
          ? (now.videos.find(
              (video) =>
                video.userId === state.user?.id && video.source === 'screen',
            )?.sid ?? null)
          : null;
      // End/unmount can happen while the browser's capture picker is open.
      if ((!mounted.current || !visible.current) && ownedShare.current)
        await session.setScreenShare(false);
    } finally {
      if (mounted.current) setShareBusy(false);
    }
  }
  async function stopGameplayShare(): Promise<boolean> {
    const ownSid = () =>
      session
        .getSnapshot()
        .videos.find(
          (video) =>
            video.userId === state.user?.id && video.source === 'screen',
        )?.sid;
    if (ownedShare.current && ownSid() === ownedShare.current) {
      await session.setScreenShare(false);
      if (ownSid() === ownedShare.current) {
        setControlError(
          'Could not stop gameplay sharing. Stop your share before leaving the game.',
        );
        return false;
      }
    }
    ownedShare.current = null;
    return true;
  }
  async function minimize() {
    if (shareBusy) return;
    if (await stopGameplayShare()) activities.minimize();
  }
  async function end() {
    if (shareBusy) return;
    if (await stopGameplayShare()) activities.end();
  }

  const sharingWhy = !connected
    ? 'Join a voice or video call to share gameplay'
    : !call.can.screenShare
      ? 'Screen sharing is not allowed in this call'
      : undefined;
  return createPortal(
    <>
      <section
        className={`activity-player${minimized ? ' minimized' : ''}`}
        aria-label={game.name}
        aria-hidden={minimized}
      >
        <header className="activity-toolbar">
          <span className="activity-title">
            <ActivityGlyph />
            <strong>{game.name}</strong>
            <small>Single player</small>
          </span>
          <div className="activity-controls">
            {mine ? (
              <button
                type="button"
                aria-pressed={mine.selfMute}
                onClick={() => updateVoice({ selfMute: !mine.selfMute })}
              >
                {mine.selfMute ? 'Unmute mic' : 'Mute mic'}
              </button>
            ) : null}
            <button
              type="button"
              className={call.sharing ? 'primary' : ''}
              disabled={
                !!sharingWhy ||
                shareBusy ||
                (!call.sharing && status !== 'ready')
              }
              title={sharingWhy}
              onClick={() => void share()}
            >
              {call.sharing
                ? 'Stop sharing'
                : shareBusy
                  ? 'Opening share picker…'
                  : 'Share gameplay'}
            </button>
            <button
              type="button"
              disabled={shareBusy}
              onClick={() => void minimize()}
            >
              Back to Scryproof
            </button>
            <button
              type="button"
              disabled={shareBusy}
              onClick={() => setEnding(true)}
            >
              End activity
            </button>
          </div>
        </header>
        <p className="activity-hint">
          {sharingWhy ??
            (call.sharing
              ? ownedShare.current
                ? 'Your screen is shared. Friends can press Watch. Returning to Scryproof stops gameplay sharing.'
                : 'Your existing screen share is still running. Stop sharing before returning if you want to keep chat private.'
              : idleShareHint(isDesktop, onMacApp))}
        </p>
        <div className="activity-stage">
          <iframe
            key={attempt}
            ref={frame}
            title={game.name}
            src={activityUrl(game)}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            allow="autoplay; fullscreen"
            referrerPolicy="no-referrer"
          />
          {status !== 'ready' ? (
            <div className="activity-loading" role="status">
              {status === 'loading' ? (
                <>
                  <div className="spinner" />
                  <p>Loading {game.name}…</p>
                </>
              ) : (
                <>
                  <p>
                    {status === 'ended'
                      ? 'The game has closed.'
                      : 'The game could not run. Check your connection and browser support.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus('loading');
                      setAttempt((value) => value + 1);
                    }}
                  >
                    {status === 'ended' ? 'Play again' : 'Try again'}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        {connected ? (
          <div className="activity-call">
            <span>You are still in the call.</span>
            <button type="button" onClick={() => leaveVoice()}>
              Leave call
            </button>
            <ConnectionPanel />
          </div>
        ) : null}
        {call.mediaError || controlError ? (
          <p className="activity-error" role="alert">
            {controlError ?? call.mediaError}
          </p>
        ) : null}
      </section>
      {minimized ? (
        <button
          type="button"
          className="activity-resume"
          onClick={activities.open}
        >
          <ActivityGlyph />
          Return to {game.name}
        </button>
      ) : null}
      {ending ? (
        <Modal
          title="End activity?"
          onClose={() => setEnding(false)}
          footer={
            <>
              <button type="button" onClick={() => setEnding(false)}>
                Keep playing
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void end()}
              >
                End activity
              </button>
            </>
          }
        >
          <p>
            The game saves automatically on this device. Up to 30 seconds of
            recent progress may not have saved yet. Any screen share started
            here will stop.
          </p>
        </Modal>
      ) : null}
    </>,
    document.getElementById('root') ?? document.body,
  );
}

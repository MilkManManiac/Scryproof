/**
 * The two halves of a voice message: the button beside Send that records one,
 * and the player a message draws in place of the file row.
 *
 * Neither knows whether it is in a channel or a DM. The composer hands the
 * recorded file to whatever upload path it already has (sealed first in a DM),
 * and the row hands the player a way to fetch the bytes (opened first in a DM).
 */

import { useEffect, useRef, useState } from 'react';

import { MAX_VOICE_SECONDS, MIN_VOICE_MS, clock, peaks, record, voiceFileName, type Recording } from '../lib/voice-note';

/* --------------------------------- record --------------------------------- */

export function RecordButton({
  disabled,
  onClip,
  onError,
}: {
  disabled?: boolean;
  /** Sends the clip. `seconds` is how long it was held for, for the label. */
  onClip: (file: File, seconds: number) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [elapsed, setElapsed] = useState(0);
  /** `begun` stays null until the microphone is actually open. */
  const session = useRef<{ recording: Recording; begun: number | null } | null>(null);

  function start() {
    if (disabled || session.current || phase === 'sending') return;
    const recording = record();
    const current: { recording: Recording; begun: number | null } = { recording, begun: null };
    session.current = current;
    setElapsed(0);
    setPhase('recording');
    recording.started.then(
      () => {
        if (session.current === current) current.begun = Date.now();
      },
      (problem: unknown) => {
        if (session.current === current) session.current = null;
        setPhase('idle');
        onError(problem instanceof Error ? problem.message : 'The microphone could not be opened.');
      },
    );
  }

  function discard() {
    const current = session.current;
    if (!current) return;
    session.current = null;
    current.recording.cancel();
    setPhase('idle');
  }

  async function finish() {
    const current = session.current;
    if (!current) return;
    session.current = null;
    const held = current.begun === null ? 0 : Date.now() - current.begun;
    if (held < MIN_VOICE_MS) {
      // A tap, or a release while the browser was still asking about the
      // microphone. Either way there is nothing worth sending.
      current.recording.cancel();
      setPhase('idle');
      if (current.begun !== null) onError('Hold the button to record, and let go to send.');
      return;
    }
    setPhase('sending');
    try {
      const blob = await current.recording.stop();
      const file = new File([blob], voiceFileName(), { type: 'audio/webm' });
      await onClip(file, Math.min(MAX_VOICE_SECONDS, held / 1000));
    } catch (problem) {
      onError(problem instanceof Error ? problem.message : 'The voice message did not send.');
    } finally {
      setPhase('idle');
    }
  }

  // The effects below reach the latest finish and discard through these, so
  // the timer and the Escape key never act on a stale draft.
  const finishRef = useRef(finish);
  const discardRef = useRef(discard);
  finishRef.current = finish;
  discardRef.current = discard;

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const begun = session.current?.begun;
      if (!begun) return;
      const seconds = (Date.now() - begun) / 1000;
      setElapsed(seconds);
      // Two minutes is the ceiling: the clip goes as it is rather than being lost.
      if (seconds >= MAX_VOICE_SECONDS) void finishRef.current();
    }, 200);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        discardRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  // Leaving the conversation mid-clip throws the clip away and lets go of the microphone.
  useEffect(() => () => discardRef.current(), []);

  const recording = phase === 'recording';
  return (
    <button
      type="button"
      className={recording ? 'icon-button voice-record on' : 'icon-button voice-record'}
      title={recording ? 'Let go to send. Esc throws it away.' : 'Hold to record a voice message'}
      aria-label={recording ? `Recording, ${clock(elapsed)}. Let go to send, Escape to discard.` : 'Hold to record a voice message'}
      aria-pressed={recording}
      disabled={disabled || phase === 'sending'}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        // Keeps the release on this button even if the pointer drifts off it.
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
      }}
      onPointerUp={() => void finish()}
      onPointerCancel={() => discard()}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          void finish();
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {phase === 'sending' ? (
        <span className="spinner" />
      ) : recording ? (
        <span className="voice-record-live">
          <span className="voice-record-dot" aria-hidden="true" />
          {clock(elapsed)}
        </span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

/* ---------------------------------- play ---------------------------------- */

/** The clip playing right now, anywhere on the page. Starting another stops it. */
let nowPlaying: HTMLAudioElement | null = null;

export function VoicePlayer({
  id,
  name,
  load,
}: {
  /** Changes only when the clip does, so the bytes are fetched once per clip. */
  id: string;
  name: string;
  /** Fetches the clip's bytes, opening them first where they were sealed. */
  load: () => Promise<Uint8Array>;
}) {
  const [bars, setBars] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    let element: HTMLAudioElement | null = null;
    setFailed(false);
    setBars(null);

    (async () => {
      const bytes = await loadRef.current();
      if (cancelled) return;
      // The type is set here, not taken from the server, which files a clip
      // as a plain download.
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/webm' }));
      // Decoding gives the waveform and the true length; a recorded webm
      // does not say how long it is until it has been played through.
      // decodeAudioData takes the buffer it is given, hence the copy.
      const decoded = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      if (cancelled) return;
      element = new Audio(url);
      element.preload = 'auto';
      element.addEventListener('timeupdate', () => setPosition(element?.currentTime ?? 0));
      element.addEventListener('play', () => setPlaying(true));
      element.addEventListener('pause', () => setPlaying(false));
      element.addEventListener('ended', () => {
        setPlaying(false);
        setPosition(0);
      });
      audio.current = element;
      setDuration(decoded.duration);
      setBars(peaks(decoded.getChannelData(0)));
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      if (element) {
        element.pause();
        if (nowPlaying === element) nowPlaying = null;
      }
      audio.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  function toggle() {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    if (nowPlaying && nowPlaying !== element) nowPlaying.pause();
    nowPlaying = element;
    void element.play().catch(() => setFailed(true));
  }

  function seek(fraction: number) {
    const element = audio.current;
    if (!element || !duration) return;
    element.currentTime = Math.min(duration, Math.max(0, fraction * duration));
    setPosition(element.currentTime);
  }

  if (failed) {
    return (
      <div className="voice-note failed" title={name}>
        Voice message could not be played.
      </div>
    );
  }

  const played = duration > 0 ? position / duration : 0;
  return (
    <div className="voice-note" title={name}>
      <button
        type="button"
        className="voice-note-play"
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        disabled={!bars}
        onClick={toggle}
      >
        {!bars ? <span className="spinner" /> : playing ? <>&#10074;&#10074;</> : <>&#9654;</>}
      </button>
      <span
        className="voice-note-wave"
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        tabIndex={bars ? 0 : -1}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          seek((event.clientX - box.left) / box.width);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') seek((position + 5) / (duration || 1));
          if (event.key === 'ArrowLeft') seek((position - 5) / (duration || 1));
        }}
      >
        {(bars ?? new Array<number>(48).fill(0)).map((bar, index, all) => (
          <span
            key={index}
            className={index / all.length < played ? 'voice-note-bar played' : 'voice-note-bar'}
            // A floor so silence still reads as a line rather than nothing.
            style={{ height: `${Math.max(8, Math.round(bar * 100))}%` }}
          />
        ))}
      </span>
      <span className="voice-note-time">{clock(playing || position > 0 ? position : duration)}</span>
    </div>
  );
}

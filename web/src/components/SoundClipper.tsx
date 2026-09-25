/**
 * The step between picking a file and adding it as a sound: choose the part
 * you want, hear it, set how loud it is, name it. Wes, 2026-09-25: "Adding a
 * sound should let you clip it so you can pick exactly what the sound sounds
 * like. And there should be a button to kinda preview the sound so you can
 * adjust the volume level before adding it."
 *
 * The file can be a whole song. It is decoded here and only the chosen part,
 * up to 15 seconds, is encoded and uploaded (`lib/sound-cut.ts`). The volume
 * set here is the sound's own, for everyone; each person's soundboard slider
 * turns all sounds down for them from there.
 *
 * Two waveforms when the file is long: a strip of the whole file, where a
 * click moves the clip, and a closer view around the clip with its two edges
 * to drag. Both edges and the clip itself take the arrow keys too.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { LIMITS, validateSoundName } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import {
  type Selection,
  clipTime,
  firstSelection,
  fitsView,
  moveEdge,
  moveWhole,
  peaks,
  viewAround,
} from '../lib/sound-clip';
import { canCut, cutClip, readSource, uploadAsIs } from '../lib/sound-cut';
import { SoundFileError, soundGain } from '../lib/sounds';
import { audioContext } from '../lib/voice-audio';

type Drag = { part: 'start' | 'end' | 'whole'; grab: number; from: Selection } | null;

export function SoundClipper({
  file,
  serverId,
  serverName,
  onDone,
  onCancel,
}: {
  file: File;
  serverId: string;
  serverName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [view, setView] = useState<Selection>({ start: 0, end: 0 });
  const [name, setName] = useState(() => file.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.soundName.max));
  const [volume, setVolume] = useState<number>(LIMITS.soundVolume.default);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const drag = useRef<Drag>(null);
  const wave = useRef<HTMLDivElement>(null);
  const detailCanvas = useRef<HTMLCanvasElement>(null);
  const overviewCanvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<{ source: AudioBufferSourceNode; level: GainNode } | null>(null);

  useEffect(() => {
    let live = true;
    setSource(null);
    setError(null);
    readSource(file).then(
      (buffer) => {
        if (!live) return;
        const first = firstSelection(buffer.duration);
        setSource(buffer);
        setSelection(first);
        setView(viewAround(first, buffer.duration));
      },
      (problem) => {
        if (live) setError(problem instanceof SoundFileError ? problem.message : 'That file could not be read.');
      },
    );
    return () => {
      live = false;
    };
  }, [file]);

  const duration = source?.duration ?? 0;
  const long = duration > view.end - view.start + 0.01;

  const stop = useCallback(() => {
    const playing = player.current;
    player.current = null;
    if (playing) {
      playing.source.onended = null;
      playing.source.stop();
      playing.source.disconnect();
      playing.level.disconnect();
    }
    setPlayhead(null);
  }, []);

  useEffect(() => stop, [stop]);

  function play() {
    if (!source) return;
    stop();
    const context = audioContext();
    void context.resume();
    const node = context.createBufferSource();
    node.buffer = source;
    const level = context.createGain();
    level.gain.value = soundGain(volume);
    node.connect(level);
    level.connect(context.destination);
    const began = context.currentTime;
    const { start, end } = selection;
    node.onended = () => {
      if (player.current?.source === node) stop();
    };
    player.current = { source: node, level };
    node.start(0, start, end - start);
    const tick = () => {
      if (player.current?.source !== node) return;
      setPlayhead(Math.min(end, start + context.currentTime - began));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // The volume slider is heard while the clip plays.
  useEffect(() => {
    if (player.current) player.current.level.gain.value = soundGain(volume);
  }, [volume]);

  /* -------------------------------- drawing -------------------------------- */

  const draw = useCallback(
    (canvas: HTMLCanvasElement | null, from: Selection, chosen: Selection) => {
      if (!canvas || !source) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const paint = canvas.getContext('2d');
      if (!paint) return;
      const style = getComputedStyle(canvas);
      const dim = style.getPropertyValue('--text-faint').trim() || '#777';
      const lit = style.getPropertyValue('--accent').trim() || '#e8833a';
      const bar = Math.max(2, Math.round(2 * ratio));
      const gap = Math.max(1, Math.round(ratio));
      const columns = Math.floor(width / (bar + gap));
      const channels = Array.from({ length: Math.min(2, source.numberOfChannels) }, (_, index) =>
        source.getChannelData(index),
      );
      const heights = peaks(channels, source.sampleRate, from.start, from.end, columns);
      const span = from.end - from.start || 1;
      paint.clearRect(0, 0, width, height);
      heights.forEach((peak, column) => {
        const at = from.start + ((column + 0.5) / columns) * span;
        paint.fillStyle = at >= chosen.start && at <= chosen.end ? lit : dim;
        const tall = Math.max(ratio, peak * height * 0.92);
        paint.fillRect(column * (bar + gap), (height - tall) / 2, bar, tall);
      });
    },
    [source],
  );

  useLayoutEffect(() => {
    draw(detailCanvas.current, view, selection);
    if (long) draw(overviewCanvas.current, { start: 0, end: duration }, selection);
  }, [draw, view, selection, long, duration]);

  useEffect(() => {
    const box = wave.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      draw(detailCanvas.current, view, selection);
      if (long) draw(overviewCanvas.current, { start: 0, end: duration }, selection);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [draw, view, selection, long, duration]);

  /* ------------------------------- dragging -------------------------------- */

  const timeAt = (clientX: number): number => {
    const box = wave.current?.getBoundingClientRect();
    if (!box || box.width === 0) return view.start;
    const fraction = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return view.start + fraction * (view.end - view.start);
  };

  function onWaveDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!source) return;
    event.preventDefault();
    stop();
    const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part;
    const at = timeAt(event.clientX);
    let next = selection;
    if (part !== 'start' && part !== 'end' && part !== 'whole') {
      // A click on the wave moves the nearer edge there.
      const edge = Math.abs(at - selection.start) <= Math.abs(at - selection.end) ? 'start' : 'end';
      next = moveEdge(selection, edge, at, duration);
      setSelection(next);
      drag.current = { part: edge, grab: at, from: next };
    } else {
      drag.current = { part, grab: at, from: selection };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onWaveMove(event: ReactPointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (!held) return;
    const at = timeAt(event.clientX);
    if (held.part === 'whole') setSelection(moveWhole(held.from, held.from.start + at - held.grab, duration));
    else setSelection(moveEdge(held.from, held.part, at, duration));
  }

  function onWaveUp() {
    if (!drag.current) return;
    drag.current = null;
    // The view follows the clip once you let go, never while dragging.
    if (!fitsView(selection, view)) setView(viewAround(selection, duration));
  }

  function onOverview(event: ReactPointerEvent<HTMLDivElement>) {
    if (!source || (event.type === 'pointermove' && event.buttons === 0)) return;
    if (event.type === 'pointerdown') {
      stop();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const box = event.currentTarget.getBoundingClientRect();
    const at = (Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) || 0) * duration;
    const length = selection.end - selection.start;
    const next = moveWhole(selection, at - length / 2, duration);
    setSelection(next);
    setView(viewAround(next, duration));
  }

  function nudge(event: ReactKeyboardEvent<HTMLElement>, part: 'start' | 'end' | 'whole') {
    const step = event.shiftKey ? 1 : 0.1;
    const way =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? 1
          : 0;
    if (way === 0) return;
    event.preventDefault();
    stop();
    const next =
      part === 'whole'
        ? moveWhole(selection, selection.start + way * step, duration)
        : moveEdge(selection, part, selection[part] + way * step, duration);
    setSelection(next);
    if (!fitsView(next, view)) setView(viewAround(next, duration));
  }

  /* -------------------------------- adding --------------------------------- */

  const check = name.trim() === '' ? null : validateSoundName(name);

  async function add() {
    if (!source || !check?.ok) return;
    stop();
    setAdding(true);
    setError(null);
    try {
      const clip = (await canCut())
        ? await cutClip(source, selection, name)
        : await uploadAsIs(file, source, selection);
      await api.sounds.add(serverId, name.trim(), clip, volume);
      // The gateway's sounds_changed brings the new tile.
      onDone();
    } catch (problem) {
      if (problem instanceof SoundFileError) setError(problem.message);
      else setError(problem instanceof ApiError ? problem.message : 'Could not add the sound.');
    } finally {
      setAdding(false);
    }
  }

  const span = view.end - view.start || 1;
  const left = ((selection.start - view.start) / span) * 100;
  const right = ((selection.end - view.start) / span) * 100;
  const length = selection.end - selection.start;

  return (
    <div
      className="clipper"
      onKeyDown={(event) => {
        // Escape drops the new sound, not whatever this sits in.
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      {!source && !error ? <p className="clipper-note">Reading {file.name}</p> : null}
      {error ? <p className="clipper-error">{error}</p> : null}
      {source ? (
        <>
          {long ? (
            <div
              className="clipper-overview"
              onPointerDown={onOverview}
              onPointerMove={onOverview}
              title="The whole file. Click to move the clip there."
            >
              <canvas ref={overviewCanvas} />
              <div
                className="clipper-overview-window"
                style={{
                  left: `${(view.start / duration) * 100}%`,
                  width: `${((view.end - view.start) / duration) * 100}%`,
                }}
              />
            </div>
          ) : null}
          <div
            className="clipper-wave"
            ref={wave}
            onPointerDown={onWaveDown}
            onPointerMove={onWaveMove}
            onPointerUp={onWaveUp}
            onPointerCancel={onWaveUp}
          >
            <canvas ref={detailCanvas} />
            <div
              className="clipper-chosen"
              data-part="whole"
              style={{ left: `${left}%`, width: `${right - left}%` }}
              tabIndex={0}
              role="group"
              aria-label={`The clip, ${clipTime(selection.start)} to ${clipTime(selection.end)}. Arrow keys move it.`}
              onKeyDown={(event) => nudge(event, 'whole')}
            />
            {(['start', 'end'] as const).map((edge) => (
              <div
                key={edge}
                className={`clipper-edge clipper-edge-${edge}`}
                data-part={edge}
                style={{ left: `${edge === 'start' ? left : right}%` }}
                tabIndex={0}
                role="slider"
                aria-label={edge === 'start' ? 'Where the clip starts' : 'Where the clip ends'}
                aria-valuemin={0}
                aria-valuemax={Math.round(duration * 10) / 10}
                aria-valuenow={Math.round(selection[edge] * 10) / 10}
                aria-valuetext={clipTime(selection[edge])}
                onKeyDown={(event) => nudge(event, edge)}
              >
                <span />
              </div>
            ))}
            {playhead !== null ? (
              <div className="clipper-playhead" style={{ left: `${((playhead - view.start) / span) * 100}%` }} />
            ) : null}
          </div>
          <div className="clipper-times">
            <span>{clipTime(selection.start)}</span>
            <span className="clipper-length">
              {length.toFixed(1)} s of {LIMITS.soundSeconds}
            </span>
            <span>{clipTime(selection.end)}</span>
          </div>
          <div className="clipper-controls">
            <button
              type="button"
              className="button secondary inline clipper-play"
              onClick={() => (playhead !== null ? stop() : play())}
            >
              {playhead !== null ? 'Stop' : 'Play'}
            </button>
            <label
              className="clipper-volume"
              title="How loud it plays for everyone. Each person can still turn the soundboard down for themselves."
            >
              <span>Volume</span>
              <input
                type="range"
                className="voice-range"
                min={LIMITS.soundVolume.min}
                max={LIMITS.soundVolume.max}
                step={5}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="How loud this sound plays"
              />
              <span className="clipper-volume-number">{volume}%</span>
            </label>
          </div>
        </>
      ) : null}
      <form
        className="clipper-save"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={name}
          maxLength={LIMITS.soundName.max}
          aria-label="Name of the new sound"
          placeholder="Airhorn"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button inline" disabled={adding || !source || !check?.ok}>
          {adding ? 'Adding' : 'Add'}
        </button>
        <button type="button" className="button secondary inline" disabled={adding} onClick={onCancel}>
          Cancel
        </button>
        {check && !check.ok ? (
          <p className="clipper-note">{check.error}</p>
        ) : (
          <p className="clipper-note">
            Drag the edges to pick up to {LIMITS.soundSeconds} seconds. Only that part is uploaded. Everyone in{' '}
            {serverName} can play it.
          </p>
        )}
      </form>
    </div>
  );
}

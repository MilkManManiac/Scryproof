/**
 * Where the characters run.
 *
 * A fixed layer over the whole window that nothing can click. When asked
 * (`lib/stage`), a character enters from one side low in the room and hops
 * across to the other: each hop plays the five jump frames once while it
 * rises and falls on a small arc, and the hops keep coming until it is off
 * the far edge. Two or three seconds, then gone. Several can be crossing at
 * once, each on its own line so they do not stack.
 *
 * Drawn with one element per runner and `requestAnimationFrame`; frames are
 * cut from the sheet by background position, scaled up whole so the pixels
 * stay square. Under "reduce motion" nothing runs and the request is dropped.
 */

import { useEffect, useRef, useState } from 'react';

import { FRAME, characterById, sheetUrl, spawnOf } from '../lib/commands';
import { onPlay, play } from '../lib/stage';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';

interface Runner {
  key: number;
  id: string;
  frames: number;
  /** Which way it is going: 1 is left to right. */
  direction: 1 | -1;
  /** The line it lands on, from the top of the window. */
  ground: number;
  /** How far one hop carries, and how long one takes. */
  hop: number;
  hopMs: number;
  /** Peak height of a hop. */
  rise: number;
  scale: number;
  startedAt: number;
}

let nextKey = 1;

const HOP_MS = 520;
const HOP_PX = 300;
const RISE_PX = 150;

function reduceMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function Stage() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<number, HTMLDivElement>());
  const { state, onGatewayEvent } = useStore();
  const { state: dms } = useDms();

  // A spawn message arriving anywhere in the server being looked at crosses
  // the room, for the sender and everyone else there alike. The server, not
  // the channel: the first night, Wes's friends joined voice, which put the
  // voice channel in front of them, and his jumps in the text channel went
  // to their history and nowhere else. Someone in the DM view, or in another
  // server, gets the line in the history and nothing more. (DMs do the same
  // from their own store, after decrypting.)
  const looking = useRef<string | null>(null);
  looking.current = dms.active ? null : state.selectedServerId;
  const servers = useRef(state.servers);
  servers.current = state.servers;
  // A jump that lands while the window is hidden would run its whole crossing
  // with no frames drawn. It waits for the window instead, a few at most, and
  // only for a short while: a jump from an hour ago is not news.
  const waiting = useRef<{ id: string; at: number }[]>([]);
  useEffect(
    () =>
      onGatewayEvent((event) => {
        if (event.t !== 'message_create' || !looking.current) return;
        const server = servers.current[looking.current];
        if (!server?.channels.some((channel) => channel.id === event.d.channelId)) return;
        const character = spawnOf(event.d.content);
        if (!character) return;
        if (document.hidden) waiting.current = [...waiting.current, { id: character.id, at: Date.now() }].slice(-3);
        else play(character.id);
      }),
    [onGatewayEvent],
  );
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      const fresh = waiting.current.filter((entry) => Date.now() - entry.at < 30_000);
      waiting.current = [];
      for (const entry of fresh) play(entry.id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(
    () =>
      onPlay((id) => {
        const character = characterById(id);
        if (!character || reduceMotion()) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        // Big on a monitor, whole pixels; a phone gets the sheet's own size.
        const scale = width >= 1100 ? 2 : 1;
        // Low in the room, above the message box, and a different line for
        // each one crossing right now.
        const ground = height * 0.78 - Math.random() * height * 0.28;
        const runner: Runner = {
          key: nextKey++,
          id: character.id,
          frames: character.frames,
          direction: Math.random() < 0.5 ? 1 : -1,
          ground,
          hop: HOP_PX * (scale / 2 + 0.5),
          hopMs: HOP_MS,
          rise: RISE_PX * (scale / 2 + 0.5),
          scale,
          startedAt: performance.now(),
        };
        setRunners((current) => [...current, runner]);
      }),
    [],
  );

  useEffect(() => {
    if (runners.length === 0) return;
    let frame = 0;
    const done = new Set<number>();
    const tick = (now: number) => {
      const width = window.innerWidth;
      for (const runner of runners) {
        const element = elements.current.get(runner.key);
        if (!element) continue;
        const size = FRAME * runner.scale;
        const elapsed = now - runner.startedAt;
        const hops = elapsed / runner.hopMs;
        const distance = hops * runner.hop;
        const x = runner.direction === 1 ? -size + distance : width - distance;
        if ((runner.direction === 1 && x > width) || (runner.direction === -1 && x < -size)) {
          done.add(runner.key);
          element.style.visibility = 'hidden';
          continue;
        }
        // Where in this hop: 0 crouched, 0.5 at the top, 1 landed.
        const t = hops - Math.floor(hops);
        const y = runner.ground - size - 4 * runner.rise * t * (1 - t);
        const index = Math.min(runner.frames - 1, Math.floor(t * runner.frames));
        element.style.transform = `translate(${x}px, ${y}px) scaleX(${runner.direction})`;
        element.style.backgroundPosition = `-${index * size}px 0`;
      }
      if (done.size > 0) setRunners((current) => current.filter((runner) => !done.has(runner.key)));
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [runners]);

  if (runners.length === 0) return null;

  return (
    <div className="stage" ref={layer} aria-hidden="true">
      {runners.map((runner) => {
        const size = FRAME * runner.scale;
        return (
          <div
            key={runner.key}
            className="stage-runner"
            ref={(node) => {
              if (node) elements.current.set(runner.key, node);
              else elements.current.delete(runner.key);
            }}
            style={{
              width: size,
              height: size,
              backgroundImage: `url(${sheetUrl(runner.id)})`,
              backgroundSize: `${size * runner.frames}px ${size}px`,
              transform: `translate(-${size}px, 0)`,
            }}
          />
        );
      })}
    </div>
  );
}

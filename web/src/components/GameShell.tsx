/**
 * What Queefs, Travhole and Threeway have in common: the card they open in,
 * the buttons under a finished day, and the board of who else has played.
 * The look is Purdle's (`.purdle-*`), so all six sit alike.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useLayer } from '../lib/back';
import type { Daily } from '../lib/daily';
import { channelDrafts } from '../lib/drafts';
import { nameOf } from '../lib/mentions';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { GameBoard, type StandingLine } from './GameBoard';
import { useCountdown } from './Purdle';

export type Say = (text: string, good?: boolean) => void;

/** A line of text over the game for a moment. */
export function useToast(): { toast: { text: string; good: boolean } | null; say: Say } {
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback<Say>((text, good = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, good });
    timer.current = setTimeout(() => setToast(null), 1800);
  }, []);
  return { toast, say };
}

export function GameShell({
  name,
  kind,
  day,
  toast,
  loading,
  onClose,
  children,
}: {
  name: string;
  /** The game's own class on the card, for its colours and width. */
  kind: string;
  day: number | null;
  toast: { text: string; good: boolean } | null;
  loading: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useLayer(onClose);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="purdle-backdrop" role="presentation" onMouseDown={onClose}>
      <div className={`purdle ${kind}`} role="dialog" aria-modal="true" aria-label={name} onMouseDown={(event) => event.stopPropagation()}>
        <header className="purdle-head">
          <div className="purdle-title">
            {name}
            {day !== null ? <span className="purdle-number">#{day}</span> : null}
          </div>
          <button type="button" className="icon-button purdle-close" aria-label="Close" title="Close" onClick={onClose}>
            &#10005;
          </button>
        </header>
        {toast ? (
          <div className={`purdle-toast${toast.good ? ' game-toast-good' : ''}`} role="status">
            {toast.text}
          </div>
        ) : null}
        {loading ? (
          <div className="purdle-loading">
            <div className="spinner" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}

export function StatText({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="purdle-stat">
      <span className="purdle-stat-value">{value}</span>
      <span className="purdle-stat-label">{label}</span>
    </div>
  );
}

/** Copy, put in the channel behind the game, and how long until the next one. */
export function ResultActions({
  share,
  nextAt,
  what,
  say,
  onClose,
  onTurnover,
}: {
  share: string;
  nextAt: string;
  /** "Next board", "Next route". */
  what: string;
  say: Say;
  onClose: () => void;
  onTurnover: () => void;
}) {
  const { state } = useStore();
  const dms = useDms();
  const left = useCountdown(nextAt, onTurnover);
  const server = state.selectedServerId ? state.servers[state.selectedServerId] : undefined;
  const channel = !dms.state.active && server ? server.channels.find((entry) => entry.id === state.selectedChannelId) : undefined;
  const chat = channel?.type === 'text' ? channel : undefined;
  return (
    <>
      <div className="purdle-actions">
        <button
          type="button"
          className="button inline"
          onClick={() => void navigator.clipboard.writeText(share).then(() => say('Copied', true), () => undefined)}
        >
          Copy result
        </button>
        {chat ? (
          <button
            type="button"
            className="button secondary inline"
            title="Puts it in the message box there, for you to send"
            onClick={() => {
              channelDrafts.set(chat.id, share);
              onClose();
            }}
          >
            Put in #{chat.name}
          </button>
        ) : null}
      </div>
      <div className="purdle-next">
        {what} in <b>{left}</b>
      </div>
    </>
  );
}

/** The server whose board goes under a game: the one open, or the first. */
export function useBoardServer(): { id: string; name: string } | null {
  const { state } = useStore();
  const server =
    (state.selectedServerId ? state.servers[state.selectedServerId] : undefined) ??
    (state.serverOrder[0] ? state.servers[state.serverOrder[0]] : undefined);
  return server ? { id: server.id, name: server.name } : null;
}

export interface FinishLine {
  userId: string;
  /** Said small, before the score: "2 in a row". */
  note?: string;
  score: string;
  lost?: boolean;
}

/**
 * Who in this server has done today's, fetched again whenever someone
 * finishes (you included), and everyone's record here.
 */
export function ServerBoard<Result extends { day: number }>({
  game,
  load,
  day,
  mine,
  finishes,
  columns,
  standings,
  empty = 'Nobody here has done today’s yet.',
}: {
  game: Pick<Daily<unknown>, 'onDone'>;
  load: (serverId: string) => Promise<Result>;
  day: number;
  /** Changes when your own day does, so your line is fetched too. */
  mine: string;
  /** Best first. */
  finishes: (result: Result) => FinishLine[];
  columns: string[];
  standings: (result: Result) => StandingLine[];
  empty?: string;
}) {
  const server = useBoardServer();
  const { state } = useStore();
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const serverId = server?.id;

  useEffect(() => {
    if (!serverId) return undefined;
    let live = true;
    const fetchBoard = () =>
      load(serverId).then(
        (next) => live && setResult(next),
        () => live && setFailed(true),
      );
    void fetchBoard();
    const stop = game.onDone((done) => {
      if (done.serverId === serverId) void fetchBoard();
    });
    return () => {
      live = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, day, mine]);

  if (!server) return null;
  const members = state.members[server.id] ?? [];
  const lines = result && result.day === day ? finishes(result) : [];
  const today =
    result === null && !failed ? null : lines.length === 0 ? (
      <p className="purdle-board-empty">{empty}</p>
    ) : (
      <ul className="purdle-board-list">
        {lines.map((line) => {
          const member = members.find((candidate) => candidate.userId === line.userId);
          if (!member) return null;
          return (
            <li key={line.userId} className="purdle-board-row">
              <Avatar user={member.user} name={nameOf(member)} small />
              <span className="purdle-board-name">{nameOf(member)}</span>
              {line.note ? <span className="purdle-board-streak">{line.note}</span> : null}
              <span className={`purdle-board-score game-score${line.lost ? ' lost' : ''}`}>{line.score}</span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <GameBoard serverId={server.id} serverName={server.name} today={today} columns={columns} standings={result ? standings(result) : null} />
  );
}

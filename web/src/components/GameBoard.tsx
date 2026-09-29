/**
 * The board under a daily game: who in this server has done today's, and
 * everyone's record here since they started. Wes, 2026-09-28: "maybe for
 * both of those it shows you like a total overtime? like how good people are
 * since they started playing". Shared by Purdle and Cuntections; each game
 * says what its columns are and how people are ranked.
 */

import { useState, type ReactNode } from 'react';

import { nameOf } from '../lib/mentions';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';

export interface StandingLine {
  userId: string;
  cells: ReactNode[];
}

export function GameBoard({
  serverId,
  serverName,
  today,
  columns,
  standings,
}: {
  serverId: string;
  serverName: string;
  today: ReactNode;
  columns: string[];
  /** Best first; null while loading. */
  standings: StandingLine[] | null;
}) {
  const [tab, setTab] = useState<'today' | 'all'>('today');
  const { state } = useStore();
  const members = state.members[serverId] ?? [];

  return (
    <section className="purdle-board" aria-label={`${serverName}: ${tab === 'today' ? 'today' : 'all time'}`}>
      <div className="game-board-head">
        <span className="purdle-board-head">{serverName}</span>
        <div className="game-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'today'} className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}>
            Today
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
            All time
          </button>
        </div>
      </div>

      {tab === 'today' ? (
        today
      ) : standings === null ? null : standings.length === 0 ? (
        <p className="purdle-board-empty">Nobody here has finished one yet.</p>
      ) : (
        <table className="game-standings">
          <thead>
            <tr>
              <th aria-label="Place" />
              <th className="who">Who</th>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((line, at) => {
              const member = members.find((candidate) => candidate.userId === line.userId);
              if (!member) return null;
              return (
                <tr key={line.userId} className={line.userId === state.user?.id ? 'me' : undefined}>
                  <td className="place">{at + 1}</td>
                  <td className="who">
                    <span className="game-standings-who">
                      <Avatar user={member.user} name={nameOf(member)} small />
                      <span className="purdle-board-name">{nameOf(member)}</span>
                    </span>
                  </td>
                  {line.cells.map((cell, index) => (
                    <td key={columns[index]}>{cell}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** "3.86", or a dash before there is anything to average. */
export function average(value: number | null): string {
  return value === null ? '–' : value.toFixed(1);
}

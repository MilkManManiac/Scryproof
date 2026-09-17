/**
 * The quick switcher, and the keyboard shortcuts that open it.
 *
 * It only ever lists channels the client already has, which is the same thing
 * as channels this person is allowed to see: the server never sends the
 * others, so there is nothing here to filter out and nothing to leak by
 * matching against.
 *
 * Nothing is fetched while typing. The whole list is already in memory, so a
 * search is a loop, not a request — no keystroke leaves the machine.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { fuzzyScore } from '../lib/fuzzy';
import { unreadFor, useStore } from '../state/store';

interface Hit {
  channelId: string;
  serverId: string;
  serverName: string;
  channelName: string;
  type: string;
  unread: boolean;
  mentions: number;
  score: number;
}

export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const { state, selectServer, selectChannel } = useStore();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => input.current?.focus(), []);

  const hits = useMemo<Hit[]>(() => {
    const needle = query.trim().toLowerCase();
    const found: Hit[] = [];

    for (const serverId of state.serverOrder) {
      const server = state.servers[serverId];
      if (!server) continue;
      for (const channel of server.channels) {
        const score = fuzzyScore(channel.name.toLowerCase(), needle);
        if (score === null) continue;
        const { unread, mentions } = unreadFor(state, channel);
        found.push({
          channelId: channel.id,
          serverId,
          serverName: server.name,
          channelName: channel.name,
          type: channel.type,
          unread,
          mentions,
          score,
        });
      }
    }

    // With nothing typed this is a "what did I miss" list, so what is unread
    // floats. Once there is a query, the query decides and nothing else.
    found.sort((a, b) => {
      if (needle === '') {
        if (b.mentions !== a.mentions) return b.mentions - a.mentions;
        if (b.unread !== a.unread) return b.unread ? 1 : -1;
        return a.channelName.localeCompare(b.channelName);
      }
      return b.score - a.score || a.channelName.localeCompare(b.channelName);
    });

    return found.slice(0, 25);
  }, [state, query]);

  useEffect(() => setCursor(0), [query]);

  // Keep the highlighted row in view when arrowing past the bottom edge.
  useEffect(() => {
    list.current?.querySelector('.switcher-hit.on')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    if (hit.serverId !== state.selectedServerId) selectServer(hit.serverId);
    selectChannel(hit.channelId);
    onClose();
  }

  return (
    <div className="switcher-backdrop" onMouseDown={onClose}>
      <div
        className="switcher"
        role="dialog"
        aria-label="Go to a channel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          className="switcher-input"
          value={query}
          placeholder="Go to a channel"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') return onClose();
            if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
              event.preventDefault();
              return setCursor((at) => (hits.length === 0 ? 0 : (at + 1) % hits.length));
            }
            if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
              event.preventDefault();
              return setCursor((at) => (hits.length === 0 ? 0 : (at - 1 + hits.length) % hits.length));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              return go(hits[cursor]);
            }
          }}
        />

        <div className="switcher-hits" ref={list}>
          {hits.length === 0 ? (
            <div className="switcher-empty">No channel by that name.</div>
          ) : (
            hits.map((hit, index) => (
              <button
                key={hit.channelId}
                type="button"
                className={
                  index === cursor
                    ? hit.unread
                      ? 'switcher-hit on unread'
                      : 'switcher-hit on'
                    : hit.unread
                      ? 'switcher-hit unread'
                      : 'switcher-hit'
                }
                onMouseMove={() => setCursor(index)}
                onClick={() => go(hit)}
              >
                <span className="channel-sigil">{hit.type === 'voice' ? '♫' : '#'}</span>
                <span className="switcher-name">{hit.channelName}</span>
                {hit.mentions > 0 ? <span className="badge">{hit.mentions}</span> : null}
                <span className="switcher-server">{hit.serverName}</span>
              </button>
            ))
          )}
        </div>

        <div className="switcher-footer">
          <span>
            <kbd>&uarr;</kbd>
            <kbd>&darr;</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to go
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

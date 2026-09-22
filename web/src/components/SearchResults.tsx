/**
 * Results of a message search across every channel of this server the
 * caller can see. Drawn where the member list sits, the way PinnedMessages
 * draws its own list: fetched fresh, one loading state, one empty state.
 *
 * The server has already done the hard part — only channels the caller can
 * view and read history in were ever searched — so this component only has
 * to show what came back.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { Message, ServerDetail } from '@scryproof/shared';

import { api } from '../lib/api';
import { nameOf, toPlainLine } from '../lib/mentions';
import { useStore } from '../state/store';
import { jumpTo } from './MessageList';

/** Matches the server's page size, so a full page implies there may be more. */
const PAGE_SIZE = 25;

const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Escape a word for use inside a regular expression. */
function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Wrap every case-insensitive occurrence of a search word in <mark>. */
function highlight(text: string, words: string[]): ReactNode[] {
  if (words.length === 0) return [text];
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  return text.split(pattern).map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part));
}

export function SearchResults({
  server,
  query,
  onClose,
}: {
  server: ServerDetail;
  query: string;
  onClose: () => void;
}) {
  const { state, selectChannel } = useStore();
  const members = state.members[server.id] ?? [];
  const words = query.trim().split(/\s+/).filter(Boolean);

  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setMore(false);
    setError(false);
    setLoading(true);
    api.messages
      .search(server.id, query)
      .then(({ messages }) => {
        if (cancelled) return;
        setResults(messages);
        setMore(messages.length === PAGE_SIZE);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, query]);

  function loadMore() {
    const last = results.at(-1);
    if (!last || loadingMore) return;
    setLoadingMore(true);
    api.messages
      .search(server.id, query, last.id)
      .then(({ messages }) => {
        setResults((current) => [...current, ...messages]);
        setMore(messages.length === PAGE_SIZE);
      })
      .catch(() => setError(true))
      .finally(() => setLoadingMore(false));
  }

  // A result from a channel that is not the one open right now has to select
  // it first; the row it is jumping to only exists once that channel has
  // mounted and loaded, same as following a reply or a pin.
  function goTo(result: Message) {
    selectChannel(result.channelId);
    requestAnimationFrame(() => requestAnimationFrame(() => jumpTo(result.id)));
  }

  const channelName = (channelId: string) => server.channels.find((entry) => entry.id === channelId)?.name ?? 'a channel';
  const authorName = (result: Message) => {
    const member = members.find((entry) => entry.userId === result.authorId);
    return member ? nameOf(member) : result.author.displayName;
  };

  return (
    <aside className="members search-results" aria-label="Search results">
      <div className="search-results-head">
        <strong>Search</strong>
        <button type="button" className="icon-button" title="Close search" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="search-results-list">
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
            <div className="spinner" />
          </div>
        ) : null}
        {error ? <p className="notices-empty">The search could not be completed.</p> : null}
        {!loading && !error && results.length === 0 ? (
          <p className="notices-empty">Nothing in this server says that.</p>
        ) : null}
        {results.map((result) => (
          <button type="button" className="search-result" key={result.id} onClick={() => goTo(result)}>
            <span className="search-result-meta">
              <strong>#{channelName(result.channelId)}</strong> · {authorName(result)} ·{' '}
              {when.format(new Date(result.createdAt))}
            </span>
            <span className="search-result-text">
              {/* A hit on a blocked person's message still says where it is,
                  without quoting them. There is nothing to reveal in a list. */}
              {state.blocks.has(result.authorId)
                ? 'Blocked message.'
                : result.content
                  ? highlight(toPlainLine(result.content, members), words)
                  : result.attachments.length > 0
                    ? `${result.attachments.length} file(s)`
                    : 'A locked message'}
            </span>
          </button>
        ))}
        {more && !loading ? (
          <button type="button" className="search-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'More'}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

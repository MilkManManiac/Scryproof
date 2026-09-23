/**
 * The bell, and the list behind it: what was addressed to you, when, and from
 * where. The filters across the top are the point of it. After a loud evening
 * the question is rarely "what did I miss" and usually "where was all that
 * coming from".
 *
 * Nothing here asks the server anything. See lib/notices.ts.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { BookmarkedMessage } from '@scryproof/shared';

import { api } from '../lib/api';
import { toPlainLine } from '../lib/mentions';
import { bySource, notices } from '../lib/notices';
import type { Notice } from '../lib/notices';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';

const useNotices = (): readonly Notice[] => useSyncExternalStore(notices.subscribe, notices.get);

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function dayLabel(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dayFormat.format(date);
}

/** The row may not exist yet: the channel has to load first. Look for a few seconds, then give up quietly. */
function flashWhenThere(elementId: string): void {
  let tries = 0;
  const look = () => {
    const row = document.getElementById(elementId);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.classList.remove('flash');
      void row.offsetWidth;
      row.classList.add('flash');
    } else if ((tries += 1) < 20) {
      setTimeout(look, 150);
    }
  };
  setTimeout(look, 50);
}

export function NoticeBell() {
  const list = useNotices();
  const { state, selectServer, selectChannel } = useStore();
  const dms = useDms();
  const [open, setOpen] = useState(false);
  const unread = list.reduce((count, entry) => count + (entry.read ? 0 : 1), 0);

  // A pop-up clicked from the desktop comes through here as well.
  useEffect(() => {
    notices.onOpen((notice) => {
      setOpen(false);
      if (notice.dmId) {
        dms.openDm(notice.dmId);
        flashWhenThere(`dm-message-${notice.id}`);
        return;
      }
      if (!notice.serverId || !state.servers[notice.serverId]) return;
      // An event reminder may have no channel: it goes to the server, where
      // the event is at the top of the sidebar.
      if (!notice.channelId && notice.kind !== 'event') return;
      dms.hideDms();
      if (notice.serverId !== state.selectedServerId) selectServer(notice.serverId);
      if (notice.channelId) selectChannel(notice.channelId);
      if (notice.kind !== 'event') flashWhenThere(`message-${notice.id}`);
    });
    return () => notices.onOpen(null);
  }, [dms, state.servers, state.selectedServerId, selectServer, selectChannel]);

  return (
    <>
      <button
        type="button"
        className={`rail-item rail-bell${unread > 0 ? ' unread' : ''}`}
        title={unread > 0 ? `Notifications — ${unread} new` : 'Notifications'}
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
          <path d="M10 20a2.2 2.2 0 0 0 4 0" />
        </svg>
        {unread > 0 ? <span className="badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? <NoticeTimeline list={list} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NoticeTimeline({ list, onClose }: { list: readonly Notice[]; onClose: () => void }) {
  const [tab, setTab] = useState<'notices' | 'saved'>('notices');
  const [source, setSource] = useState<string | null>(null);
  const sources = useMemo(() => bySource(list), [list]);
  const shown = source ? list.filter((entry) => (entry.serverId ?? 'dm') === source) : list;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let lastDay = '';

  return (
    <div className="switcher-backdrop" onMouseDown={onClose}>
      <div
        className={tab === 'saved' ? 'switcher notices pins' : 'switcher notices'}
        role="dialog"
        aria-label="Notifications"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="notices-head">
          <strong>Notifications</strong>
          {tab === 'notices' ? (
            <span className="notices-actions">
              <button type="button" className="link-button" disabled={!list.some((entry) => !entry.read)} onClick={() => notices.readAll()}>
                Mark all read
              </button>
              <button type="button" className="link-button" disabled={list.length === 0} onClick={() => notices.clear()}>
                Clear
              </button>
            </span>
          ) : null}
        </div>

        <div className="notices-sources">
          <button type="button" className={tab === 'notices' ? 'notices-source active' : 'notices-source'} onClick={() => setTab('notices')}>
            Notifications
          </button>
          <button type="button" className={tab === 'saved' ? 'notices-source active' : 'notices-source'} onClick={() => setTab('saved')}>
            Saved
          </button>
        </div>

        {tab === 'saved' ? (
          <SavedTab onClose={onClose} />
        ) : (
          <>
            {sources.length > 1 ? (
              <div className="notices-sources">
                <button type="button" className={source === null ? 'notices-source active' : 'notices-source'} onClick={() => setSource(null)}>
                  Everywhere <span>{list.length}</span>
                </button>
                {sources.map((entry) => (
                  <button
                    type="button"
                    key={entry.key}
                    className={source === entry.key ? 'notices-source active' : 'notices-source'}
                    onClick={() => setSource(entry.key)}
                  >
                    {entry.label} <span>{entry.total}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="notices-list">
              {shown.length === 0 ? (
                <p className="notices-empty">
                  Mentions, direct messages and reminders for events you are going to that arrive while you are somewhere else are listed here, with where they
                  came from. The list is kept on this device only.
                </p>
              ) : null}
              {shown.map((entry) => {
                const day = dayLabel(entry.at);
                const heading = day !== lastDay ? <div className="notices-day">{day}</div> : null;
                lastDay = day;
                return (
                  <div key={entry.id}>
                    {heading}
                    <button type="button" className={entry.read ? 'notice' : 'notice unread'} onClick={() => notices.open(entry)}>
                      <span className="notice-time">{timeFormat.format(entry.at)}</span>
                      <span className="notice-body">
                        <span className="notice-where">
                          {entry.kind === 'dm'
                            ? entry.channelName
                              ? `Group › ${entry.channelName}`
                              : 'Direct message'
                            : entry.kind === 'event'
                              ? `${entry.serverName ?? 'A server'} › Coming up`
                              : `${entry.serverName ?? 'A server'} › #${entry.channelName ?? 'channel'}`}
                        </span>
                        <span className="notice-what">
                          <strong>{entry.authorName}</strong>{' '}
                          {entry.kind === 'dm'
                            ? entry.channelName
                              ? 'wrote in the group'
                              : 'sent you a message'
                            : entry.kind === 'event'
                              ? `${(entry.preview ?? 'starts within the hour').replace(/^Starts/, 'starts')}${entry.channelName ? ` in #${entry.channelName}` : ''}`
                              : (entry.preview ?? 'mentioned you')}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Messages saved for later, fetched fresh each time this tab opens: like the
 * pins list, a bookmark changes on one device by one click, so there is
 * nothing to keep in sync and a short wait beats a stale answer.
 */
function SavedTab({ onClose }: { onClose: () => void }) {
  const { state, selectServer, jumpToMessage } = useStore();
  const dms = useDms();
  const [saved, setSaved] = useState<BookmarkedMessage[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.bookmarks
      .list()
      .then(({ messages }) => {
        if (!cancelled) setSaved(messages);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function jump(message: BookmarkedMessage) {
    dms.hideDms();
    if (message.serverId !== state.selectedServerId) selectServer(message.serverId);
    void jumpToMessage(message.channelId, message.id).catch(() => undefined);
    onClose();
  }

  return (
    <div className="notices-list">
      {error ? <p className="notices-empty">The saved list could not be fetched.</p> : null}
      {saved && saved.length === 0 && !error ? (
        <p className="notices-empty">Nothing saved. Hover a message and pick Save.</p>
      ) : null}
      {(saved ?? []).map((message) => (
        <button type="button" className="notice pin" key={message.id} title="Go to this message" onClick={() => jump(message)}>
          <span className="notice-body">
            <span className="notice-where">
              {state.servers[message.serverId]?.name ?? 'A server'} › #{message.channelName}
            </span>
            <span className="pin-text">
              {state.blocks.has(message.authorId)
                ? 'Blocked message.'
                : message.content
                  ? toPlainLine(message.content, [])
                  : message.attachments.length > 0
                    ? `${message.attachments.length} file(s)`
                    : 'A locked message'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

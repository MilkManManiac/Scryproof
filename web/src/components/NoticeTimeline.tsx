/**
 * The bell, and the list behind it: what was addressed to you, when, and from
 * where. The filters across the top are the point of it. After a loud evening
 * the question is rarely "what did I miss" and usually "where was all that
 * coming from".
 *
 * Nothing here asks the server anything. See lib/notices.ts.
 */

import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { BookmarkedMessage } from '@scryproof/shared';

import { api } from '../lib/api';
import { channelKeysFor } from '../lib/channel-keys';
import { toPlainLine } from '../lib/mentions';
import { bySource, digestLine, forYou, namesLine, notices, summarize } from '../lib/notices';
import { pushTargets } from '../lib/push';
import type { Notice, Place } from '../lib/notices';
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
  const { state, selectServer, selectChannel, jumpToMessage } = useStore();
  const dms = useDms();
  const [open, setOpen] = useState(false);
  // The number is what was for you; channel chatter lights the bell without one.
  const unread = forYou(list);
  const chatter = list.some((entry) => !entry.read && entry.kind === 'activity');

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
      // A channel's running row lands on the first message not yet seen, which
      // may be further back than the page a channel opens on.
      if (notice.kind === 'activity' && notice.channelId && notice.messageId) {
        void jumpToMessage(notice.channelId, notice.messageId).catch(() => selectChannel(notice.channelId!));
        return;
      }
      if (notice.channelId) selectChannel(notice.channelId);
      if (notice.kind !== 'event') flashWhenThere(`message-${notice.id}`);
    });
    return () => notices.onOpen(null);
  }, [dms, state.servers, state.selectedServerId, selectServer, selectChannel, jumpToMessage]);

  // A phone notification tapped: once there is something to go to, go.
  const bootstrapped = state.bootstrapped;
  useEffect(() => {
    if (!bootstrapped) return;
    const go = () => {
      const target = pushTargets.take();
      if (!target) return;
      notices.open({
        ...target,
        // Opened the same way as a mention: go to the channel, light the message.
        kind: target.kind === 'message' ? 'mention' : target.kind,
        at: Date.now(),
        authorId: '',
        authorName: '',
        serverName: null,
        channelName: null,
        preview: null,
        read: false,
      });
    };
    go();
    return pushTargets.subscribe(go);
  }, [bootstrapped]);

  return (
    <>
      <button
        type="button"
        className={`rail-item rail-bell${unread > 0 || chatter ? ' unread' : ''}`}
        title={unread > 0 ? `Notifications — ${unread} for you` : chatter ? 'Notifications — new messages' : 'Notifications'}
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
  const shown = useMemo(
    () => (source ? list.filter((entry) => (entry.serverId ?? 'dm') === source) : list),
    [list, source],
  );
  const summary = useMemo(() => summarize(shown), [shown]);
  const earlier = shown.filter((entry) => entry.read);

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
                  Everywhere
                </button>
                {sources.map((entry) => (
                  <button
                    type="button"
                    key={entry.key}
                    className={source === entry.key ? 'notices-source active' : 'notices-source'}
                    onClick={() => setSource(entry.key)}
                  >
                    {entry.label} {entry.unread > 0 ? <span>{entry.unread}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="notices-list">
              <p className="notices-digest">{digestLine(summary)}</p>

              {summary.places.length > 0 ? <div className="notices-day">New</div> : null}
              {summary.places.map((place) => (
                <PlaceCard key={place.key} place={place} />
              ))}

              {shown.length === 0 ? (
                <p className="notices-empty">
                  Whatever was said while you were looking somewhere else shows up here, a line per channel, with who was
                  talking and where. Mentions, direct messages and event reminders are picked out. The list is kept on
                  this device only.
                </p>
              ) : null}

              {earlier.length > 0 ? <div className="notices-day">Earlier</div> : null}
              {earlier.map((entry) => {
                const day = dayLabel(entry.at);
                const heading = day !== lastDay ? <div className="notices-subday">{day}</div> : null;
                lastDay = day;
                return (
                  <div key={entry.id}>
                    {heading}
                    <button type="button" className="notice" onClick={() => notices.open(entry)}>
                      <span className="notice-time">{timeFormat.format(entry.at)}</span>
                      <span className="notice-body">
                        <span className="notice-where">{whereOf(entry)}</span>
                        <span className="notice-what">{whatOf(entry)}</span>
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

function whereOf(entry: Notice): string {
  if (entry.kind === 'dm') return entry.channelName ? `Group › ${entry.channelName}` : 'Direct message';
  if (entry.kind === 'event') return `${entry.serverName ?? 'A server'} › Coming up`;
  return `${entry.serverName ?? 'A server'} › #${entry.channelName ?? 'channel'}`;
}

function whatOf(entry: Notice): ReactNode {
  if (entry.kind === 'activity') {
    const count = entry.count ?? 1;
    return (
      <>
        <strong>{namesLine((entry.authors ?? []).map((who) => who.name))}</strong> · {count}{' '}
        {count === 1 ? 'message' : 'messages'}
      </>
    );
  }
  return (
    <>
      <strong>{entry.authorName}</strong>{' '}
      {entry.kind === 'dm'
        ? entry.channelName
          ? 'wrote in the group'
          : 'sent you a message'
        : entry.kind === 'event'
          ? `${(entry.preview ?? 'starts within the hour').replace(/^Starts/, 'starts')}${entry.channelName ? ` in #${entry.channelName}` : ''}`
          : (entry.preview ?? 'mentioned you')}
    </>
  );
}

/**
 * One place with news in it: where, who, how many, the last thing said, and
 * any mention of you picked out underneath. The card goes to the first thing
 * you have not seen; a mention goes to the mention.
 */
function PlaceCard({ place }: { place: Place }) {
  const count =
    place.kind === 'event'
      ? 'Coming up'
      : place.kind === 'dm'
        ? `${place.count} ${place.count === 1 ? 'message' : 'messages'}`
        : `${place.count} new`;
  const where = place.kind === 'channel' ? `${place.label} › ${place.where}` : place.where;
  const who =
    place.kind === 'event'
      ? `${place.label}${place.preview ? ` · ${place.preview}` : ''}`
      : place.kind === 'dm'
        ? place.open.channelName
          ? `${namesLine(place.names)} in the group`
          : 'Direct message'
        : namesLine(place.names);

  return (
    // `is-` because a bare `channel` or `dm` class is already taken by the sidebar's rows.
    <div className={`notice-place is-${place.kind}${place.mentions.length > 0 ? ' pinged' : ''}`}>
      <button type="button" className="notice-place-main" onClick={() => notices.open(place.open)}>
        <span className="notice-place-head">
          <span className="notice-place-where">{where}</span>
          <span className="notice-place-count">{count}</span>
          <span className="notice-time">{timeFormat.format(place.latest)}</span>
        </span>
        <span className="notice-place-who">{who}</span>
        {/* The last line said, unless it is the mention already shown underneath. */}
        {place.kind === 'channel' && place.preview && !place.mentions.some((mention) => mention.id === place.open.lastId) ? (
          <span className="notice-place-last">
            {place.open.authorName}: {place.preview}
          </span>
        ) : null}
      </button>
      {place.mentions.slice(0, 3).map((mention) => (
        <button type="button" key={mention.id} className="notice-place-mention" onClick={() => notices.open(mention)}>
          <span className="notice-place-at">@</span>
          <strong>{mention.authorName}</strong> {mention.preview ?? 'mentioned you'}
        </button>
      ))}
      {place.mentions.length > 3 ? (
        <span className="notice-place-more">and {place.mentions.length - 3} more mentions</span>
      ) : null}
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
    const selfId = state.user?.id ?? null;
    api.bookmarks
      .list()
      // Saved messages from an encrypted channel arrive sealed and are opened here.
      .then(async ({ messages }) =>
        selfId ? ((await channelKeysFor(selfId).open(messages)) as BookmarkedMessage[]) : messages,
      )
      .then((messages) => {
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

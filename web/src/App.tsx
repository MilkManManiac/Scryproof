/**
 * The shell.
 *
 * Two layers: an authentication gate that decides whether there is a session
 * at all, and the application itself, which only mounts once there is. The
 * gateway lives inside the second layer, so signing out tears the socket down
 * rather than leaving it open against a session that no longer exists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Permission } from '@scryproof/shared';
import type { SelfUser } from '@scryproof/shared';

import { api } from './lib/api';
import { flatChannelOrder } from './lib/channel-order';
import { applyClientUpdate, onClientUpdate } from './lib/desktop';
import { useShortcuts } from './lib/shortcuts';
import { OPEN_DOCK, on } from './lib/signals';
import { usePhone } from './lib/usePhone';
import type { Shortcuts } from './lib/shortcuts';
import { can, useChannelPermissions } from './lib/usePermissions';
import { AuthScreen } from './screens/AuthScreen';
import { ChannelSidebar } from './components/ChannelSidebar';
import { Composer } from './components/Composer';
import { Initiative } from './components/Initiative';
import { DmPane, DmSidebar } from './components/DirectMessages';
import { DockButton } from './components/DockButton';
import { InviteJoinModal } from './components/InviteJoinModal';
import { MemberList } from './components/MemberList';
import { MessageList } from './components/MessageList';
import { PinnedMessages } from './components/PinnedMessages';
import { Lightbox } from './components/Lightbox';
import { ProfileCardProvider } from './components/ProfileCard';
import { QuickSwitcher } from './components/QuickSwitcher';
import { SearchResults } from './components/SearchResults';
import { ServerRail } from './components/ServerRail';
import { ShortcutHelp } from './components/ShortcutHelp';
import { Stage } from './components/Stage';
import { ChannelSettings } from './components/settings/ChannelSettings';
import { authorityFor } from './components/settings/authority';
import { UserPanel } from './components/UserPanel';
import { ConnectionPanel, VoiceStage } from './components/VoicePanel';
import { DmProvider, unreadDmCount, useDms } from './state/dms';
import { StoreProvider, unreadForServer, useSelectedChannel, useSelectedServer, useStore } from './state/store';

type Gate = { status: 'checking' } | { status: 'out' } | { status: 'in'; user: SelfUser };

export function App() {
  const [gate, setGate] = useState<Gate>({ status: 'checking' });

  useEffect(() => {
    api.auth
      .me()
      .then(({ user }) => setGate({ status: 'in', user }))
      .catch(() => setGate({ status: 'out' }));
  }, []);

  const onSignedOut = useCallback(() => setGate({ status: 'out' }), []);

  if (gate.status === 'checking') {
    return (
      <div className="auth">
        <div className="spinner" />
      </div>
    );
  }

  if (gate.status === 'out') {
    return <AuthScreen onAuthenticated={(user) => setGate({ status: 'in', user })} />;
  }

  return (
    <StoreProvider onSignedOut={onSignedOut}>
      <DmProvider>
        <ProfileCardProvider>
          <Shell />
          <Lightbox />
          <Stage />
          <InviteJoinModal />
        </ProfileCardProvider>
      </DmProvider>
    </StoreProvider>
  );
}

/**
 * A newer client is ready: in the app, fetched and checked and waiting; in a
 * browser, published. Switching to it is a reload, which would hang up a
 * call, so the person picks the moment. Nothing reloads on its own (Wes,
 * 2026-09-21). Left alone, it is simply there next time the app or the tab
 * is opened.
 */
function UpdateBanner({ inVoice }: { inVoice: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => onClientUpdate(() => setReady(true)), []);
  if (!ready) return null;
  return (
    <div className="banner update">
      A newer Scryproof is ready.{' '}
      {inVoice ? (
        'Reload when your call is over.'
      ) : (
        <button type="button" className="link-button" onClick={applyClientUpdate}>
          Reload now
        </button>
      )}
    </div>
  );
}

function Shell() {
  const { state, loadMembers, selectChannel, selectServer, markRead } = useStore();
  const server = useSelectedServer();
  const channel = useSelectedChannel();
  const { state: dms } = useDms();
  const [channelSettings, setChannelSettings] = useState(false);
  const [overlay, setOverlay] = useState<'switcher' | 'help' | 'pins' | null>(null);

  // The box lives in the header and stays open across query edits; the panel
  // it draws into only shows once a query has actually been submitted.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // On a phone the side panels are drawers: the left one holds the servers
  // and channels, the right one the members. Picking anything closes them.
  const phone = usePhone();
  const [dock, setDock] = useState<'left' | 'right' | null>(null);
  useEffect(() => on(OPEN_DOCK, () => setDock('left')), []);
  useEffect(() => setDock(null), [state.selectedServerId, state.selectedChannelId, dms.openId, dms.active]);
  useEffect(() => {
    if (!phone) setDock(null);
  }, [phone]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchDraft('');
    setSearchQuery('');
  }, []);

  // The keyboard steps through the same list the sidebar draws, so Alt+Down
  // always lands on the row below the one being looked at.
  const handlers = useMemo<Shortcuts>(
    () => ({
      onSwitcher: () => setOverlay('switcher'),
      onHelp: () => setOverlay('help'),
      onSearch: () => setSearchOpen(true),
      onStepChannel: (step) => {
        if (!server) return;
        const order = flatChannelOrder(server);
        const at = order.findIndex((entry) => entry.id === state.selectedChannelId);
        const next = order[at === -1 ? 0 : (at + step + order.length) % order.length];
        // Stepping past a voice channel selects it without joining the call:
        // an accidental arrow key should never put a live microphone in a room.
        if (next) selectChannel(next.id);
      },
      onStepServer: (step) => {
        const order = state.serverOrder;
        if (order.length === 0) return;
        const at = order.indexOf(state.selectedServerId ?? '');
        const next = order[at === -1 ? 0 : (at + step + order.length) % order.length];
        if (next) selectServer(next);
      },
      onEscape: () => {
        if (!channel) return;
        const newest = state.messages[channel.id]?.at(-1);
        if (newest) markRead(channel.id, newest.id);
      },
    }),
    [server, channel, state.selectedChannelId, state.selectedServerId, state.serverOrder, state.messages, selectChannel, selectServer, markRead],
  );

  // While a dialog is open it owns the keyboard, including Escape.
  useShortcuts(handlers, overlay === null && !channelSettings);

  // The tab title carries the count, so a window behind three others still
  // says whether anybody wanted you.
  // An unread conversation counts like a mention: it was addressed to you.
  const pending = useMemo(
    () =>
      state.serverOrder.reduce((total, id) => total + unreadForServer(state, id).mentions, 0) +
      unreadDmCount(dms),
    [state, dms],
  );
  useEffect(() => {
    document.title = pending > 0 ? `(${pending}) Scryproof` : 'Scryproof';
  }, [pending]);

  // A channel that is closed, deleted or switched away from should not leave
  // its settings sitting open over the next one.
  useEffect(() => setChannelSettings(false), [channel?.id]);

  // A search is a question about one server; carrying it to the next one
  // would show results next to a member list and a header that no longer
  // match what was asked.
  useEffect(() => closeSearch(), [server?.id, closeSearch]);

  // Members arrive on demand rather than in the ready frame, because a large
  // instance should not pay for every roster on every connect.
  useEffect(() => {
    if (!server) return;
    if (state.members[server.id]) return;
    void loadMembers(server.id).catch(() => undefined);
  }, [server, state.members, loadMembers]);

  const { mask } = useChannelPermissions(channel?.id ?? null, server);

  if (!state.bootstrapped) {
    return (
      <div className="auth">
        <div className="spinner" />
      </div>
    );
  }

  const inVoice = Object.values(state.voiceStates).some(
    (voice) => voice.userId === state.user?.id,
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <UpdateBanner inVoice={inVoice} />
      {state.connection !== 'open' ? (
        <div className={state.connection === 'closed' ? 'banner bad' : 'banner'}>
          {state.connection === 'closed'
            ? 'Disconnected from the server.'
            : 'Reconnecting to the server.'}
        </div>
      ) : null}

      <div
        className={server && !dms.active ? 'app with-members' : 'app'}
        style={{ flex: '1 1 auto', minHeight: 0, height: 'auto' }}
      >
        <div className={dock === 'left' ? 'dock left open' : 'dock left'}>
          <ServerRail />

          {dms.active ? (
            <DmSidebar />
          ) : server ? (
            <ChannelSidebar server={server} />
          ) : (
            <aside className="sidebar">
              <div className="sidebar-header">Scryproof</div>
              <div className="sidebar-scroll" />
              <UserPanel />
            </aside>
          )}
        </div>

        <main className="main">
          {dms.active ? (
            <DmPane />
          ) : server && channel ? (
            <>
              <header className="main-header">
                <DockButton />
                <div className="main-title">
                  <span className="channel-sigil">{channel.type === 'voice' ? '♫' : '#'}</span>
                  {channel.name}
                </div>
                {channel.topic ? <div className="main-topic">{channel.topic}</div> : null}
                <div className="main-actions">
                  {phone ? (
                    <button type="button" className="link-button members-open" title="Members" onClick={() => setDock('right')}>
                      {server.memberCount} member{server.memberCount === 1 ? '' : 's'}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                      {server.memberCount} member{server.memberCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {channel.type === 'text' && searchOpen ? (
                    <input
                      type="text"
                      className="search-box"
                      placeholder="Search this server"
                      value={searchDraft}
                      maxLength={100}
                      autoFocus
                      onChange={(event) => setSearchDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          const trimmed = searchDraft.trim();
                          if (trimmed.length >= 2) setSearchQuery(trimmed);
                        } else if (event.key === 'Escape') {
                          event.stopPropagation();
                          closeSearch();
                        }
                      }}
                    />
                  ) : null}
                  {channel.type === 'text' ? (
                    <button
                      type="button"
                      className="icon-button"
                      title="Search (Ctrl+F)"
                      onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                    >
                      &#128269;
                    </button>
                  ) : null}
                  {channel.type === 'text' ? (
                    <button type="button" className="icon-button" title="Pinned messages" onClick={() => setOverlay('pins')}>
                      &#128204;
                    </button>
                  ) : null}
                  {can(mask, Permission.MANAGE_ROLES) || can(mask, Permission.MANAGE_CHANNELS) ? (
                    <button
                      type="button"
                      className="icon-button"
                      title="Channel settings"
                      onClick={() => setChannelSettings(true)}
                    >
                      &#9881;
                    </button>
                  ) : null}
                </div>
              </header>

              {channel.type === 'voice' ? (
                <VoiceStage channelId={channel.id} channelName={channel.name} />
              ) : (
                <>
                  <MessageList channel={channel} mask={mask} />
                  <Initiative channel={channel} mask={mask} />
                  <Composer channel={channel} mask={mask} />
                </>
              )}
            </>
          ) : (
            <div className="empty">
              {phone ? (
                <header className="main-header">
                  <DockButton />
                  <div className="main-title">Scryproof</div>
                </header>
              ) : null}
              <div>
                <h2>{server ? 'No channel selected' : 'Nothing here yet'}</h2>
                <p>
                  {server
                    ? 'Pick a channel on the left.'
                    : 'Create a server with the + on the far left, or join one with an invite code.'}
                </p>
              </div>
            </div>
          )}

          {inVoice ? <ConnectionPanel /> : null}
        </main>

        {server && !dms.active ? (
          <div className={dock === 'right' ? 'dock right open' : 'dock right'}>
            {searchQuery ? (
              <SearchResults server={server} query={searchQuery} onClose={closeSearch} />
            ) : (
              <MemberList server={server} />
            )}
          </div>
        ) : null}

        {phone && dock ? <button type="button" className="dock-backdrop" aria-label="Close" onClick={() => setDock(null)} /> : null}

        {overlay === 'switcher' ? <QuickSwitcher onClose={() => setOverlay(null)} /> : null}
        {overlay === 'pins' && channel ? <PinnedMessages channelId={channel.id} onClose={() => setOverlay(null)} /> : null}
      {overlay === 'help' ? <ShortcutHelp onClose={() => setOverlay(null)} /> : null}
      </div>

      {channelSettings && server && channel ? (
        <ChannelSettings
          channel={channel}
          server={server}
          members={state.members[server.id] ?? []}
          authority={authorityFor(server, state.members[server.id] ?? [], state.user?.id ?? null)}
          onClose={() => setChannelSettings(false)}
        />
      ) : null}
    </div>
  );
}

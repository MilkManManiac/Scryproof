/**
 * The shell.
 *
 * Two layers: an authentication gate that decides whether there is a session
 * at all, and the application itself, which only mounts once there is. The
 * gateway lives inside the second layer, so signing out tears the socket down
 * rather than leaving it open against a session that no longer exists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Permission } from '@gooffline/shared';
import type { SelfUser } from '@gooffline/shared';

import { api } from './lib/api';
import { flatChannelOrder } from './lib/channel-order';
import { useShortcuts } from './lib/shortcuts';
import type { Shortcuts } from './lib/shortcuts';
import { can, useChannelPermissions } from './lib/usePermissions';
import { AuthScreen } from './screens/AuthScreen';
import { ChannelSidebar } from './components/ChannelSidebar';
import { Composer } from './components/Composer';
import { MemberList } from './components/MemberList';
import { MessageList } from './components/MessageList';
import { QuickSwitcher } from './components/QuickSwitcher';
import { ServerRail } from './components/ServerRail';
import { ShortcutHelp } from './components/ShortcutHelp';
import { ChannelSettings } from './components/settings/ChannelSettings';
import { authorityFor } from './components/settings/authority';
import { UserPanel } from './components/UserPanel';
import { ConnectionPanel, VoiceStage } from './components/VoicePanel';
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
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state, loadMembers, selectChannel, selectServer, markRead } = useStore();
  const server = useSelectedServer();
  const channel = useSelectedChannel();
  const [channelSettings, setChannelSettings] = useState(false);
  const [overlay, setOverlay] = useState<'switcher' | 'help' | null>(null);

  // The keyboard steps through the same list the sidebar draws, so Alt+Down
  // always lands on the row below the one being looked at.
  const handlers = useMemo<Shortcuts>(
    () => ({
      onSwitcher: () => setOverlay('switcher'),
      onHelp: () => setOverlay('help'),
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
  const pending = useMemo(
    () => state.serverOrder.reduce((total, id) => total + unreadForServer(state, id).mentions, 0),
    [state],
  );
  useEffect(() => {
    document.title = pending > 0 ? `(${pending}) GoOffline` : 'GoOffline';
  }, [pending]);

  // A channel that is closed, deleted or switched away from should not leave
  // its settings sitting open over the next one.
  useEffect(() => setChannelSettings(false), [channel?.id]);

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
      {state.connection !== 'open' ? (
        <div className={state.connection === 'closed' ? 'banner bad' : 'banner'}>
          {state.connection === 'closed'
            ? 'Disconnected from the server.'
            : 'Reconnecting to the server.'}
        </div>
      ) : null}

      <div
        className={server ? 'app with-members' : 'app'}
        style={{ flex: '1 1 auto', minHeight: 0, height: 'auto' }}
      >
        <ServerRail />

        {server ? (
          <ChannelSidebar server={server} />
        ) : (
          <aside className="sidebar">
            <div className="sidebar-header">GoOffline</div>
            <div className="sidebar-scroll" />
            <UserPanel />
          </aside>
        )}

        <main className="main">
          {server && channel ? (
            <>
              <header className="main-header">
                <div className="main-title">
                  <span className="channel-sigil">{channel.type === 'voice' ? '♫' : '#'}</span>
                  {channel.name}
                </div>
                {channel.topic ? <div className="main-topic">{channel.topic}</div> : null}
                <div className="main-actions">
                  <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                    {server.memberCount} member{server.memberCount === 1 ? '' : 's'}
                  </span>
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
                  <Composer channel={channel} mask={mask} />
                </>
              )}
            </>
          ) : (
            <div className="empty">
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

        {server ? <MemberList server={server} /> : null}

        {overlay === 'switcher' ? <QuickSwitcher onClose={() => setOverlay(null)} /> : null}
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

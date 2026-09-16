/**
 * The shell.
 *
 * Two layers: an authentication gate that decides whether there is a session
 * at all, and the application itself, which only mounts once there is. The
 * gateway lives inside the second layer, so signing out tears the socket down
 * rather than leaving it open against a session that no longer exists.
 */

import { useCallback, useEffect, useState } from 'react';
import { Permission } from '@gooffline/shared';
import type { SelfUser } from '@gooffline/shared';

import { api } from './lib/api';
import { can, useChannelPermissions } from './lib/usePermissions';
import { AuthScreen } from './screens/AuthScreen';
import { ChannelSidebar } from './components/ChannelSidebar';
import { Composer } from './components/Composer';
import { MemberList } from './components/MemberList';
import { MessageList } from './components/MessageList';
import { ServerRail } from './components/ServerRail';
import { ChannelSettings } from './components/settings/ChannelSettings';
import { authorityFor } from './components/settings/authority';
import { UserPanel } from './components/UserPanel';
import { StoreProvider, useSelectedChannel, useSelectedServer, useStore } from './state/store';

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
  const { state, loadMembers } = useStore();
  const server = useSelectedServer();
  const channel = useSelectedChannel();
  const [channelSettings, setChannelSettings] = useState(false);

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

/**
 * Voice channels render their occupants and the controls. Media itself lands
 * in Milestone 3, once there is a LiveKit server to publish to; until then the
 * channel is real, the presence is real, and the panel says plainly what is
 * and is not connected. It never pretends.
 */
function VoiceStage({ channelId, channelName }: { channelId: string; channelName: string }) {
  const { state, joinVoice, leaveVoice } = useStore();
  const [media, setMedia] = useState<{ configured: boolean } | null>(null);

  useEffect(() => {
    api.voice
      .config()
      .then(setMedia)
      .catch(() => setMedia({ configured: false }));
  }, []);

  const occupants = Object.values(state.voiceStates).filter(
    (voice) => voice.channelId === channelId,
  );
  const members = state.members[state.selectedServerId ?? ''] ?? [];
  const here = occupants.some((voice) => voice.userId === state.user?.id);

  return (
    <div className="empty" style={{ alignContent: 'center' }}>
      <div>
        <h2>{channelName}</h2>
        <p style={{ marginBottom: 16 }}>
          {occupants.length === 0
            ? 'Nobody is in this channel.'
            : occupants
                .map((voice) => {
                  const member = members.find((entry) => entry.userId === voice.userId);
                  return member?.nickname ?? member?.user.displayName ?? 'Someone';
                })
                .join(', ')}
        </p>

        {media && !media.configured ? (
          <p style={{ marginBottom: 16, color: 'var(--warn)' }}>
            No media server configured yet, so nothing is being transmitted. Presence in this
            channel still works.
          </p>
        ) : null}

        <button
          type="button"
          className={here ? 'button secondary inline' : 'button inline'}
          onClick={() => (here ? leaveVoice() : joinVoice(channelId))}
        >
          {here ? 'Leave' : 'Join'}
        </button>
      </div>
    </div>
  );
}

/**
 * Non-negotiable: any voice UI shows the numbers. "Voice is choppy" is not a
 * diagnosis, and a panel you have to go looking for does not get looked at.
 * The values stay blank until there is a media connection to measure.
 */
function ConnectionPanel() {
  const { state } = useStore();
  const healthy = state.connection === 'open';

  return (
    <div className="connection-panel">
      <span className="connection-stat">
        <i className={`connection-dot ${healthy ? 'good' : 'bad'}`} />
        {healthy ? 'Signalling' : 'Signal lost'}
      </span>
      <span className="connection-stat">RTT —</span>
      <span className="connection-stat">Jitter —</span>
      <span className="connection-stat">Loss —</span>
      <span className="connection-stat">TURN —</span>
      <span className="connection-stat" style={{ marginLeft: 'auto' }}>
        Media not connected
      </span>
    </div>
  );
}

/**
 * Channel list for the selected server.
 *
 * Every channel drawn here came from the server already filtered by
 * VIEW_CHANNEL. The client never receives a channel it cannot see, so there is
 * nothing here to hide and nothing to leak by mistake.
 */

import { useMemo, useState } from 'react';
import { LIMITS, Permission, slugifyChannelName, validateChannelName } from '@gooffline/shared';
import type { Channel, ServerDetail } from '@gooffline/shared';

import { ApiError, api } from '../lib/api';
import { canOnServer } from '../lib/usePermissions';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { UserPanel } from './UserPanel';

interface Group {
  id: string | null;
  name: string;
  position: number;
  channels: Channel[];
}

function group(server: ServerDetail): Group[] {
  const groups = new Map<string | null, Group>();
  groups.set(null, { id: null, name: 'Channels', position: -1, channels: [] });

  for (const category of [...server.categories].sort((a, b) => a.position - b.position)) {
    groups.set(category.id, {
      id: category.id,
      name: category.name,
      position: category.position,
      channels: [],
    });
  }

  for (const channel of server.channels) {
    // A channel whose category was hidden from us still has to land somewhere.
    const bucket = groups.get(channel.categoryId) ?? groups.get(null)!;
    bucket.channels.push(channel);
  }

  return [...groups.values()]
    .filter((entry) => entry.channels.length > 0)
    .sort((a, b) => a.position - b.position)
    .map((entry) => ({
      ...entry,
      channels: [...entry.channels].sort(
        (a, b) => a.position - b.position || a.name.localeCompare(b.name),
      ),
    }));
}

export function ChannelSidebar({ server }: { server: ServerDetail }) {
  const { state, selectChannel, joinVoice } = useStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<'channel' | 'invite' | null>(null);

  const groups = useMemo(() => group(server), [server]);
  const canManage = canOnServer(server, Permission.MANAGE_CHANNELS);
  const canInvite = canOnServer(server, Permission.CREATE_INVITE);

  const members = state.members[server.id] ?? [];
  const nameFor = (userId: string) => {
    const member = members.find((entry) => entry.userId === userId);
    return member?.nickname ?? member?.user.displayName ?? 'Someone';
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={server.name}
        >
          {server.name}
        </span>
        <span style={{ display: 'flex', gap: 2 }}>
          {canInvite ? (
            <button
              type="button"
              className="icon-button"
              title="Invite someone"
              onClick={() => setDialog('invite')}
            >
              &#8594;
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="icon-button"
              title="New channel"
              onClick={() => setDialog('channel')}
            >
              +
            </button>
          ) : null}
        </span>
      </div>

      <div className="sidebar-scroll">
        {groups.map((entry) => {
          const key = entry.id ?? 'uncategorised';
          const isCollapsed = collapsed[key] ?? false;

          return (
            <div className="category" key={key}>
              <button
                type="button"
                className="category-label"
                onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
              >
                <span className={isCollapsed ? 'category-caret collapsed' : 'category-caret'}>
                  &#9660;
                </span>
                {entry.name}
              </button>

              {isCollapsed
                ? null
                : entry.channels.map((channel) => {
                    const active = state.selectedChannelId === channel.id;
                    const inVoice = Object.values(state.voiceStates).filter(
                      (voice) => voice.channelId === channel.id,
                    );

                    return (
                      <div key={channel.id}>
                        <button
                          type="button"
                          className={active ? 'channel active' : 'channel'}
                          onClick={() => {
                            selectChannel(channel.id);
                            if (channel.type === 'voice') joinVoice(channel.id);
                          }}
                        >
                          <span className="channel-sigil">
                            {channel.type === 'voice' ? '♫' : '#'}
                          </span>
                          <span className="channel-name">{channel.name}</span>
                          {channel.encrypted ? (
                            <span className="channel-lock" title="End-to-end encrypted">
                              &#128274;
                            </span>
                          ) : null}
                        </button>

                        {inVoice.length > 0 ? (
                          <div className="voice-members">
                            {inVoice.map((voice) => {
                              const member = members.find(
                                (entry2) => entry2.userId === voice.userId,
                              );
                              return (
                                <div className="voice-member" key={voice.userId}>
                                  {member ? (
                                    <Avatar user={member.user} small />
                                  ) : (
                                    <span className="avatar small" style={{ background: '#3a4150' }} />
                                  )}
                                  <span className="channel-name">{nameFor(voice.userId)}</span>
                                  <span className="voice-flags">
                                    {voice.sharingScreen ? <span title="Sharing screen">&#9635;</span> : null}
                                    {voice.cameraOn ? <span title="Camera on">&#9679;</span> : null}
                                    {voice.selfMute || voice.serverMute ? (
                                      <span className="muted" title="Muted">
                                        &#128263;
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </div>

      <UserPanel />

      {dialog === 'channel' ? (
        <NewChannelDialog server={server} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'invite' ? (
        <InviteDialog server={server} onClose={() => setDialog(null)} />
      ) : null}
    </aside>
  );
}

function NewChannelDialog({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const slug = slugifyChannelName(name);

  async function create() {
    const valid = validateChannelName(slug);
    if (!valid.ok) return setError(valid.error);

    setBusy(true);
    setError(null);
    try {
      await api.channels.create(server.id, { name: slug, type });
      onClose();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create the channel.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New channel"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button inline"
            disabled={busy}
            onClick={() => void create()}
          >
            Create
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label>Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={type === 'text' ? 'button inline' : 'button secondary inline'}
            onClick={() => setType('text')}
          >
            # Text
          </button>
          <button
            type="button"
            className={type === 'voice' ? 'button inline' : 'button secondary inline'}
            onClick={() => setType('voice')}
          >
            &#9835; Voice
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="channel-name">Name</label>
        <input
          id="channel-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={LIMITS.channelName.max}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create();
          }}
        />
        <p className="field-note">Will be created as {slug ? `#${slug}` : 'a lowercase slug'}.</p>
      </div>
    </Modal>
  );
}

function InviteDialog({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function mint(expiresIn: '30m' | '6h' | '1d' | '7d' | 'never') {
    setBusy(true);
    setError(null);
    try {
      const result = await api.invites.create(server.id, expiresIn);
      setUrl(result.url);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create an invite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Invite to ${server.name}`}
      onClose={onClose}
      footer={
        <button type="button" className="button secondary inline" onClick={onClose}>
          Done
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {url ? (
        <div className="field">
          <label>Invite link</label>
          <div className="copy-row">
            <input readOnly value={url} onFocus={(event) => event.target.select()} />
            <button
              type="button"
              className="button inline"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="field-note">
            Anyone with this link can join this server. It does not create an account on the
            instance by itself unless registration is open.
          </p>
        </div>
      ) : (
        <div className="field">
          <label>Expires after</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['30m', '6h', '1d', '7d', 'never'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="button secondary inline"
                disabled={busy}
                onClick={() => void mint(option)}
              >
                {option === 'never' ? 'Never' : option}
              </button>
            ))}
          </div>
          <p className="field-note">Short-lived links are the safer default. Pick one to mint it.</p>
        </div>
      )}
    </Modal>
  );
}

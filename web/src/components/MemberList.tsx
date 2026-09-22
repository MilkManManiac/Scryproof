/**
 * Members of the current server, grouped by hoisted role then by presence.
 *
 * This is the whole member list, not the per-channel one. Channel-level
 * visibility is a server concern and gets its own pass when the settings UI
 * lands; showing the roster of a server you belong to is not a leak.
 */

import { useMemo, useState } from 'react';
import { Permission } from '@scryproof/shared';
import type { Member, Role, ServerDetail, VoiceState } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { timeoutEndsAt } from '../lib/usePermissions';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { Menu, MenuItem } from './Menu';
import { authorityFor } from './settings/authority';
import { useVoice } from '../state/useVoice';
import { CameraGlyph, ScreenGlyph, VoiceGlyph } from './glyphs';
import { useProfileCard } from './ProfileCard';

interface Group {
  key: string;
  label: string;
  color: string | null;
  members: Member[];
}

/** What the row menu offers. Anything longer than a week is a kick or a ban. */
const DURATIONS: { label: string; minutes: number }[] = [
  { label: '1 minute', minutes: 1 },
  { label: '5 minutes', minutes: 5 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 60 * 24 },
  { label: '1 week', minutes: 60 * 24 * 7 },
];

/** Which row's menu is open, and whether it is showing the durations yet. */
interface OpenMenu {
  userId: string;
  durations: boolean;
}

export function MemberList({ server }: { server: ServerDetail }) {
  const { state, block, unblock } = useStore();
  const live = useVoice();
  // Who is in a voice channel on this server, by user. The server keeps
  // this; it is true whether or not we are in the call ourselves.
  const calls = useMemo(() => {
    const byUser = new Map<string, VoiceState>();
    for (const voice of Object.values(state.voiceStates)) {
      if (voice.serverId === server.id && voice.channelId) byUser.set(voice.userId, voice);
    }
    return byUser;
  }, [state.voiceStates, server.id]);
  const voiceChannelName = (channelId: string | null): string =>
    server.channels.find((channel) => channel.id === channelId)?.name ?? 'voice';
  const { openWith } = useDms();
  const card = useProfileCard();
  const members = state.members[server.id];
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authority = authorityFor(server, members ?? [], state.user?.id ?? null);
  const mayModerate = authority.can(Permission.MODERATE_MEMBERS);

  async function run(work: Promise<unknown>, failure: string) {
    setMenu(null);
    setError(null);
    try {
      await work;
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : failure);
    }
  }

  const groups = useMemo<Group[]>(() => {
    if (!members) return [];

    // Highest position first, matching how the role hierarchy actually reads.
    const hoisted = server.roles
      .filter((role) => role.hoist && !role.isEveryone)
      .sort((a, b) => b.position - a.position);

    const online = (member: Member) => (state.presences[member.userId] ?? 'offline') !== 'offline';
    const label = (member: Member) => member.nickname ?? member.user.displayName;
    const byName = (a: Member, b: Member) =>
      label(a).localeCompare(label(b), undefined, { sensitivity: 'base' });

    const remaining = new Set(members.map((member) => member.userId));
    const output: Group[] = [];

    const push = (role: Role | null, list: Member[]) => {
      if (list.length === 0) return;
      output.push({
        key: role?.id ?? 'online',
        label: role?.name ?? 'Online',
        color: role?.color ?? null,
        members: list.sort(byName),
      });
    };

    for (const role of hoisted) {
      const inRole = members.filter(
        (member) => remaining.has(member.userId) && member.roleIds.includes(role.id) && online(member),
      );
      for (const member of inRole) remaining.delete(member.userId);
      push(role, inRole);
    }

    const rest = members.filter((member) => remaining.has(member.userId) && online(member));
    for (const member of rest) remaining.delete(member.userId);
    push(null, rest);

    const offline = members.filter((member) => remaining.has(member.userId)).sort(byName);
    if (offline.length > 0) {
      output.push({ key: 'offline', label: `Offline — ${offline.length}`, color: null, members: offline });
    }

    return output;
  }, [members, server.roles, state.presences]);

  if (!members) {
    return (
      <aside className="members">
        <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="spinner" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="members" aria-label="Members">
      {error ? <div className="error">{error}</div> : null}
      {groups.map((entry) => (
        <div className="members-group" key={entry.key}>
          <div className="members-heading">
            {entry.key === 'offline' ? entry.label : `${entry.label} — ${entry.members.length}`}
          </div>
          {entry.members.map((member) => {
            const presence = state.presences[member.userId] ?? 'offline';
            const self = member.userId === state.user?.id;
            const until = timeoutEndsAt(member);
            const call = calls.get(member.userId) ?? null;
            const speaking = call !== null && live.channelId === call.channelId && live.speaking.includes(member.userId);
            // The server checks all of this again. Offering the menu only when
            // it would succeed keeps the list from handing out dead choices.
            const moderatable = mayModerate && !self && authority.canActOnMember(member);
            const open = menu?.userId === member.userId ? menu : null;

            return (
              <div key={member.userId} style={{ position: 'relative' }}>
                <div
                  className={[
                    'member',
                    presence === 'offline' ? 'offline' : '',
                    call ? 'in-voice' : '',
                    speaking ? 'speaking' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={`@${member.user.username}`}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(event) => card.show(member.user, event.currentTarget, server.id)}
                  onContextMenu={
                    self
                      ? undefined
                      : (event) => {
                          event.preventDefault();
                          setMenu({ userId: member.userId, durations: false });
                        }
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') card.show(member.user, event.currentTarget, server.id);
                  }}
                >
                  <Avatar user={member.user} small presence={presence} />
                  <span className="member-text">
                    <span className="member-name" style={entry.color ? { color: entry.color } : undefined}>
                      {member.nickname ?? member.user.displayName}
                    </span>
                    {member.user.statusText ? <span className="member-status">{member.user.statusText}</span> : null}
                  </span>
                  {call ? (
                    <span className="member-flags">
                      {call.sharingScreen ? (
                        <span className="voice-flag sharing" title="Sharing their screen">
                          <ScreenGlyph />
                        </span>
                      ) : null}
                      {call.cameraOn ? (
                        <span className="voice-flag camera" title="Camera on">
                          <CameraGlyph />
                        </span>
                      ) : null}
                      <span className="voice-flag in-voice" title={`In ${voiceChannelName(call.channelId)}`}>
                        <VoiceGlyph />
                      </span>
                    </span>
                  ) : null}
                  {until ? (
                    <span className="member-timeout" title={`Timed out until ${until.toLocaleString()}`}>
                      &#9201;
                    </span>
                  ) : null}
                  {self ? null : (
                    <span className="member-menu">
                      <button
                        type="button"
                        className="icon-button"
                        title="More"
                        onClick={(event) => {
                          // The row itself opens the card; this button does not.
                          event.stopPropagation();
                          setMenu((current) => (current?.userId === member.userId ? null : { userId: member.userId, durations: false }));
                        }}
                      >
                        &#8943;
                      </button>
                    </span>
                  )}
                </div>

                {open ? (
                  <Menu align="right" onClose={() => setMenu(null)}>
                    {open.durations ? (
                      DURATIONS.map((duration) => (
                        <MenuItem
                          key={duration.minutes}
                          onClick={() =>
                            void run(
                              api.servers.timeout(
                                server.id,
                                member.userId,
                                new Date(Date.now() + duration.minutes * 60_000),
                              ),
                              'Could not time them out.',
                            )
                          }
                        >
                          {duration.label}
                        </MenuItem>
                      ))
                    ) : (
                      <>
                        <MenuItem
                          onClick={() => {
                            setMenu(null);
                            void openWith(member.userId).catch(() => undefined);
                          }}
                        >
                          Message
                        </MenuItem>
                        {state.blocks.has(member.userId) ? (
                          <MenuItem
                            note="They are never told"
                            onClick={() => {
                              setMenu(null);
                              void unblock(member.userId).catch(() => undefined);
                            }}
                          >
                            Unblock
                          </MenuItem>
                        ) : (
                          <MenuItem
                            note="Hides them from you"
                            onClick={() => {
                              setMenu(null);
                              void block(member.userId).catch(() => undefined);
                            }}
                          >
                            Block
                          </MenuItem>
                        )}
                        {moderatable ? (
                          <MenuItem
                            note="They keep reading. No posting, reacting or voice."
                            onClick={() => setMenu({ userId: member.userId, durations: true })}
                          >
                            Time out
                          </MenuItem>
                        ) : null}
                        {moderatable && until ? (
                          <MenuItem
                            note={`Ends on its own ${until.toLocaleString()}.`}
                            onClick={() =>
                              void run(
                                api.servers.endTimeout(server.id, member.userId),
                                'Could not end their timeout.',
                              )
                            }
                          >
                            End timeout
                          </MenuItem>
                        ) : null}
                      </>
                    )}
                  </Menu>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

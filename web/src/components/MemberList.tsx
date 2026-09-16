/**
 * Members of the current server, grouped by hoisted role then by presence.
 *
 * This is the whole member list, not the per-channel one. Channel-level
 * visibility is a server concern and gets its own pass when the settings UI
 * lands; showing the roster of a server you belong to is not a leak.
 */

import { useMemo } from 'react';
import type { Member, Role, ServerDetail } from '@gooffline/shared';

import { useStore } from '../state/store';
import { Avatar } from './Avatar';

interface Group {
  key: string;
  label: string;
  color: string | null;
  members: Member[];
}

export function MemberList({ server }: { server: ServerDetail }) {
  const { state } = useStore();
  const members = state.members[server.id];

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
      {groups.map((entry) => (
        <div className="members-group" key={entry.key}>
          <div className="members-heading">
            {entry.key === 'offline' ? entry.label : `${entry.label} — ${entry.members.length}`}
          </div>
          {entry.members.map((member) => {
            const presence = state.presences[member.userId] ?? 'offline';
            return (
              <div
                className={presence === 'offline' ? 'member offline' : 'member'}
                key={member.userId}
                title={`@${member.user.username}`}
              >
                <Avatar user={member.user} small presence={presence} />
                <span className="member-name" style={entry.color ? { color: entry.color } : undefined}>
                  {member.nickname ?? member.user.displayName}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

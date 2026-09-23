/**
 * "Private: on, for these roles and people."
 *
 * The one permission question nearly everyone has, asked as a switch and two
 * lists instead of an overwrite editor. It writes ordinary overwrites (the
 * server's privacy route), so the editor on the Permissions tab shows exactly
 * what this did and can still fine-tune it.
 */

import { useEffect, useState } from 'react';
import type { Member, Role } from '@scryproof/shared';

import { useLocalNames } from '../../lib/local-names';
import { nameOf } from '../../lib/mentions';
import { useStore } from '../../state/store';
import { Avatar } from '../Avatar';

export interface PrivacyChoice {
  private: boolean;
  roleIds: string[];
  memberIds: string[];
}

export const PUBLIC: PrivacyChoice = { private: false, roleIds: [], memberIds: [] };

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function PrivacyPicker({
  serverId,
  roles,
  value,
  onChange,
  disabled = false,
  selfId,
}: {
  serverId: string;
  roles: Role[];
  value: PrivacyChoice;
  onChange: (next: PrivacyChoice) => void;
  disabled?: boolean;
  /** Always let in, and shown as such: locking yourself out is not an option. */
  selfId: string;
}) {
  const { state, loadMembers } = useStore();
  useLocalNames();
  const members: Member[] = state.members[serverId] ?? [];
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (value.private && !state.members[serverId]) void loadMembers(serverId).catch(() => undefined);
  }, [value.private, serverId, state.members, loadMembers]);

  const pickable = roles.filter((role) => !role.isEveryone).sort((a, b) => b.position - a.position);
  const needle = filter.trim().toLowerCase();
  const people = members
    .filter((member) => member.userId !== selfId)
    .filter((member) => !needle || nameOf(member).toLowerCase().includes(needle))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  return (
    <div className="field privacy">
      <label className="check">
        <input
          type="checkbox"
          checked={value.private}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, private: event.target.checked })}
        />
        Private channel
      </label>
      <p className="field-note">
        {value.private
          ? 'Only the roles and people picked here can see it exists. You are always included.'
          : 'Everyone in the server can see it.'}
      </p>

      {value.private ? (
        <div className="privacy-lists">
          {pickable.length > 0 ? (
            <div className="privacy-group">
              <div className="privacy-group-title">Roles</div>
              {pickable.map((role) => (
                <label key={role.id} className="check privacy-row">
                  <input
                    type="checkbox"
                    checked={value.roleIds.includes(role.id)}
                    disabled={disabled}
                    onChange={() => onChange({ ...value, roleIds: toggle(value.roleIds, role.id) })}
                  />
                  <span style={role.color ? { color: role.color } : undefined}>{role.name}</span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="privacy-group">
            <div className="privacy-group-title">People</div>
            {members.length > 12 ? (
              <input
                type="search"
                placeholder="Find someone"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Find someone"
              />
            ) : null}
            {members.length === 0 ? <p className="field-note">Fetching the member list.</p> : null}
            {people.map((member) => (
              <label key={member.userId} className="check privacy-row">
                <input
                  type="checkbox"
                  checked={value.memberIds.includes(member.userId)}
                  disabled={disabled}
                  onChange={() => onChange({ ...value, memberIds: toggle(value.memberIds, member.userId) })}
                />
                <Avatar user={member.user} small />
                <span>{nameOf(member)}</span>
              </label>
            ))}
            {members.length > 0 && people.length === 0 && needle ? <p className="field-note">Nobody by that name.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

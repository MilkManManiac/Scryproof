/**
 * The role editor.
 *
 * Roles are listed highest first, the way the hierarchy actually reads: the
 * one at the top wins ties and outranks the ones below it. Roles above the
 * editor's own are shown rather than hidden — knowing a role exists is not a
 * leak, and a list with silent gaps in it is impossible to reason about — but
 * they cannot be opened for editing.
 */

import { useEffect, useMemo, useState } from 'react';
import { LIMITS, Permission, decodeMask, encodeMask, validateRoleName } from '@gooffline/shared';
import type { Member, Role, ServerDetail } from '@gooffline/shared';

import { ApiError, api } from '../../lib/api';
import { PERMISSION_GROUPS } from '../../lib/permissionMeta';
import { Avatar } from '../Avatar';
import { PermissionList } from './PermissionList';
import type { Authority } from './authority';

const ROLE_COLORS = [
  '#e0a33f',
  '#d4614f',
  '#bd7a82',
  '#9a86c4',
  '#7fa3cc',
  '#6fb2a8',
  '#4ba97a',
  '#8fb072',
  '#a3919f',
  '#9aa3b2',
];

interface Draft {
  name: string;
  color: string | null;
  hoist: boolean;
  mentionable: boolean;
  permissions: bigint;
}

const draftOf = (role: Role): Draft => ({
  name: role.name,
  color: role.color,
  hoist: role.hoist,
  mentionable: role.mentionable,
  permissions: decodeMask(role.permissions),
});

export function RolesPane({
  server,
  members,
  authority,
}: {
  server: ServerDetail;
  members: Member[];
  authority: Authority;
}) {
  const ordered = useMemo(
    () => [...server.roles].sort((a, b) => b.position - a.position),
    [server.roles],
  );

  const [selectedId, setSelectedId] = useState<string | null>(ordered[0]?.id ?? null);
  const [tab, setTab] = useState<'display' | 'permissions' | 'members'>('display');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = ordered.find((role) => role.id === selectedId) ?? ordered[0] ?? null;

  // Selecting a role that has just been deleted elsewhere should not leave a
  // dead editor on screen.
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function createRole() {
    setCreating(true);
    setError(null);
    try {
      const { role } = await api.roles.create(server.id, { name: 'new role' });
      setSelectedId(role.id);
      setTab('display');
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create the role.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="roles-pane">
      <div className="role-list">
        <div className="role-list-header">
          <span>Roles</span>
          {authority.can(Permission.MANAGE_ROLES) ? (
            <button
              type="button"
              className="icon-button"
              title="New role"
              disabled={creating}
              onClick={() => void createRole()}
            >
              +
            </button>
          ) : null}
        </div>

        {ordered.map((role) => {
          const editable = authority.canEditRole(role);
          return (
            <button
              type="button"
              key={role.id}
              className={role.id === selected?.id ? 'role-entry active' : 'role-entry'}
              onClick={() => setSelectedId(role.id)}
            >
              <span
                className="role-dot"
                style={{ background: role.color ?? 'var(--text-faint)' }}
              />
              <span className="role-entry-name">
                {role.isEveryone ? '@everyone' : role.name}
              </span>
              {editable ? null : (
                <span className="role-locked" title="This role is at or above your highest role.">
                  &#128274;
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="role-editor">
        {error ? <div className="error">{error}</div> : null}

        {selected ? (
          <RoleEditor
            key={selected.id}
            role={selected}
            server={server}
            members={members}
            authority={authority}
            tab={tab}
            onTab={setTab}
            onDeleted={() => setSelectedId(ordered.find((r) => r.id !== selected.id)?.id ?? null)}
          />
        ) : (
          <p className="settings-note">This server has no roles yet.</p>
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  server,
  members,
  authority,
  tab,
  onTab,
  onDeleted,
}: {
  role: Role;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
  tab: 'display' | 'permissions' | 'members';
  onTab: (tab: 'display' | 'permissions' | 'members') => void;
  onDeleted: () => void;
}) {
  const editable = authority.canEditRole(role);
  const [draft, setDraft] = useState<Draft>(() => draftOf(role));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = draftOf(role);
  const dirty =
    draft.name !== saved.name ||
    draft.color !== saved.color ||
    draft.hoist !== saved.hoist ||
    draft.mentionable !== saved.mentionable ||
    draft.permissions !== saved.permissions;

  async function save() {
    const check = validateRoleName(draft.name);
    if (!role.isEveryone && !check.ok) {
      setError(check.error);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.roles.update(role.id, {
        ...(role.isEveryone ? {} : { name: draft.name.trim() }),
        color: draft.color,
        hoist: draft.hoist,
        mentionable: draft.mentionable,
        permissions: encodeMask(draft.permissions),
      });
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save the role.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await api.roles.remove(role.id);
      onDeleted();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not delete the role.');
      setSaving(false);
    }
  }

  return (
    <>
      <header className="role-editor-header">
        <h3>
          <span className="role-dot" style={{ background: role.color ?? 'var(--text-faint)' }} />
          {role.isEveryone ? '@everyone' : role.name}
        </h3>
        <nav className="settings-tabs">
          {(['display', 'permissions', 'members'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={tab === option ? 'settings-tab active' : 'settings-tab'}
              onClick={() => onTab(option)}
            >
              {option === 'display'
                ? 'Display'
                : option === 'permissions'
                  ? 'Permissions'
                  : 'Members'}
            </button>
          ))}
        </nav>
      </header>

      {editable ? null : (
        <p className="settings-warn">
          This role sits at or above your own highest role, so you cannot change it. Only the
          server owner is exempt from that rule — being an administrator is not.
        </p>
      )}

      {error ? <div className="error">{error}</div> : null}

      <div className="role-editor-body">
        {tab === 'display' ? (
          <>
            {role.isEveryone ? (
              <p className="settings-note">
                @everyone applies to every member and cannot be renamed, coloured or deleted. Its
                permissions are the floor that every other role adds to.
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="role-name">Name</label>
                  <input
                    id="role-name"
                    value={draft.name}
                    disabled={!editable}
                    maxLength={LIMITS.roleName.max}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Colour</label>
                  <div className="swatches">
                    <button
                      type="button"
                      className={draft.color === null ? 'swatch none active' : 'swatch none'}
                      disabled={!editable}
                      title="No colour"
                      onClick={() => setDraft((prev) => ({ ...prev, color: null }))}
                    >
                      &#8212;
                    </button>
                    {ROLE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={draft.color === color ? 'swatch active' : 'swatch'}
                        style={{ background: color }}
                        disabled={!editable}
                        aria-label={color}
                        onClick={() => setDraft((prev) => ({ ...prev, color }))}
                      />
                    ))}
                  </div>
                  <p className="field-note">
                    The colour shows on names in chat and in the member list.
                  </p>
                </div>

                <label className="toggle-row">
                  <span>
                    <strong>Show separately in the member list</strong>
                    <span className="perm-description">
                      Holders are grouped under a heading instead of mixed in with everyone else.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="perm-switch"
                    checked={draft.hoist}
                    disabled={!editable}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, hoist: event.target.checked }))
                    }
                  />
                </label>

                <label className="toggle-row">
                  <span>
                    <strong>Allow anyone to @mention this role</strong>
                    <span className="perm-description">
                      Off, only people who can already mention everyone can ping it.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="perm-switch"
                    checked={draft.mentionable}
                    disabled={!editable}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, mentionable: event.target.checked }))
                    }
                  />
                </label>

                {editable ? (
                  <div className="danger-zone">
                    <div>
                      <strong>Delete this role</strong>
                      <p className="field-note">
                        Anyone holding it keeps their other roles. Channel permissions written for
                        it are removed too, so nothing lingers pointing at a role that is gone.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button danger inline"
                      disabled={saving}
                      onClick={() => void remove()}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {tab === 'permissions' ? (
          <PermissionList
            groups={PERMISSION_GROUPS}
            value={draft.permissions}
            ceiling={authority.ceiling}
            readOnly={!editable}
            onChange={(permissions) => setDraft((prev) => ({ ...prev, permissions }))}
          />
        ) : null}

        {tab === 'members' ? (
          <RoleMembers role={role} server={server} members={members} authority={authority} />
        ) : null}
      </div>

      {dirty && editable ? (
        <div className="save-bar">
          <span>Unsaved changes.</span>
          <button
            type="button"
            className="button secondary inline"
            disabled={saving}
            onClick={() => setDraft(draftOf(role))}
          >
            Reset
          </button>
          <button
            type="button"
            className="button inline"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Who holds this role, and adding or removing it one person at a time. */
function RoleMembers({
  role,
  server,
  members,
  authority,
}: {
  role: Role;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const holders = members.filter((member) => member.roleIds.includes(role.id));
  const others = members.filter((member) => !member.roleIds.includes(role.id));

  async function setRoles(member: Member, roleIds: string[]) {
    setBusy(member.userId);
    setError(null);
    try {
      await api.servers.setMemberRoles(server.id, member.userId, roleIds);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not change their roles.');
    } finally {
      setBusy(null);
    }
  }

  if (role.isEveryone) {
    return (
      <p className="settings-note">
        Every member of this server holds @everyone. It is not assigned or removed.
      </p>
    );
  }

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <div className="member-rows">
        {holders.length === 0 ? (
          <p className="settings-note">Nobody holds this role yet.</p>
        ) : (
          holders.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              disabled={busy === member.userId || !authority.canActOnMember(member)}
              action="Remove"
              onAction={() =>
                void setRoles(
                  member,
                  member.roleIds.filter((id) => id !== role.id),
                )
              }
            />
          ))
        )}
      </div>

      {adding ? (
        <div className="member-rows add-list">
          {others.length === 0 ? (
            <p className="settings-note">Everyone here already has it.</p>
          ) : (
            others.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                disabled={busy === member.userId || !authority.canActOnMember(member)}
                action="Add"
                onAction={() => void setRoles(member, [...member.roleIds, role.id])}
              />
            ))
          )}
        </div>
      ) : null}

      <button
        type="button"
        className="button secondary inline"
        style={{ marginTop: 12 }}
        onClick={() => setAdding((prev) => !prev)}
      >
        {adding ? 'Done' : 'Add members'}
      </button>
    </>
  );
}

function MemberRow({
  member,
  disabled,
  action,
  onAction,
}: {
  member: Member;
  disabled: boolean;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="member-row">
      <Avatar user={member.user} small />
      <span className="member-row-name">
        {member.nickname ?? member.user.displayName}
        <span className="member-row-handle">@{member.user.username}</span>
      </span>
      <button
        type="button"
        className="button secondary inline"
        disabled={disabled}
        title={disabled ? 'They hold a role at or above your own.' : undefined}
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  );
}

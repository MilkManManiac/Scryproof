/**
 * Server settings.
 *
 * A full-screen overlay rather than a modal, because the role editor is a
 * two-pane screen and permission lists are long; a 460px dialog would turn
 * every one of them into a scroll well.
 *
 * Every section here is gated twice: the nav entry is hidden without the
 * permission, and the server checks again on the request. The first is a
 * courtesy so people are not shown doors that do not open. Only the second is
 * a control.
 */

import { useEffect, useMemo, useState } from 'react';
import { LIMITS, Permission, toNames, decodeMask } from '@gooffline/shared';
import type { AuditLogEntry, Invite, Member, PublicUser, ServerDetail } from '@gooffline/shared';

import { ApiError, api } from '../../lib/api';
import { PERMISSION_META } from '../../lib/permissionMeta';
import { useStore } from '../../state/store';
import { Avatar } from '../Avatar';
import { RolesPane } from './RolesPane';
import { authorityFor } from './authority';

type Section = 'overview' | 'roles' | 'members' | 'invites' | 'bans' | 'audit';

export function ServerSettings({
  server,
  onClose,
}: {
  server: ServerDetail;
  onClose: () => void;
}) {
  const { state } = useStore();
  const members = state.members[server.id] ?? [];
  const authority = useMemo(
    () => authorityFor(server, members, state.user?.id ?? null),
    [server, members, state.user?.id],
  );

  const [section, setSection] = useState<Section>('overview');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections: { id: Section; label: string; visible: boolean }[] = [
    { id: 'overview', label: 'Overview', visible: true },
    { id: 'roles', label: 'Roles', visible: authority.can(Permission.MANAGE_ROLES) },
    { id: 'members', label: 'Members', visible: true },
    { id: 'invites', label: 'Invites', visible: authority.can(Permission.CREATE_INVITE) },
    { id: 'bans', label: 'Bans', visible: authority.can(Permission.BAN_MEMBERS) },
    { id: 'audit', label: 'Audit log', visible: authority.can(Permission.VIEW_AUDIT_LOG) },
  ];

  return (
    <div className="settings-backdrop" role="presentation">
      <div className="settings" role="dialog" aria-modal="true" aria-label={`${server.name} settings`}>
        <nav className="settings-nav">
          <div className="settings-nav-title">{server.name}</div>

          {sections
            .filter((entry) => entry.visible)
            .map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={section === entry.id ? 'settings-nav-item active' : 'settings-nav-item'}
                onClick={() => setSection(entry.id)}
              >
                {entry.label}
              </button>
            ))}

          <div className="settings-nav-spacer" />
          <button type="button" className="settings-nav-item" onClick={onClose}>
            Close
          </button>
        </nav>

        <div className="settings-content">
          {section === 'overview' ? (
            <Overview server={server} authority={authority} onClose={onClose} />
          ) : null}
          {section === 'roles' ? (
            <RolesPane server={server} members={members} authority={authority} />
          ) : null}
          {section === 'members' ? (
            <MembersPane server={server} members={members} authority={authority} />
          ) : null}
          {section === 'invites' ? <InvitesPane server={server} authority={authority} /> : null}
          {section === 'bans' ? <BansPane server={server} /> : null}
          {section === 'audit' ? <AuditPane server={server} members={members} /> : null}
        </div>
      </div>
    </div>
  );
}

function Overview({
  server,
  authority,
  onClose,
}: {
  server: ServerDetail;
  authority: ReturnType<typeof authorityFor>;
  onClose: () => void;
}) {
  const editable = authority.can(Permission.MANAGE_SERVER);
  const [name, setName] = useState(server.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');

  const dirty = name.trim() !== server.name;

  return (
    <>
      <h2 className="settings-heading">Overview</h2>
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="server-name">Server name</label>
        <input
          id="server-name"
          value={name}
          disabled={!editable}
          maxLength={LIMITS.serverName.max}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <p className="settings-note">
        {server.memberCount} member{server.memberCount === 1 ? '' : 's'}, {server.channels.length}{' '}
        channel{server.channels.length === 1 ? '' : 's'}, {server.roles.length} role
        {server.roles.length === 1 ? '' : 's'}.
      </p>

      {authority.isOwner ? (
        <div className="danger-zone">
          <div>
            <strong>Delete this server</strong>
            <p className="field-note">
              Channels, messages, roles and invites all go. Type the server name to confirm.
            </p>
            <input
              value={confirm}
              placeholder={server.name}
              onChange={(event) => setConfirm(event.target.value)}
              style={{ marginTop: 8, maxWidth: 260 }}
            />
          </div>
          <button
            type="button"
            className="button danger inline"
            disabled={saving || confirm !== server.name}
            onClick={() => {
              setSaving(true);
              api.servers
                .remove(server.id)
                .then(onClose)
                .catch((problem) => {
                  setError(
                    problem instanceof ApiError ? problem.message : 'Could not delete the server.',
                  );
                  setSaving(false);
                });
            }}
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="danger-zone">
          <div>
            <strong>Leave this server</strong>
            <p className="field-note">You will need a new invite to come back.</p>
          </div>
          <button
            type="button"
            className="button danger inline"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              api.servers
                .leave(server.id)
                .then(onClose)
                .catch((problem) => {
                  setError(
                    problem instanceof ApiError ? problem.message : 'Could not leave the server.',
                  );
                  setSaving(false);
                });
            }}
          >
            Leave
          </button>
        </div>
      )}

      {dirty && editable ? (
        <div className="save-bar">
          <span>Unsaved changes.</span>
          <button
            type="button"
            className="button secondary inline"
            onClick={() => setName(server.name)}
          >
            Reset
          </button>
          <button
            type="button"
            className="button inline"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              setError(null);
              api.servers
                .update(server.id, { name: name.trim() })
                .catch((problem) =>
                  setError(
                    problem instanceof ApiError ? problem.message : 'Could not rename the server.',
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            {saving ? 'Saving' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function MembersPane({
  server,
  members,
  authority,
}: {
  server: ServerDetail;
  members: Member[];
  authority: ReturnType<typeof authorityFor>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const rolesById = useMemo(
    () => new Map(server.roles.map((role) => [role.id, role])),
    [server.roles],
  );

  const shown = members.filter((member) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return (
      member.user.username.includes(needle) ||
      member.user.displayName.toLowerCase().includes(needle) ||
      (member.nickname ?? '').toLowerCase().includes(needle)
    );
  });

  const member = members.find((entry) => entry.userId === selected) ?? null;

  async function run(work: Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await work;
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Members</h2>
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <input
          placeholder="Search members"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <div className="member-rows">
        {shown.map((entry) => {
          const isOwner = entry.userId === server.ownerId;
          return (
            <div className="member-row" key={entry.userId}>
              <Avatar user={entry.user} small />
              <span className="member-row-name">
                {entry.nickname ?? entry.user.displayName}
                <span className="member-row-handle">@{entry.user.username}</span>
              </span>

              <span className="member-row-roles">
                {isOwner ? <span className="role-chip owner">owner</span> : null}
                {entry.roleIds
                  .map((id) => rolesById.get(id))
                  .filter((role) => role && !role.isEveryone)
                  .map((role) => (
                    <span
                      className="role-chip"
                      key={role!.id}
                      style={{
                        borderColor: role!.color ?? 'var(--border-strong)',
                        color: role!.color ?? 'var(--text-muted)',
                      }}
                    >
                      {role!.name}
                    </span>
                  ))}
              </span>

              <button
                type="button"
                className="button secondary inline"
                onClick={() => setSelected(selected === entry.userId ? null : entry.userId)}
              >
                {selected === entry.userId ? 'Done' : 'Manage'}
              </button>
            </div>
          );
        })}
      </div>

      {member ? (
        <div className="member-detail">
          <h3>{member.nickname ?? member.user.displayName}</h3>

          {authority.canActOnMember(member) ? null : (
            <p className="settings-warn">
              They hold a role at or above your own, so you cannot change them.
            </p>
          )}

          <div>
            <div className="settings-subhead">Roles</div>
            {server.roles
              .filter((role) => !role.isEveryone)
              .sort((a, b) => b.position - a.position)
              .map((role) => {
                const held = member.roleIds.includes(role.id);
                const allowed =
                  authority.canActOnMember(member) && authority.canEditRole(role) && !busy;

                return (
                  <label className={allowed ? 'toggle-row' : 'toggle-row disabled'} key={role.id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="role-dot"
                        style={{ background: role.color ?? 'var(--text-faint)' }}
                      />
                      {role.name}
                    </span>
                    <input
                      type="checkbox"
                      className="perm-switch"
                      checked={held}
                      disabled={!allowed}
                      onChange={(event) =>
                        void run(
                          api.servers.setMemberRoles(
                            server.id,
                            member.userId,
                            event.target.checked
                              ? [...member.roleIds, role.id]
                              : member.roleIds.filter((id) => id !== role.id),
                          ),
                          'Could not change their roles.',
                        )
                      }
                    />
                  </label>
                );
              })}
          </div>

          {authority.canActOnMember(member) ? (
            <div className="danger-zone">
              <div>
                <strong>Remove from the server</strong>
                <p className="field-note">
                  A kick is reversible with a new invite. A ban keeps them out until it is lifted.
                </p>
              </div>
              <span style={{ display: 'flex', gap: 8 }}>
                {authority.can(Permission.KICK_MEMBERS) ? (
                  <button
                    type="button"
                    className="button secondary inline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        api.servers.kick(server.id, member.userId).then(() => setSelected(null)),
                        'Could not kick them.',
                      )
                    }
                  >
                    Kick
                  </button>
                ) : null}
                {authority.can(Permission.BAN_MEMBERS) ? (
                  <button
                    type="button"
                    className="button danger inline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        api.servers.ban(server.id, member.userId).then(() => setSelected(null)),
                        'Could not ban them.',
                      )
                    }
                  >
                    Ban
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function InvitesPane({
  server,
  authority,
}: {
  server: ServerDetail;
  authority: ReturnType<typeof authorityFor>;
}) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const { invites: rows } = await api.invites.list(server.id);
      setInvites(rows);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not load the invites.');
      setInvites([]);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  return (
    <>
      <h2 className="settings-heading">Invites</h2>
      <p className="settings-note">
        Every link here lets someone join this server. Revoking one stops it working immediately,
        including for anyone who already has it open.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label>Create a link</label>
        <div className="swatches">
          {(['30m', '6h', '1d', '7d', 'never'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="button secondary inline"
              disabled={busy || !authority.can(Permission.CREATE_INVITE)}
              onClick={() => {
                setBusy(true);
                api.invites
                  .create(server.id, option)
                  .then(reload)
                  .catch((problem) =>
                    setError(
                      problem instanceof ApiError ? problem.message : 'Could not create an invite.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {option === 'never' ? 'Never expires' : option}
            </button>
          ))}
        </div>
      </div>

      {invites === null ? (
        <div className="spinner" />
      ) : invites.length === 0 ? (
        <p className="settings-note">No live invites.</p>
      ) : (
        <div className="member-rows">
          {invites.map((invite) => (
            <div className="member-row" key={invite.code}>
              <span className="member-row-name" style={{ fontFamily: 'var(--mono)' }}>
                {invite.code}
                <span className="member-row-handle">
                  {invite.uses} use{invite.uses === 1 ? '' : 's'}
                  {invite.maxUses ? ` of ${invite.maxUses}` : ''}
                  {invite.expiresAt
                    ? ` · expires ${new Date(invite.expiresAt).toLocaleString()}`
                    : ' · never expires'}
                </span>
              </span>
              <button
                type="button"
                className="button secondary inline"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}/invite/${invite.code}`,
                  );
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="button danger inline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  api.invites
                    .revoke(invite.code)
                    .then(reload)
                    .catch((problem) =>
                      setError(
                        problem instanceof ApiError ? problem.message : 'Could not revoke it.',
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BansPane({ server }: { server: ServerDetail }) {
  const [bans, setBans] = useState<
    { user: PublicUser; reason: string | null; createdAt: string }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const { bans: rows } = await api.servers.bans(server.id);
      setBans(rows);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not load the bans.');
      setBans([]);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  if (bans === null) {
    return (
      <>
        <h2 className="settings-heading">Bans</h2>
        <div className="spinner" />
      </>
    );
  }

  return (
    <>
      <h2 className="settings-heading">Bans</h2>
      {error ? <div className="error">{error}</div> : null}

      {bans.length === 0 ? (
        <p className="settings-note">Nobody is banned.</p>
      ) : (
        <div className="member-rows">
          {bans.map((ban) => (
            <div className="member-row" key={ban.user.id}>
              <Avatar user={ban.user} small />
              <span className="member-row-name">
                {ban.user.displayName}
                <span className="member-row-handle">
                  @{ban.user.username}
                  {ban.reason ? ` · ${ban.reason}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="button secondary inline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  api.servers
                    .unban(server.id, ban.user.id)
                    .then(reload)
                    .catch((problem) =>
                      setError(
                        problem instanceof ApiError ? problem.message : 'Could not lift the ban.',
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Lift ban
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The audit log in sentences.
 *
 * A table of action strings and target ids is technically the same
 * information and practically useless: nobody reads `channel.permissions` and
 * pictures what happened. Ids are resolved to names where we have them, and
 * permission masks are expanded into the bits that changed.
 */
function AuditPane({ server, members }: { server: ServerDetail; members: Member[] }) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.servers
      .auditLog(server.id)
      .then(({ entries: rows }) => setEntries(rows))
      .catch((problem) => {
        setError(problem instanceof ApiError ? problem.message : 'Could not load the audit log.');
        setEntries([]);
      });
  }, [server.id]);

  const nameFor = (id: string | null): string => {
    if (!id) return 'something';
    const channel = server.channels.find((entry) => entry.id === id);
    if (channel) return `#${channel.name}`;
    const role = server.roles.find((entry) => entry.id === id);
    if (role) return role.isEveryone ? '@everyone' : role.name;
    const member = members.find((entry) => entry.userId === id);
    if (member) return `@${member.user.username}`;
    const category = server.categories.find((entry) => entry.id === id);
    if (category) return category.name;
    return 'something since deleted';
  };

  function describe(entry: AuditLogEntry): string {
    const target = nameFor(entry.targetId);
    const changedName = typeof entry.changes?.name === 'string' ? entry.changes.name : null;

    switch (entry.action) {
      case 'server.update':
        return 'renamed the server';
      case 'channel.create':
        return `created ${changedName ? `#${changedName}` : target}`;
      case 'channel.update':
        return `edited ${target}`;
      case 'channel.delete':
        return `deleted ${changedName ? `#${changedName}` : 'a channel'}`;
      case 'channel.permissions':
        return entry.changes?.cleared
          ? `cleared a permission overwrite in ${target}`
          : `changed permissions in ${target}`;
      case 'category.create':
        return `created the category ${changedName ?? target}`;
      case 'category.update':
        return `renamed the category ${changedName ?? target}`;
      case 'category.delete':
        return `deleted the category ${changedName ?? ''}`.trim();
      case 'role.create':
        return `created the role ${changedName ?? target}`;
      case 'role.update':
        return `edited the role ${target}`;
      case 'role.reorder':
        return 'reordered the roles';
      case 'role.delete':
        return `deleted the role ${changedName ?? ''}`.trim();
      case 'member.roles':
        return `changed roles for ${target}`;
      case 'member.nickname':
        return `changed the nickname of ${target}`;
      case 'member.kick':
        return `kicked ${target}`;
      case 'member.ban':
        return `banned ${target}`;
      case 'member.unban':
        return `lifted the ban on ${target}`;
      case 'message.delete':
        return `deleted a message in ${target}`;
      case 'invite.create':
        return 'created an invite';
      case 'invite.revoke':
        return 'revoked an invite';
      default:
        return entry.action;
    }
  }

  /** Expand a permission mask in the changes blob into readable bits. */
  function permissionDetail(entry: AuditLogEntry): string | null {
    const raw = entry.changes?.permissions;
    if (typeof raw !== 'string') return null;
    const names = toNames(decodeMask(raw));
    if (names.length === 0) return 'No permissions.';
    return names.map((name) => PERMISSION_META[name]?.label ?? name).join(', ');
  }

  if (entries === null) {
    return (
      <>
        <h2 className="settings-heading">Audit log</h2>
        <div className="spinner" />
      </>
    );
  }

  return (
    <>
      <h2 className="settings-heading">Audit log</h2>
      <p className="settings-note">
        The last 100 changes. Message bodies never appear here — only who did what, and to which
        thing.
      </p>

      {error ? <div className="error">{error}</div> : null}

      {entries.length === 0 ? (
        <p className="settings-note">Nothing has been changed yet.</p>
      ) : (
        <ol className="audit-list">
          {entries.map((entry) => {
            const detail = permissionDetail(entry);
            return (
              <li className="audit-entry" key={entry.id}>
                {entry.actor ? (
                  <Avatar user={entry.actor} small />
                ) : (
                  <span className="avatar small" style={{ background: '#3a4150' }} />
                )}
                <span className="audit-text">
                  <span>
                    <strong>{entry.actor?.displayName ?? 'A deleted account'}</strong>{' '}
                    {describe(entry)}
                  </span>
                  {detail ? <span className="audit-detail">Permissions now: {detail}</span> : null}
                  <span className="audit-time">{new Date(entry.createdAt).toLocaleString()}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/**
 * Per-channel settings: the name and topic, and the overwrites that make a
 * channel private.
 *
 * The "inherited" hint next to a neutral row is computed with
 * `computeBasePermissions` from the shared package — the identical function
 * the server runs — rather than a second implementation written for the UI.
 * Two implementations of a permission algorithm drift, and the day they drift
 * is the day this screen tells someone a channel is private when it is not.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  LIMITS,
  Permission,
  computeBasePermissions,
  decodeMask,
  encodeMask,
  slugifyChannelName,
  validateChannelName,
} from '@gooffline/shared';
import type { Channel, MaskString, Member, Role, ServerDetail } from '@gooffline/shared';

import { ApiError, api } from '../../lib/api';
import { groupsForChannel } from '../../lib/permissionMeta';
import { Avatar } from '../Avatar';
import { OverwriteList } from './OverwriteList';
import type { Authority } from './authority';

interface Overwrite {
  targetType: 'role' | 'member';
  targetId: string;
  allow: bigint;
  deny: bigint;
}

const SLOWMODE_OPTIONS = [0, 5, 10, 30, 60, 300, 900] as const;

function slowmodeLabel(seconds: number): string {
  if (seconds === 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  return `${seconds / 60}m`;
}

export function ChannelSettings({
  channel,
  server,
  members,
  authority,
  onClose,
}: {
  channel: Channel;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');

  return (
    <div className="settings-backdrop" role="presentation">
      <div className="settings" role="dialog" aria-modal="true" aria-label={`#${channel.name}`}>
        <nav className="settings-nav">
          <div className="settings-nav-title">
            {channel.type === 'voice' ? '♫' : '#'} {channel.name}
          </div>
          <button
            type="button"
            className={tab === 'overview' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={tab === 'permissions' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>

          <div className="settings-nav-spacer" />
          <button type="button" className="settings-nav-item" onClick={onClose}>
            Close
          </button>
        </nav>

        <div className="settings-content">
          {tab === 'overview' ? (
            <ChannelOverview channel={channel} authority={authority} onDeleted={onClose} />
          ) : (
            <ChannelPermissions
              channel={channel}
              server={server}
              members={members}
              authority={authority}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelOverview({
  channel,
  authority,
  onDeleted,
}: {
  channel: Channel;
  authority: Authority;
  onDeleted: () => void;
}) {
  const editable = authority.can(Permission.MANAGE_CHANNELS);

  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [slowmode, setSlowmode] = useState(channel.slowmodeSeconds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const slug = slugifyChannelName(name);
  const dirty =
    slug !== channel.name || topic !== (channel.topic ?? '') || slowmode !== channel.slowmodeSeconds;

  async function save() {
    const valid = validateChannelName(slug);
    if (!valid.ok) return setError(valid.error);

    setSaving(true);
    setError(null);
    try {
      await api.channels.update(channel.id, {
        name: slug,
        topic: topic.trim() === '' ? null : topic.trim(),
        slowmodeSeconds: slowmode,
      });
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save the channel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Overview</h2>
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="channel-settings-name">Name</label>
        <input
          id="channel-settings-name"
          value={name}
          disabled={!editable}
          maxLength={LIMITS.channelName.max}
          onChange={(event) => setName(event.target.value)}
        />
        {slug !== name ? <p className="field-note">Saved as #{slug}.</p> : null}
      </div>

      <div className="field">
        <label htmlFor="channel-settings-topic">Topic</label>
        <input
          id="channel-settings-topic"
          value={topic}
          disabled={!editable}
          maxLength={LIMITS.topic.max}
          onChange={(event) => setTopic(event.target.value)}
        />
        <p className="field-note">Shown in the header. Plain text; never rendered as markup.</p>
      </div>

      {channel.type === 'text' ? (
        <div className="field">
          <label>Slow mode</label>
          <div className="swatches">
            {SLOWMODE_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={slowmode === seconds ? 'button inline' : 'button secondary inline'}
                disabled={!editable}
                onClick={() => setSlowmode(seconds)}
              >
                {slowmodeLabel(seconds)}
              </button>
            ))}
          </div>
          <p className="field-note">
            The wait between messages, per person. Anyone with Manage messages is exempt.
          </p>
        </div>
      ) : null}

      {editable ? (
        <div className="danger-zone">
          <div>
            <strong>Delete #{channel.name}</strong>
            <p className="field-note">
              The channel and its messages go with it. There is no undo and no archive.
            </p>
          </div>
          {confirmDelete ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button secondary inline"
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="button danger inline"
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  api.channels
                    .remove(channel.id)
                    .then(onDeleted)
                    .catch((problem) => {
                      setError(
                        problem instanceof ApiError
                          ? problem.message
                          : 'Could not delete the channel.',
                      );
                      setSaving(false);
                    });
                }}
              >
                Delete for good
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="button danger inline"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}

      {dirty && editable ? (
        <div className="save-bar">
          <span>Unsaved changes.</span>
          <button
            type="button"
            className="button secondary inline"
            disabled={saving}
            onClick={() => {
              setName(channel.name);
              setTopic(channel.topic ?? '');
              setSlowmode(channel.slowmodeSeconds);
            }}
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

function ChannelPermissions({
  channel,
  server,
  members,
  authority,
}: {
  channel: Channel;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
}) {
  const [overwrites, setOverwrites] = useState<Overwrite[] | null>(null);
  const [ceiling, setCeiling] = useState<bigint>(0n);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const everyone = server.roles.find((role) => role.isEveryone) ?? null;

  useEffect(() => {
    let live = true;

    Promise.all([api.channels.permissions(channel.id), api.channels.myPermissions(channel.id)])
      .then(([perms, mine]) => {
        if (!live) return;
        setOverwrites(
          perms.overwrites.map((row) => ({
            targetType: row.targetType === 'member' ? 'member' : 'role',
            targetId: row.targetId,
            allow: decodeMask(row.allow),
            deny: decodeMask(row.deny),
          })),
        );
        setCeiling(decodeMask(mine.permissions));
        setSelected((prev) => prev ?? everyone?.id ?? null);
      })
      .catch((problem) => {
        if (!live) return;
        setError(
          problem instanceof ApiError
            ? problem.message
            : 'Could not load this channel’s permissions.',
        );
        setOverwrites([]);
      });

    return () => {
      live = false;
    };
  }, [channel.id, everyone?.id]);

  const groups = useMemo(() => groupsForChannel(channel.type), [channel.type]);

  const targets = useMemo(() => {
    const listed = new Set(overwrites?.map((row) => row.targetId) ?? []);
    const roleTargets = server.roles
      .filter((role) => role.isEveryone || listed.has(role.id))
      .sort((a, b) => b.position - a.position);
    const memberTargets = members.filter((member) => listed.has(member.userId));
    return { roleTargets, memberTargets };
  }, [overwrites, server.roles, members]);

  if (overwrites === null) {
    return (
      <>
        <h2 className="settings-heading">Permissions</h2>
        <div className="spinner" />
      </>
    );
  }

  const current = overwrites.find((row) => row.targetId === selected) ?? {
    targetType: (server.roles.some((role) => role.id === selected) ? 'role' : 'member') as
      | 'role'
      | 'member',
    targetId: selected ?? '',
    allow: 0n,
    deny: 0n,
  };

  /** What this target gets from roles alone, for the neutral-row hint. */
  const inherited = ((): bigint => {
    if (!selected || !everyone) return 0n;
    const asRole = (role: Role) => ({
      id: role.id,
      permissions: decodeMask(role.permissions),
      position: role.position,
      isEveryone: role.isEveryone,
    });

    const role = server.roles.find((entry) => entry.id === selected);
    if (role) {
      return computeBasePermissions({
        isOwner: false,
        roles: role.isEveryone ? [asRole(everyone)] : [asRole(everyone), asRole(role)],
      });
    }

    const member = members.find((entry) => entry.userId === selected);
    if (!member) return 0n;
    return computeBasePermissions({
      isOwner: member.userId === server.ownerId,
      roles: [
        asRole(everyone),
        ...member.roleIds
          .map((id) => server.roles.find((entry) => entry.id === id))
          .filter((entry): entry is Role => Boolean(entry))
          .map(asRole),
      ],
    });
  })();

  const editableTarget = ((): boolean => {
    if (!authority.can(Permission.MANAGE_ROLES)) return false;
    const role = server.roles.find((entry) => entry.id === selected);
    if (role) return authority.canEditRole(role);
    const member = members.find((entry) => entry.userId === selected);
    return member ? authority.canActOnMember(member) : false;
  })();

  async function write(next: { allow: bigint; deny: bigint }) {
    if (!selected) return;

    setOverwrites((prev) => {
      const rest = (prev ?? []).filter((row) => row.targetId !== selected);
      return [...rest, { ...current, allow: next.allow, deny: next.deny }];
    });

    setSaving(true);
    setError(null);
    try {
      await api.channels.setOverwrite(channel.id, selected, {
        targetType: current.targetType,
        allow: encodeMask(next.allow) as MaskString,
        deny: encodeMask(next.deny) as MaskString,
      });
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save that change.');
      // Put the server's version back rather than leaving the screen showing a
      // change that did not happen.
      const fresh = await api.channels.permissions(channel.id).catch(() => null);
      if (fresh) {
        setOverwrites(
          fresh.overwrites.map((row) => ({
            targetType: row.targetType === 'member' ? 'member' : 'role',
            targetId: row.targetId,
            allow: decodeMask(row.allow),
            deny: decodeMask(row.deny),
          })),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function clear(targetId: string) {
    setSaving(true);
    setError(null);
    try {
      await api.channels.clearOverwrite(channel.id, targetId);
      setOverwrites((prev) => (prev ?? []).filter((row) => row.targetId !== targetId));
      if (selected === targetId) setSelected(everyone?.id ?? null);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not clear that overwrite.');
    } finally {
      setSaving(false);
    }
  }

  const unlisted = server.roles.filter(
    (role) => !role.isEveryone && !overwrites.some((row) => row.targetId === role.id),
  );

  return (
    <>
      <h2 className="settings-heading">Permissions</h2>
      <p className="settings-note">
        Overwrites apply on top of roles, for this channel only. Deny beats allow, and a member
        overwrite beats a role one. To make a channel private, deny View channel for @everyone and
        allow it for the role that should be in here.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div className="overwrite-layout">
        <div className="overwrite-targets">
          <div className="role-list-header">
            <span>Roles</span>
            {authority.can(Permission.MANAGE_ROLES) && unlisted.length > 0 ? (
              <button
                type="button"
                className="icon-button"
                title="Add a role"
                onClick={() => setAdding((prev) => !prev)}
              >
                +
              </button>
            ) : null}
          </div>

          {adding
            ? unlisted.map((role) => (
                <button
                  type="button"
                  key={role.id}
                  className="role-entry"
                  onClick={() => {
                    setOverwrites((prev) => [
                      ...(prev ?? []),
                      { targetType: 'role', targetId: role.id, allow: 0n, deny: 0n },
                    ]);
                    setSelected(role.id);
                    setAdding(false);
                  }}
                >
                  <span className="role-dot" style={{ background: role.color ?? 'var(--text-faint)' }} />
                  <span className="role-entry-name">{role.name}</span>
                  <span className="role-locked">+</span>
                </button>
              ))
            : null}

          {targets.roleTargets.map((role) => (
            // Two buttons side by side rather than one inside the other: a
            // button nested in a button is invalid and keyboard users get a
            // control they cannot reach.
            <div className="role-entry-wrap" key={role.id}>
              <button
                type="button"
                className={role.id === selected ? 'role-entry active' : 'role-entry'}
                onClick={() => setSelected(role.id)}
              >
                <span
                  className="role-dot"
                  style={{ background: role.color ?? 'var(--text-faint)' }}
                />
                <span className="role-entry-name">
                  {role.isEveryone ? '@everyone' : role.name}
                </span>
              </button>

              {!role.isEveryone && overwrites.some((row) => row.targetId === role.id) ? (
                <button
                  type="button"
                  className="icon-button"
                  title="Clear this overwrite"
                  aria-label={`Clear the overwrite for ${role.name}`}
                  disabled={saving}
                  onClick={() => void clear(role.id)}
                >
                  &#215;
                </button>
              ) : null}
            </div>
          ))}

          {targets.memberTargets.length > 0 ? (
            <>
              <div className="role-list-header">
                <span>Members</span>
              </div>
              {targets.memberTargets.map((member) => (
                <button
                  type="button"
                  key={member.userId}
                  className={member.userId === selected ? 'role-entry active' : 'role-entry'}
                  onClick={() => setSelected(member.userId)}
                >
                  <Avatar user={member.user} small />
                  <span className="role-entry-name">
                    {member.nickname ?? member.user.displayName}
                  </span>
                </button>
              ))}
            </>
          ) : null}
        </div>

        <div className="overwrite-editor">
          {selected ? (
            <>
              {editableTarget ? null : (
                <p className="settings-warn">
                  You cannot change this target’s permissions here — it sits at or above your own
                  highest role.
                </p>
              )}
              <OverwriteList
                groups={groups}
                allow={current.allow}
                deny={current.deny}
                ceiling={ceiling}
                inherited={inherited}
                readOnly={!editableTarget || saving}
                onChange={(next) => void write(next)}
              />
            </>
          ) : (
            <p className="settings-note">Pick a role on the left.</p>
          )}
        </div>
      </div>
    </>
  );
}

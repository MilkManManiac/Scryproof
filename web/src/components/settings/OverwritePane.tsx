/**
 * The overwrite editor, for anything that carries overwrites.
 *
 * Channels and categories run the same algebra one level apart, so they get
 * the same screen rather than two screens that agree until somebody edits one
 * of them. Everything specific to the thing being edited — where to load and
 * save, which permission groups apply, what the explanatory note says —
 * arrives as props.
 *
 * The "inherited" hint next to a neutral row is computed with
 * `computeBasePermissions` from the shared package, the identical function the
 * server runs, rather than a second implementation written for the UI. Two
 * implementations of a permission algorithm drift, and the day they drift is
 * the day this screen tells someone a channel is private when it is not.
 *
 * The hint describes what roles alone would give. It deliberately does not try
 * to fold in a parent category's overwrites: a number that is right most of
 * the time is worse than one whose meaning is fixed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Permission, computeBasePermissions, decodeMask, encodeMask } from '@scryproof/shared';
import type { MaskString, Member, Role, ServerDetail } from '@scryproof/shared';

import { ApiError, api } from '../../lib/api';
import type { PermissionGroup } from '../../lib/permissionMeta';
import { Avatar } from '../Avatar';
import { OverwriteList } from './OverwriteList';
import type { Authority } from './authority';

export interface Overwrite {
  targetType: 'role' | 'member';
  targetId: string;
  allow: bigint;
  deny: bigint;
}

export interface OverwriteRowDto {
  targetType: string;
  targetId: string;
  allow: MaskString;
  deny: MaskString;
}

function decodeRows(rows: OverwriteRowDto[]): Overwrite[] {
  return rows.map((row) => ({
    targetType: row.targetType === 'member' ? 'member' : 'role',
    targetId: row.targetId,
    allow: decodeMask(row.allow),
    deny: decodeMask(row.deny),
  }));
}

export function OverwritePane({
  scopeId,
  server,
  members,
  authority,
  groups,
  ceiling,
  note,
  load,
  save,
  clear,
  loadFailed,
}: {
  /** Changing this reloads the pane. The channel or category id. */
  scopeId: string;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
  groups: PermissionGroup[];
  /** Bits the editor may hand out here. Anything else renders disabled. */
  ceiling: bigint;
  note: React.ReactNode;
  load: () => Promise<{ overwrites: OverwriteRowDto[] }>;
  save: (
    targetId: string,
    body: { targetType: 'role' | 'member'; allow: MaskString; deny: MaskString },
  ) => Promise<unknown>;
  clear: (targetId: string) => Promise<unknown>;
  loadFailed: string;
}) {
  const [overwrites, setOverwrites] = useState<Overwrite[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const everyone = server.roles.find((role) => role.isEveryone) ?? null;

  useEffect(() => {
    let live = true;
    setOverwrites(null);

    load()
      .then((result) => {
        if (!live) return;
        setOverwrites(decodeRows(result.overwrites));
        setSelected((prev) => prev ?? everyone?.id ?? null);
      })
      .catch((problem) => {
        if (!live) return;
        setError(problem instanceof ApiError ? problem.message : loadFailed);
        setOverwrites([]);
      });

    return () => {
      live = false;
    };
    // `load` is rebuilt every render by the caller; `scopeId` is what actually
    // identifies the thing being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, everyone?.id]);

  const targets = useMemo(() => {
    const listed = new Set(overwrites?.map((row) => row.targetId) ?? []);
    const roleTargets = server.roles
      .filter((role) => role.isEveryone || listed.has(role.id))
      .sort((a, b) => b.position - a.position);
    const memberTargets = members.filter((member) => listed.has(member.userId));
    return { roleTargets, memberTargets };
  }, [overwrites, server.roles, members]);

  if (overwrites === null) return <div className="spinner" />;

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
      await save(selected, {
        targetType: current.targetType,
        allow: encodeMask(next.allow) as MaskString,
        deny: encodeMask(next.deny) as MaskString,
      });
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save that change.');
      // Put the server's version back rather than leaving the screen showing a
      // change that did not happen.
      const fresh = await load().catch(() => null);
      if (fresh) setOverwrites(decodeRows(fresh.overwrites));
    } finally {
      setSaving(false);
    }
  }

  async function clearTarget(targetId: string) {
    setSaving(true);
    setError(null);
    try {
      await clear(targetId);
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
      <p className="settings-note">{note}</p>

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
                  <span
                    className="role-dot"
                    style={{ background: role.color ?? 'var(--text-faint)' }}
                  />
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
                <span className="role-entry-name">{role.isEveryone ? '@everyone' : role.name}</span>
              </button>

              {!role.isEveryone && overwrites.some((row) => row.targetId === role.id) ? (
                <button
                  type="button"
                  className="icon-button"
                  title="Clear this overwrite"
                  aria-label={`Clear the overwrite for ${role.name}`}
                  disabled={saving}
                  onClick={() => void clearTarget(role.id)}
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

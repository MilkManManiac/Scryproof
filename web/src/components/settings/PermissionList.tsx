/**
 * The permission checklist used by the role editor.
 *
 * Two rules are visible here rather than hidden in an error message:
 *
 *   1. A bit the editor does not hold themselves is drawn disabled, because
 *      the server will refuse to let them grant it. Finding that out on save
 *      is worse than seeing it greyed out with the reason attached.
 *   2. Turning on Administrator visibly settles every other row, because that
 *      is what it actually does. A screen that shows Administrator ticked next
 *      to an unticked "Ban members" is lying about the outcome.
 */

import { Permission } from '@scryproof/shared';

import type { PermissionGroup } from '../../lib/permissionMeta';

export function PermissionList({
  groups,
  value,
  ceiling,
  readOnly,
  onChange,
}: {
  groups: PermissionGroup[];
  value: bigint;
  /** What the editor may hand out. Anything outside it is disabled. */
  ceiling: bigint;
  readOnly: boolean;
  onChange: (next: bigint) => void;
}) {
  const isAdmin = (value & Permission.ADMINISTRATOR) !== 0n;

  return (
    <div className="perm-groups">
      {groups.map((group) => (
        <section className="perm-group" key={group.name}>
          <h4 className="perm-group-name">{group.name}</h4>
          <p className="perm-group-note">{group.note}</p>

          {group.permissions.map((meta) => {
            const explicitlyOn = (value & meta.bit) !== 0n;
            const impliedByAdmin = isAdmin && meta.bit !== Permission.ADMINISTRATOR;
            const allowed = (ceiling & meta.bit) !== 0n;
            const disabled = readOnly || !allowed;

            return (
              <label
                className={disabled ? 'perm-row disabled' : 'perm-row'}
                key={meta.name}
                title={
                  allowed
                    ? undefined
                    : 'You cannot grant a permission you do not have yourself.'
                }
              >
                <span className="perm-text">
                  <span className="perm-label">
                    {meta.label}
                    {impliedByAdmin && !explicitlyOn ? (
                      <span className="perm-implied">granted by Administrator</span>
                    ) : null}
                  </span>
                  <span className="perm-description">{meta.description}</span>
                </span>

                <input
                  type="checkbox"
                  className="perm-switch"
                  checked={explicitlyOn || impliedByAdmin}
                  disabled={disabled || impliedByAdmin}
                  onChange={(event) =>
                    onChange(event.target.checked ? value | meta.bit : value & ~meta.bit)
                  }
                />
              </label>
            );
          })}
        </section>
      ))}
    </div>
  );
}

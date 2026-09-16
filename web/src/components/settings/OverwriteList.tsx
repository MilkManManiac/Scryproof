/**
 * Channel overwrites: three states per permission, not two.
 *
 * Neutral is the important one and the one clones usually get wrong. It means
 * "this channel has no opinion, inherit whatever the roles say" — which is not
 * the same as denying. A two-state control cannot express it, so every row
 * here is Deny / Inherit / Allow, and the inherited outcome is spelled out
 * next to it so nobody has to hold the resolution order in their head.
 */

import type { PermissionGroup } from '../../lib/permissionMeta';

export type OverwriteState = 'deny' | 'neutral' | 'allow';

export function OverwriteList({
  groups,
  allow,
  deny,
  ceiling,
  inherited,
  readOnly,
  onChange,
}: {
  groups: PermissionGroup[];
  allow: bigint;
  deny: bigint;
  /** Bits the editor holds in this channel; anything else is disabled. */
  ceiling: bigint;
  /** What this target would get with no overwrite here, for the "inherits" hint. */
  inherited: bigint;
  readOnly: boolean;
  onChange: (next: { allow: bigint; deny: bigint }) => void;
}) {
  function set(bit: bigint, state: OverwriteState): void {
    // Allow and deny are mutually exclusive by construction here, because the
    // server rejects a payload where the same bit appears in both.
    const clearedAllow = allow & ~bit;
    const clearedDeny = deny & ~bit;

    onChange({
      allow: state === 'allow' ? clearedAllow | bit : clearedAllow,
      deny: state === 'deny' ? clearedDeny | bit : clearedDeny,
    });
  }

  return (
    <div className="perm-groups">
      {groups.map((group) => (
        <section className="perm-group" key={group.name}>
          <h4 className="perm-group-name">{group.name}</h4>
          <p className="perm-group-note">{group.note}</p>

          {group.permissions.map((meta) => {
            const state: OverwriteState =
              (allow & meta.bit) !== 0n ? 'allow' : (deny & meta.bit) !== 0n ? 'deny' : 'neutral';
            const disabled = readOnly || (ceiling & meta.bit) === 0n;
            const inheritsOn = (inherited & meta.bit) !== 0n;

            return (
              <div className={disabled ? 'perm-row disabled' : 'perm-row'} key={meta.name}>
                <span className="perm-text">
                  <span className="perm-label">{meta.label}</span>
                  <span className="perm-description">
                    {meta.description}
                    {state === 'neutral' ? (
                      <em className="perm-inherit">
                        {' '}
                        Inherited: {inheritsOn ? 'allowed' : 'not allowed'}.
                      </em>
                    ) : null}
                  </span>
                </span>

                <span className="tri" role="group" aria-label={meta.label}>
                  {(['deny', 'neutral', 'allow'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={state === option ? `tri-button ${option} on` : 'tri-button'}
                      disabled={disabled}
                      aria-pressed={state === option}
                      title={
                        option === 'neutral'
                          ? 'Inherit from roles'
                          : option === 'allow'
                            ? 'Allow here regardless of roles'
                            : 'Deny here regardless of roles'
                      }
                      onClick={() => set(meta.bit, option)}
                    >
                      {option === 'deny' ? '✕' : option === 'neutral' ? '/' : '✓'}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

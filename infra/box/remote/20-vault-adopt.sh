#!/usr/bin/env bash
# Move a directory onto the vault and leave a bind mount where it was.
#
#   20-vault-adopt.sh /srv/sites /srv/conf /var/lib/postgresql ...
#
# The software that owns the path never knows: bonesdeploy still writes
# /srv/sites/scryproof/shared/.env, Postgres still uses /var/lib/postgresql,
# and both are really on the encrypted volume. That is how "everything secret
# lives on the vault" happens without fighting any tool over where things go.
#
# Safe to run before the owning software is installed (the path is created
# empty and bound, so its secrets never touch the root disk at all) or after
# (contents are moved with owners and modes preserved). Safe to run twice.
#
# Stop whatever uses the path first. This script does not guess at that.

source "$(dirname "$0")/lib.sh"
need_root
vault_is_mounted || die "the vault is not mounted. Run scryproof-unlock first."
[ "$#" -gt 0 ] || die "name at least one absolute path."

for path in "$@"; do
  case "$path" in /*) ;; *) die "'$path' is not an absolute path." ;; esac
  path="${path%/}"
  slot="$VAULT_MOUNT/binds/$(bind_slot "$path")"

  say "$path"
  if mountpoint -q "$path"; then
    note "already bound, skipping"
    continue
  fi

  mkdir -p "$path"
  if [ ! -d "$slot" ]; then
    # First adoption: mirror the directory itself (owner, mode), then contents.
    mkdir -p "$slot"
    chown --reference="$path" "$slot"
    chmod --reference="$path" "$slot"
    if [ -n "$(ls -A "$path")" ]; then
      note "moving existing contents onto the vault"
      cp -a "$path/." "$slot/"
      find "$path" -mindepth 1 -delete
      note "NOTE: those files sat on the unencrypted disk until now. If any were secret, rotate them."
    fi
  elif [ -n "$(ls -A "$path")" ]; then
    die "$path has contents on the root disk AND a copy already on the vault. Not guessing which is right. Compare $path with $slot"
  fi

  mount --bind "$slot" "$path"
  grep -qxF "$path" "$BINDS_FILE" || printf '%s\n' "$path" >> "$BINDS_FILE"
  note "bound to $slot"
done

say "Registered binds"
sed 's/^/    /' "$BINDS_FILE"

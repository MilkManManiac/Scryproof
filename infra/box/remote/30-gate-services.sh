#!/usr/bin/env bash
# Make services refuse to start while the vault is locked, and install the
# unlock and lock commands.
#
#   30-gate-services.sh postgresql.service nginx.service scryproof.target ...
#
# Order matters: list them in the order they should START. Lock stops them in
# reverse.
#
# Each unit gets a drop-in with two lines:
#
#   RequiresMountsFor=/mnt/vault       what GAMEPLAN 1b finding 3 asks for. The
#                                      fstab entry is noauto, so at boot systemd
#                                      tries the mount, the mapper device is
#                                      absent, and the unit fails in ~10 s.
#   AssertPathExists=/run/scryproof/unlocked
#                                      the belt to that pair of braces. The vault
#                                      being mounted is not enough: the bind
#                                      mounts must be in place too, or Postgres
#                                      would start against an empty directory on
#                                      the root disk. scryproof-unlock creates
#                                      this flag last, /run is tmpfs, and so a
#                                      reboot always removes it.
#
# nginx is gated as well, which means a locked box does not even answer on 443.
# That is deliberate: the TLS private key lives on the vault.

source "$(dirname "$0")/lib.sh"
need_root
[ "$#" -gt 0 ] || die "name at least one systemd unit."
mkdir -p "$STATE_DIR"
touch "$UNITS_FILE"

say "Installing scryproof-unlock and scryproof-lock"
install -d -m 0755 /usr/local/lib/scryproof
install -m 0644 "$(dirname "$0")/lib.sh" /usr/local/lib/scryproof/lib.sh
install -m 0750 "$(dirname "$0")/scryproof-unlock" /usr/local/sbin/scryproof-unlock
install -m 0750 "$(dirname "$0")/scryproof-lock" /usr/local/sbin/scryproof-lock

for unit in "$@"; do
  say "$unit"
  if ! systemctl cat "$unit" >/dev/null 2>&1; then
    note "not installed yet, skipping. Run this again once it is."
    continue
  fi
  dropin="/etc/systemd/system/$unit.d"
  mkdir -p "$dropin"
  cat > "$dropin/10-scryproof-vault.conf" <<CONF
# Written by infra/box/remote/30-gate-services.sh. The box boots dumb.
[Unit]
RequiresMountsFor=$VAULT_MOUNT
AssertPathExists=$UNLOCKED_FLAG
CONF
  grep -qxF "$unit" "$UNITS_FILE" || printf '%s\n' "$unit" >> "$UNITS_FILE"
  note "gated"
done

systemctl daemon-reload

say "Gated units, in start order"
sed 's/^/    /' "$UNITS_FILE"

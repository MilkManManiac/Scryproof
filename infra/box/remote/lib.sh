# Shared by every script in this folder. Sourced, never run.

set -Eeuo pipefail

VAULT_NAME="vault"                       # /dev/mapper/vault
VAULT_MOUNT="/mnt/vault"
STATE_DIR="/etc/scryproof"               # which paths and units the vault gates
BINDS_FILE="$STATE_DIR/binds.list"
UNITS_FILE="$STATE_DIR/units.list"
UNLOCKED_FLAG="/run/scryproof/unlocked"  # tmpfs: a reboot always removes it

say()  { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

trap 'die "line $LINENO: $BASH_COMMAND"' ERR

need_root() { [ "$(id -u)" -eq 0 ] || die "run this as root (sudo)."; }

# The block volume, found by DigitalOcean's stable name rather than /dev/sda,
# which can change between boots.
find_volume() {
  local found=()
  local candidate
  for candidate in /dev/disk/by-id/scsi-0DO_Volume_*; do
    [ -e "$candidate" ] || continue
    case "$candidate" in *-part*) continue ;; esac
    found+=("$candidate")
  done
  [ "${#found[@]}" -eq 1 ] || die "expected exactly one DigitalOcean volume, found ${#found[@]}. Attach one manually-formatted volume to this droplet."
  printf '%s\n' "${found[0]}"
}

vault_is_open()    { [ -e "/dev/mapper/$VAULT_NAME" ]; }
vault_is_mounted() { mountpoint -q "$VAULT_MOUNT"; }

# /var/lib/postgresql -> var-lib-postgresql
bind_slot() { printf '%s' "${1#/}" | tr '/' '-'; }

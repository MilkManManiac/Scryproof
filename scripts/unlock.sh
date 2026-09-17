#!/usr/bin/env bash
# Bring GoOffline back after a reboot.
#
#   bash scripts/unlock.sh
#
# It will ask for the vault passphrase. Copy it from the password manager and
# paste it; nothing shows while you type, which is normal. The passphrase goes
# from this keyboard to cryptsetup on the box over SSH and is stored nowhere.

set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$root/.env.box"

BOX_PORT="${BOX_PORT:-22}"
BOX_USER="${BOX_USER:-root}"
BOX_KEY="${BOX_KEY:-$HOME/.ssh/gooffline}"
BOX_KEY="${BOX_KEY/#\~/$HOME}"
sudo=""; [ "$BOX_USER" = "root" ] || sudo="sudo"

exec ssh -t -i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes "$BOX_USER@$BOX_HOST" "$sudo /usr/local/sbin/gooffline-unlock"

#!/usr/bin/env bash
# Run one of the infra/box/remote scripts on the box, from this PC.
#
#   bash scripts/box.sh 00-facts.sh
#   bash scripts/box.sh 20-vault-adopt.sh /srv/sites /srv/conf
#   bash scripts/box.sh scryproof-unlock
#
# It copies the whole infra/box/remote folder up first, every time, so what runs
# is always what is in the repo. A real terminal is attached (-t) because two of
# these ask for the vault passphrase, which must be typed, never passed.
#
# Reads the address from .env.box in the repo root (gitignored):
#
#   BOX_HOST=203.0.113.10
#   BOX_PORT=22
#   BOX_USER=root
#   BOX_KEY=~/.ssh/scryproof

set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$root/.env.box"

[ -f "$env_file" ] || { echo "No .env.box yet. Create it with BOX_HOST, BOX_PORT, BOX_USER and BOX_KEY. See the top of scripts/box.sh."; exit 2; }
# shellcheck disable=SC1090
source "$env_file"

: "${BOX_HOST:?BOX_HOST missing from .env.box}"
BOX_PORT="${BOX_PORT:-22}"
BOX_USER="${BOX_USER:-root}"
BOX_KEY="${BOX_KEY:-$HOME/.ssh/scryproof}"
BOX_KEY="${BOX_KEY/#\~/$HOME}"

[ "$#" -gt 0 ] || { echo "Which script? One of:"; ls "$root/infra/box/remote" | grep -v '^lib.sh$' | sed 's/^/  /'; exit 2; }
script="$1"; shift
[ -f "$root/infra/box/remote/$script" ] || { echo "No such script: infra/box/remote/$script"; exit 2; }

ssh_opts=(-i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
remote_dir="/root/scryproof-box"
sudo=""; [ "$BOX_USER" = "root" ] || { sudo="sudo"; remote_dir="/home/$BOX_USER/scryproof-box"; }

# tar over ssh rather than scp -r: one connection, and it carries the exec bits
# that a Windows checkout does not have.
tar -C "$root/infra/box" -cf - remote | ssh "${ssh_opts[@]}" "$BOX_USER@$BOX_HOST" \
  "rm -rf '$remote_dir' && mkdir -p '$remote_dir' && tar -C '$remote_dir' --strip-components=1 -xf - && chmod 700 '$remote_dir' && chmod +x '$remote_dir'/*"

# Arguments are quoted for the remote shell one by one.
args=""; for arg in "$@"; do args+=" $(printf '%q' "$arg")"; done

exec ssh -t "${ssh_opts[@]}" "$BOX_USER@$BOX_HOST" "$sudo bash '$remote_dir/$script'$args"

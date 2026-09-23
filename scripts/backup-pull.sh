#!/usr/bin/env bash
# Copy the box's backups to this PC.
#
#   bash scripts/backup-pull.sh
#
# Fetches any backup from /mnt/vault/backups that is not here yet, into
# ~/Scryproof-backups, and keeps the newest thirty here. They are encrypted;
# scripts/backup-check.mjs opens the newest and proves it restores.

set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$root/.env.box"
BOX_PORT="${BOX_PORT:-22}"
BOX_USER="${BOX_USER:-root}"
BOX_KEY="${BOX_KEY:-$HOME/.ssh/scryproof}"
BOX_KEY="${BOX_KEY/#\~/$HOME}"
ssh_opts=(-i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)

dest="$HOME/Scryproof-backups"
keep=30
mkdir -p "$dest"

remote="$(ssh "${ssh_opts[@]}" "$BOX_USER@$BOX_HOST" 'ls -1 /mnt/vault/backups/ 2>/dev/null | grep "^scryproof-.*\.tar\.gpg$"' || true)"
[ -n "$remote" ] || { echo "No backups on the box (is the vault unlocked?)."; exit 1; }

fetched=0
for name in $remote; do
  [ -f "$dest/$name" ] && continue
  scp -q -P "$BOX_PORT" -i "$BOX_KEY" -o IdentitiesOnly=yes "$BOX_USER@$BOX_HOST:/mnt/vault/backups/$name" "$dest/$name.part"
  mv "$dest/$name.part" "$dest/$name"
  echo "pulled $name"
  fetched=$((fetched + 1))
done

ls -1t "$dest"/scryproof-*.tar.gpg | tail -n +$((keep + 1)) | xargs -r rm -f
echo "$fetched new. $(ls -1 "$dest"/scryproof-*.tar.gpg | wc -l) backups in $dest"

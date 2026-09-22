#!/usr/bin/env bash
# Put the newest built installer on the box, where the app hands it out at
# https://scryproof.com/download/Scryproof-Setup.exe
#
#   cd desktop && npm run dist && cd .. && bash scripts/release.sh   # first
#   bash scripts/publish-installer.sh                                # then this
#
# The installer never goes through git (GitHub refuses files over 100 MB). It
# is copied to the app's data folder on the vault, owned like the rest of that
# folder, and served by server/src/routes/downloads.ts. Uses .env.box like
# scripts/box.sh.
set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$root/.env.box"
: "${BOX_HOST:?BOX_HOST missing from .env.box}"
BOX_PORT="${BOX_PORT:-22}"
BOX_USER="${BOX_USER:-root}"
BOX_KEY="${BOX_KEY:-$HOME/.ssh/scryproof}"
BOX_KEY="${BOX_KEY/#\~/$HOME}"

built=$(ls -t "$root"/desktop/release/Scryproof-Setup-*.exe 2>/dev/null | head -1)
[ -n "$built" ] || { echo "No installer in desktop/release. Build one: cd desktop && npm run dist" >&2; exit 1; }

dir=/srv/sites/scryproof/shared/data/downloads
opts=(-i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
sudo=""; [ "$BOX_USER" = "root" ] || sudo="sudo"

echo "Sending $(basename "$built") ($(du -m "$built" | cut -f1) MB)..."
scp "${opts[@]/-p/-P}" "$built" "$BOX_USER@$BOX_HOST:/tmp/Scryproof-Setup.exe.part"
ssh "${opts[@]}" "$BOX_USER@$BOX_HOST" "$sudo bash -s" <<EOF
set -e
install -d -m 0750 --owner="\$(stat -c %U $dir/..)" --group="\$(stat -c %G $dir/..)" $dir
mv /tmp/Scryproof-Setup.exe.part $dir/Scryproof-Setup.exe
chown --reference=$dir/.. $dir/Scryproof-Setup.exe
chmod 0640 $dir/Scryproof-Setup.exe
EOF

local_sum=$(sha256sum "$built" | cut -c1-16)
served_sum=$(curl -fsS https://scryproof.com/download/Scryproof-Setup.exe | sha256sum | cut -c1-16)
if [ "$local_sum" = "$served_sum" ]; then
  echo "https://scryproof.com/download/Scryproof-Setup.exe is the installer just built ($local_sum)."
else
  echo "The box serves $served_sum, not $local_sum." >&2
  exit 1
fi

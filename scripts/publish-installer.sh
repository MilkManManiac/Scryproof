#!/usr/bin/env bash
# Put the newest built installer on the box, where the app hands it out at
# https://scryproof.com/download/Scryproof-Setup.exe
# and its signed description at /download/installer.json, which installed apps
# (0.5.0 and later) read every hour to update themselves.
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

# installer.json has to describe exactly this installer, or every app that
# downloads it throws it away. `npm run dist` writes it last; a build that
# stopped halfway leaves an old one behind.
manifest="$root/desktop/release/installer.json"
[ -f "$manifest" ] || { echo "No desktop/release/installer.json. Sign the installer: cd desktop && npm run sign-installer" >&2; exit 1; }
read -r signed_version signed_sum < <(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(m.version, m.sha256)' "$manifest")
built_version=$(basename "$built" .exe); built_version=${built_version#Scryproof-Setup-}
built_sum=$(sha256sum "$built" | cut -d' ' -f1)

# The fingerprint of the key every installed app checks updates against: the
# public half the installer carries (desktop/src/update-key.pub.pem, read by
# main.js and update-core.js). Not a secret; printed below with the installer's
# hash so both can be published off the box (finding 6 of the 2026-09-24
# hostile review: the installer is served by the box and is not code-signed).
key="$root/desktop/src/update-key.pub.pem"
[ -f "$key" ] || { echo "No desktop/src/update-key.pub.pem: the update key fingerprint cannot be printed." >&2; exit 1; }
key_sum=$(sha256sum "$key" | cut -d' ' -f1)

if [ "$signed_version" != "$built_version" ] || [ "$signed_sum" != "$built_sum" ]; then
  echo "installer.json is for $signed_version (${signed_sum:0:16}), not $(basename "$built") (${built_sum:0:16}). Sign it again: cd desktop && npm run sign-installer" >&2
  exit 1
fi

data=/srv/sites/scryproof/shared/data
dir=$data/downloads
opts=(-i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
sudo=""; [ "$BOX_USER" = "root" ] || sudo="sudo"

echo "Sending $(basename "$built") ($(du -m "$built" | cut -f1) MB)..."
scp "${opts[@]/-p/-P}" "$built" "$BOX_USER@$BOX_HOST:/tmp/Scryproof-Setup.exe.part"
scp "${opts[@]/-p/-P}" "$manifest" "$BOX_USER@$BOX_HOST:/tmp/installer.json.part"
# The installer goes into place first and its description after, so an app
# never reads a description of an installer that is not there yet. (One that
# reads the old description and gets the new installer throws it away and
# asks again in an hour.)
ssh "${opts[@]}" "$BOX_USER@$BOX_HOST" "$sudo bash -s" <<EOF
set -e
install -d -m 0750 --owner="\$(stat -c %U $data)" --group="\$(stat -c %G $data)" $dir
for name in Scryproof-Setup.exe installer.json; do
  mv /tmp/\$name.part $dir/\$name
  chown --reference=$data $dir/\$name
  chmod 0640 $dir/\$name
done
EOF

local_sum=$(sha256sum "$built" | cut -c1-16)
served_sum=$(curl -fsS https://scryproof.com/download/Scryproof-Setup.exe | sha256sum | cut -c1-16)
if [ "$local_sum" = "$served_sum" ]; then
  echo "https://scryproof.com/download/Scryproof-Setup.exe is the installer just built ($local_sum)."
else
  echo "The box serves $served_sum, not $local_sum." >&2
  exit 1
fi

local_json=$(sha256sum "$manifest" | cut -c1-16)
served_json=$(curl -fsS https://scryproof.com/download/installer.json | sha256sum | cut -c1-16)
if [ "$local_json" = "$served_json" ]; then
  echo "https://scryproof.com/download/installer.json says $signed_version. Installed apps will offer it within the hour."
else
  echo "The box serves an installer.json that is not the one just signed ($served_json, not $local_json)." >&2
  exit 1
fi

# Publish these two where the box cannot change them, so that a member can tell
# the installer the box serves apart from one someone swapped in. Neither is a
# secret. In the GitHub release notes, or in a message sent by hand.
echo
echo "Installer $(basename "$built")"
echo "  installer  SHA-256: $built_sum"
echo "  update key SHA-256: $key_sum"
echo "Paste both into the GitHub release notes (or a message you send by hand), and tell people to check"
echo "the installer against them before running it. On the box is not enough: the box is what hands it out."

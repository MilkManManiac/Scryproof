#!/usr/bin/env bash
# Put the Whereabouts and Lowball photos on the box.
#
#   bash scripts/publish-game-photos.sh
#
# The photos are not in the repo (a few hundred MB that would sit in git
# forever) and not in the nightly backups (they are not anyone's data, and
# they can always be sent again). They live on Wes's PC under
# Documents\Scryproof-keep\game-photos\, made there by scripts/geo-stock.py
# and scripts/homes-stock.py, and on the box under shared/data/game-photos/
# on the encrypted volume, where server/src/routes/rounds.ts reads them.
#
# Only the photos the stock lists name are sent, so a rejected download on
# the PC never reaches the box. Run it after the stock changes, and after a
# restore to a new box.
set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source "$root/.env.box"
: "${BOX_HOST:?BOX_HOST missing from .env.box}"
BOX_PORT="${BOX_PORT:-22}"
BOX_USER="${BOX_USER:-root}"
BOX_KEY="${BOX_KEY:-$HOME/.ssh/scryproof}"
BOX_KEY="${BOX_KEY/#\~/$HOME}"
photos="${GAME_PHOTOS:-$HOME/Documents/Scryproof-keep/game-photos}"

# Every file the two stocks name, as paths under $photos.
list=$(mktemp)
trap 'rm -f "$list" "$list.tar"' EXIT
node -e '
  const [geo, homes] = process.argv.slice(1).map((path) => JSON.parse(require("fs").readFileSync(path, "utf8")));
  for (const place of geo) console.log(`geo/${place.id}.jpg`);
  for (const home of homes) for (let n = 1; n <= home.photos; n += 1) console.log(`homes/${home.id}_${n}.jpg`);
' "$root/server/src/geo/stock.json" "$root/server/src/homes/stock.json" > "$list"

missing=0
while read -r name; do [ -f "$photos/$name" ] || { echo "missing on this PC: $name" >&2; missing=$((missing + 1)); }; done < "$list"
[ "$missing" -eq 0 ] || { echo "$missing photos the stock names are not in $photos. Run the stock scripts again." >&2; exit 1; }

tar -C "$photos" -cf "$list.tar" -T "$list"
count=$(wc -l < "$list" | tr -d ' ')
echo "Sending $count photos ($(du -m "$list.tar" | cut -f1) MB)..."

data=/srv/sites/scryproof/shared/data
dir=$data/game-photos
opts=(-i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
sudo=""; [ "$BOX_USER" = "root" ] || sudo="sudo"

scp "${opts[@]/-p/-P}" "$list.tar" "$BOX_USER@$BOX_HOST:/tmp/game-photos.tar.part"
# Unpacked beside the old set and swapped in, so a game never reads half a folder.
ssh "${opts[@]}" "$BOX_USER@$BOX_HOST" "$sudo bash -s" <<EOF
set -e
owner="\$(stat -c %U $data)"; group="\$(stat -c %G $data)"
rm -rf $dir.new && install -d -m 0750 --owner="\$owner" --group="\$group" $dir.new
tar -C $dir.new -xf /tmp/game-photos.tar.part
rm -f /tmp/game-photos.tar.part
chown -R "\$owner:\$group" $dir.new
find $dir.new -type d -exec chmod 0750 {} +
find $dir.new -type f -exec chmod 0640 {} +
rm -rf $dir.old
[ -d $dir ] && mv $dir $dir.old
mv $dir.new $dir
rm -rf $dir.old
echo "On the box: \$(find $dir -type f | wc -l) photos, \$(du -sm $dir | cut -f1) MB. Vault: \$(df -h /mnt/vault | awk 'NR==2 {print \$4}') free."
EOF

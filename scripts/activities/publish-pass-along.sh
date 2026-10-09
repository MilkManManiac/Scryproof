#!/usr/bin/env bash
# Put the Pass-along prototype on the activities host, at
# https://activities.scryproof.com/pass-along/ (Wes, 2026-10-09: "get it on
# scry so i can test there"). A static folder next to Hero Line, same layout
# (releases/<id>, a `current` link, one nginx location). No app release, no
# picker entry; open the URL directly.
#
#   bash scripts/activities/publish-pass-along.sh
#
# Reads .env.box like scripts/box.sh.
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$root/.env.box"
BOX_KEY="${BOX_KEY/#\~/$HOME}"
ssh_opts=(-i "$BOX_KEY" -p "${BOX_PORT:-22}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
host="${BOX_USER:-root}@$BOX_HOST"

build="$(mktemp -d)"; trap 'rm -rf "$build"' EXIT
mkdir "$build/pass-along"
cp "$root/docs/spikes/passalong.html" "$build/pass-along/index.html"
cp "$root/docs/spikes/passalong.js" "$build/pass-along/"
cp -r "$root/docs/spikes/kombinat" "$build/pass-along/"
tar -czf "$build/pass-along.tar.gz" -C "$build/pass-along" .
rel="$(git -C "$root" rev-parse --short=12 HEAD)-$(date +%s | sha256sum | cut -c1-12)"

scp -i "$BOX_KEY" -P "${BOX_PORT:-22}" -o IdentitiesOnly=yes "$build/pass-along.tar.gz" "$host:/tmp/pass-along.tar.gz"
ssh "${ssh_opts[@]}" "$host" "bash -s -- '$rel'" <<'REMOTE'
set -euo pipefail
rel=$1
base=/srv/sites/scryproof-activities/pass-along
dst=$base/releases/$rel
mkdir -p "$base/releases"
rm -rf "$dst.tmp"; mkdir "$dst.tmp"
tar -xzf /tmp/pass-along.tar.gz -C "$dst.tmp"; rm -f /tmp/pass-along.tar.gz
find "$dst.tmp" -type l -print -quit | grep -q . && { echo "symlink in archive"; exit 1; }
chown -R root:scryproof-activities "$dst.tmp"
find "$dst.tmp" -type d -exec chmod 750 {} +
find "$dst.tmp" -type f -exec chmod 640 {} +
chown root:scryproof-activities "$base" "$base/releases"; chmod 750 "$base" "$base/releases"
rm -rf "$dst"; mv -T "$dst.tmp" "$dst"
ln -sfn "$dst" "$base/current.tmp"; mv -Tf "$base/current.tmp" "$base/current"
# keep the last three releases
ls -1dt "$base"/releases/* | tail -n +4 | xargs -r rm -rf

conf=/etc/scryproof-activities/nginx.conf
if ! grep -q 'location ^~ /pass-along/' "$conf"; then
  cp "$conf" "$conf.bak.$(date +%s)"
  python3 - "$conf" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
block = '''        location ^~ /pass-along/ {
            alias /srv/sites/scryproof-activities/pass-along/current/;
            disable_symlinks on from=/srv/sites/scryproof-activities/pass-along/current;
            limit_except GET { deny all; }
            try_files $uri $uri/index.html =404;
        }
'''
marker = '        location / { return 404; }'
assert marker in s and block not in s
open(p, 'w').write(s.replace(marker, block + marker))
PY
fi
nginx -t -c "$conf" -q
systemctl reload scryproof-activities
echo "installed $rel"
REMOTE

echo "check:"
curl -s -o /dev/null -w '  index %{http_code}\n' https://activities.scryproof.com/pass-along/
curl -s -o /dev/null -w '  script %{http_code}\n' https://activities.scryproof.com/pass-along/passalong.js
curl -s -o /dev/null -w '  samples %{http_code} %{size_download} bytes\n' https://activities.scryproof.com/pass-along/kombinat/samples.js

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
cp -r "$root/docs/spikes/store" "$build/pass-along/"
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
# the store is a service, not a static file: it leaves the release folder before anything is served
id pass-along-store >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin pass-along-store
/opt/bonesdeploy/node/v24.19.0/bin/node --check "$dst.tmp/store/store.mjs"   # a broken store never replaces a working one
mkdir -p /srv/pass-along-store
install -o root -g pass-along-store -m 0640 "$dst.tmp/store/store.mjs" /srv/pass-along-store/store.mjs
install -o root -g root -m 0644 "$dst.tmp/store/pass-along-store.service" /etc/systemd/system/pass-along-store.service
rm -rf "$dst.tmp/store"
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

# the loop store: front nginx proxies /pass-along/api/ to its unix socket (same shape as Hero Line's relay)
systemctl daemon-reload
systemctl enable --now pass-along-store >/dev/null
systemctl restart pass-along-store
sleep 1
systemctl is-active pass-along-store
[ -S /run/pass-along-store/store.sock ] || { echo "no store socket"; exit 1; }
front=/etc/nginx/sites-enabled/scryproof-activities.conf
if ! grep -q 'location ^~ /pass-along/api/' "$front"; then
  mkdir -p /root/nginx-backups; cp "$front" "/root/nginx-backups/scryproof-activities.conf.$(date +%s)"
  python3 - "$front" <<'PY2'
import sys
p = sys.argv[1]; s = open(p).read()
block = '''    # Pass-along loops: small JSON to the store's unix socket (pass-along-store.service). A loop is a few KB.
    location ^~ /pass-along/api/ {
        proxy_pass http://unix:/run/pass-along-store/store.sock;
        proxy_set_header Host activities.scryproof.com;
        proxy_set_header Cookie "";
        proxy_set_header Authorization "";
        proxy_buffering off;
        client_max_body_size 64k;
        proxy_read_timeout 15s;
    }
'''
marker = '    location / {
        proxy_pass http://unix:/run/scryproof-activities/nginx.sock;'
assert marker in s and block not in s
open(p, 'w').write(s.replace(marker, block + marker))
PY2
fi
nginx -t -q || { echo "front nginx config broken, NOT reloaded"; exit 1; }
systemctl reload nginx
echo "installed $rel"
REMOTE

echo "check:"
curl -s -o /dev/null -w '  index %{http_code}\n' https://activities.scryproof.com/pass-along/
curl -s -o /dev/null -w '  script %{http_code}\n' https://activities.scryproof.com/pass-along/passalong.js
curl -s -o /dev/null -w '  samples %{http_code} %{size_download} bytes\n' https://activities.scryproof.com/pass-along/kombinat/samples.js

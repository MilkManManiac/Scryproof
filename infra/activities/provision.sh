#!/usr/bin/env bash
# Run on the authorized box as root, from a copy of infra/activities.
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo 'Run as root' >&2; exit 1; }
mountpoint -q /srv/sites || { echo '/srv/sites must be on the unlocked vault' >&2; exit 1; }
getent passwd scryproof-activities >/dev/null || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin scryproof-activities
install -d -o root -g scryproof-activities -m 0750 /srv/sites/scryproof-activities /srv/sites/scryproof-activities/releases
install -d -m 0755 /etc/scryproof-activities /var/www/scryproof-activities/.well-known/acme-challenge
# First enable only HTTP so Let's Encrypt can verify the new hostname.
if [ ! -f /etc/letsencrypt/live/activities.scryproof.com/fullchain.pem ]; then
    awk '/^server \{/ { count++ } count < 2 { print }' router.conf > /etc/nginx/sites-available/scryproof-activities.conf
    ln -sfn /etc/nginx/sites-available/scryproof-activities.conf /etc/nginx/sites-enabled/scryproof-activities.conf
    nginx -t
    systemctl reload nginx
    certbot certonly --webroot -w /var/www/scryproof-activities -d activities.scryproof.com --non-interactive
fi
install -m 0755 renew-hook.sh /etc/letsencrypt/renewal-hooks/deploy/scryproof-activities.sh
# The old voice hook runs for every renewed certificate. Scope it to its own
# lineage so renewing Activities never restarts LiveKit.
python3 - <<'PYHOOK'
from pathlib import Path
hook = Path('/etc/letsencrypt/renewal-hooks/deploy/scryproof-livekit.sh')
if hook.exists():
    text = hook.read_text()
    line = 'live="/etc/letsencrypt/live/scryproof.com"\n'
    guard = '[ "${RENEWED_LINEAGE:-$live}" = "$live" ] || exit 0\n'
    if guard not in text:
        if line not in text:
            raise SystemExit('Unexpected voice renewal hook; cannot safely scope it')
        # Backup outside the deploy hooks directory (certbot executes that directory).
        Path('/etc/scryproof-activities/livekit-renew-hook.backup').write_text(text)
        hook.write_text(text.replace(line, line + guard, 1))
PYHOOK
install -m 0644 nginx.conf /etc/scryproof-activities/nginx.conf
install -m 0644 apparmor.profile /etc/apparmor.d/scryproof-activities-nginx
apparmor_parser -r /etc/apparmor.d/scryproof-activities-nginx
install -m 0644 scryproof-activities.service /etc/systemd/system/scryproof-activities.service
systemctl daemon-reload
systemctl enable --now scryproof-activities.service
install -m 0644 router.conf /etc/nginx/sites-available/scryproof-activities.conf
ln -sfn /etc/nginx/sites-available/scryproof-activities.conf /etc/nginx/sites-enabled/scryproof-activities.conf
nginx -t
systemctl reload nginx
curl --retry 5 --retry-connrefused --retry-delay 1 -fsS --unix-socket /run/scryproof-activities/nginx.sock http://localhost/health

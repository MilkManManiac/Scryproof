#!/usr/bin/env bash
# Activities certificate renewal must not restart an active voice call.
set -euo pipefail
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/activities.scryproof.com ] || exit 0
nginx -t
systemctl reload nginx

#!/usr/bin/env bash
# Install the nightly backup.
#
#   bash scripts/box.sh 70-backups.sh
#
# Puts the public key (backup-key.asc, made on the PC by scripts/backup-key.sh)
# in /etc/scryproof, installs scryproof-backup, and a timer that runs it at
# 08:00 UTC (4 AM Eastern) every night. The service only runs while the vault
# is unlocked; a locked box has nothing to back up and nowhere to write it.
# Then it takes one backup straight away, so the PC has something to pull and
# check.

source "$(dirname "$0")/lib.sh"
need_root

here="$(dirname "$0")"
[ -s "$here/backup-key.asc" ] || die "no backup-key.asc beside this script. Run scripts/backup-key.sh on the PC first."
vault_is_mounted || die "the vault is not mounted. Unlock first."

say "Public key"
install -d -m 0755 "$STATE_DIR"
install -m 0644 "$here/backup-key.asc" "$STATE_DIR/backup-key.asc"
note "$STATE_DIR/backup-key.asc"

say "scryproof-backup"
install -m 0750 "$here/scryproof-backup" /usr/local/sbin/scryproof-backup

cat > /etc/systemd/system/scryproof-backup.service <<CONF
[Unit]
Description=Encrypted backup of the database and uploads
ConditionPathExists=$UNLOCKED_FLAG
After=postgresql.service

[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
ExecStart=/usr/local/sbin/scryproof-backup
CONF

cat > /etc/systemd/system/scryproof-backup.timer <<CONF
[Unit]
Description=Nightly encrypted backup

[Timer]
OnCalendar=*-*-* 08:00:00 UTC
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
CONF

systemctl daemon-reload
systemctl enable --now scryproof-backup.timer
note "timer on: $(systemctl list-timers scryproof-backup.timer --no-legend | awk '{print $1, $2, $3}')"

say "First backup"
/usr/local/sbin/scryproof-backup | sed 's/^/    /'

say "Done."

#!/usr/bin/env bash
# Remove the things on a fresh DigitalOcean droplet that work for DigitalOcean,
# and close the two places memory and logs leak onto the unencrypted disk.
# GAMEPLAN section 1b, findings 3 and 4.

source "$(dirname "$0")/lib.sh"
need_root

say "DigitalOcean agents"
# droplet-agent is what lets the web console log in to this machine from the
# control panel. do-agent ships metrics to DigitalOcean. Neither is needed by
# anything we run, and the first is a login path we do not control.
for package in droplet-agent do-agent; do
  if dpkg -s "$package" >/dev/null 2>&1; then
    apt-get purge -y -q "$package"
    note "removed $package"
  else
    note "absent  $package"
  fi
done
rm -f /etc/apt/sources.list.d/droplet-agent.list /etc/apt/sources.list.d/digitalocean-agent.list
rm -rf /opt/digitalocean

say "Swap"
# Swap on the root disk would write pieces of memory, including the vault key
# and session secrets, onto unencrypted storage.
swapoff -a
sed -i.bak -E '/\sswap\s/ s/^/# disabled by scryproof: /' /etc/fstab
note "off, and commented out of /etc/fstab"

say "Core dumps"
# A crash dump is a copy of process memory written to disk.
mkdir -p /etc/systemd/coredump.conf.d
cat > /etc/systemd/coredump.conf.d/10-scryproof.conf <<CONF
[Coredump]
Storage=none
ProcessSizeMax=0
CONF
printf '* hard core 0\n' > /etc/security/limits.d/10-scryproof-nocore.conf
note "disabled"

say "System journal"
# RAM only. While the box is locked there is nowhere private to write, so
# nothing is written at all. Once unlocked, scryproof-journal-archive copies the
# journal onto the vault as text, and a timer deletes anything past 14 days.
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/10-scryproof.conf <<CONF
[Journal]
Storage=volatile
RuntimeMaxUse=64M
ForwardToSyslog=no
CONF
systemctl restart systemd-journald
rm -rf /var/log/journal
note "volatile, 64 MB cap"

cat > /etc/systemd/system/scryproof-journal-archive.service <<CONF
[Unit]
Description=Copy the journal onto the encrypted vault
RequiresMountsFor=$VAULT_MOUNT
AssertPathExists=$UNLOCKED_FLAG

[Service]
ExecStart=/bin/sh -c 'exec journalctl --follow --no-tail --output=short-iso >> $VAULT_MOUNT/logs/journal-\$(date +%%F).log'
Restart=always
RestartSec=5
# A new file each day: the restart is what rolls it over.
RuntimeMaxSec=86400
CONF

cat > /etc/systemd/system/scryproof-log-expiry.service <<CONF
[Unit]
Description=Delete archived logs older than 14 days
ConditionPathExists=$UNLOCKED_FLAG

[Service]
Type=oneshot
ExecStart=/usr/bin/find $VAULT_MOUNT/logs -type f -mtime +14 -delete
CONF

cat > /etc/systemd/system/scryproof-log-expiry.timer <<CONF
[Unit]
Description=Daily log expiry

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
CONF

systemctl daemon-reload
systemctl enable --now scryproof-log-expiry.timer
mkdir -p "$STATE_DIR"
touch "$UNITS_FILE"
grep -qxF scryproof-journal-archive.service "$UNITS_FILE" || printf '%s\n' scryproof-journal-archive.service >> "$UNITS_FILE"
note "archive service registered; it starts on unlock"

say "Done."

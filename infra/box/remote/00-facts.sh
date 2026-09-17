#!/usr/bin/env bash
# Read-only. Changes nothing. Prints what this box is, so nobody has to guess.
# Run it first, run it after every other step, paste the output.

source "$(dirname "$0")/lib.sh"

say "System"
. /etc/os-release && note "$PRETTY_NAME, kernel $(uname -r)"
note "memory: $(free -h | awk '/^Mem:/ {print $2 " total, " $7 " available"}')"
note "root disk: $(df -h / | awk 'NR==2 {print $4 " free of " $2}')"

say "Disks"
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT | sed 's/^/    /'

say "Vault"
if vault_is_open; then note "OPEN"; else note "locked (no /dev/mapper/$VAULT_NAME)"; fi
if vault_is_mounted; then
  note "mounted at $VAULT_MOUNT, $(df -h "$VAULT_MOUNT" | awk 'NR==2 {print $4 " free"}')"
else
  note "not mounted"
fi
if [ -e "$UNLOCKED_FLAG" ]; then
  note "unlock flag present"
else
  note "unlock flag absent (services gated on it will refuse to start)"
fi
if [ -f "$BINDS_FILE" ]; then
  while read -r path; do
    [ -n "$path" ] || continue
    if mountpoint -q "$path"; then note "bound       $path"; else note "NOT bound   $path"; fi
  done < "$BINDS_FILE"
fi

say "Gated services"
if [ -s "$UNITS_FILE" ]; then
  while read -r unit; do
    [ -n "$unit" ] || continue
    note "$(printf '%-34s %s' "$unit" "$(systemctl is-active "$unit" 2>/dev/null || true)")"
  done < "$UNITS_FILE"
else
  note "none registered yet"
fi

say "DigitalOcean agents (should both be absent)"
for package in droplet-agent do-agent; do
  if dpkg -s "$package" >/dev/null 2>&1; then note "PRESENT  $package"; else note "absent   $package"; fi
done

say "Firewall"
if command -v ufw >/dev/null; then ufw status verbose | sed 's/^/    /'; else note "ufw not installed"; fi

say "Listening sockets that are not loopback"
ss -Htulpn | awk '$5 !~ /^(127\.|\[::1\]|\[::ffff:127\.)/' | sed 's/^/    /'

say "SSH"
sshd -T 2>/dev/null | grep -E '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication) ' | sed 's/^/    /' || true

say "Swap (swap on the root disk would leak memory onto it)"
if [ -n "$(swapon --show)" ]; then swapon --show | sed 's/^/    /'; else note "none"; fi

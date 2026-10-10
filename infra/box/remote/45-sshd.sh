#!/usr/bin/env bash
# Root may log in with a key and nothing else. Audit 2026-10-10, finding 10.
#
#   bash scripts/box.sh 45-sshd.sh
#
# The stock Ubuntu sshd_config says "PermitRootLogin yes". Key-only auth was
# already holding the door (PasswordAuthentication no), but "yes" means one
# config slip later a password would do. "prohibit-password" says it in the
# setting itself. Written as a drop-in, not an edit of sshd_config: Ubuntu
# reads /etc/ssh/sshd_config.d/*.conf first and the first match wins, so
# "10-" sorts ahead of cloud-init's "50-".
#
# Reloads sshd rather than restarting it, so the session running this script
# stays up. Safe to run twice: the drop-in is rewritten to the same bytes.

source "$(dirname "$0")/lib.sh"
need_root

grep -q '^Include /etc/ssh/sshd_config.d/\*\.conf' /etc/ssh/sshd_config \
  || die "/etc/ssh/sshd_config does not Include sshd_config.d; a drop-in would be ignored."

say "Drop-in"
install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-scryproof.conf <<CONF
# Written by infra/box/remote/45-sshd.sh. First match wins; keep this file
# ahead of the others in sort order.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
note "/etc/ssh/sshd_config.d/10-scryproof.conf"

say "Checking the config before reloading"
sshd -t || die "sshd rejects the config; nothing was reloaded, the running sshd is untouched."
systemctl reload ssh
note "reloaded"

say "Effective settings"
sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication) ' | sed 's/^/    /'
sshd -T 2>/dev/null | grep -qxE 'permitrootlogin (prohibit-password|without-password)' || die "sshd still reports something other than prohibit-password."

say "Done. Open a second terminal and ssh in before closing this one."

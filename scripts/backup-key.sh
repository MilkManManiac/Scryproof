#!/usr/bin/env bash
# Make the backup key, once, on this PC.
#
#   bash scripts/backup-key.sh
#
# Backups are encrypted on the box to a public key and can only be opened with
# the private half, which is made here and never leaves this PC (non-negotiable
# 8: nothing on the server can open them). The public half goes into the repo
# at infra/box/remote/backup-key.asc, where 70-backups.sh picks it up.
#
# The private key has no passphrase: it sits beside the backups it opens, both
# on this PC. What protects it is that it is not on the box. A copy goes into
# the password manager as well, because if this PC dies, the copies still on
# the box can only be opened with it.

set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
home="$HOME/.scryproof-backup"
export GNUPGHOME="$home/gnupg"
public="$root/infra/box/remote/backup-key.asc"
private="$home/backup-private-key.asc"

if [ -f "$private" ]; then
  echo "A backup key already exists at $private. Not making another."
  exit 0
fi

mkdir -p "$GNUPGHOME"
chmod 700 "$home" "$GNUPGHOME"

gpg --batch --pinentry-mode loopback --passphrase '' \
  --quick-gen-key 'Scryproof backups' ed25519 cert never
fpr="$(gpg --list-keys --with-colons 'Scryproof backups' | awk -F: '/^fpr:/ { print $10; exit }')"
gpg --batch --pinentry-mode loopback --passphrase '' --quick-add-key "$fpr" cv25519 encr never

gpg --armor --export "$fpr" > "$public"
gpg --batch --pinentry-mode loopback --passphrase '' --armor --export-secret-keys "$fpr" > "$private"
chmod 600 "$private"

echo
echo "Public key:  $public (commit it)"
echo "Private key: $private"
echo "Put a copy of the private key file in the password manager. Never in the repo."

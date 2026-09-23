#!/usr/bin/env bash
# Give the box swap, on the vault.
#
#   bash scripts/box.sh 80-swap.sh [size, default 1G]
#
# Why: the box has 1 GB. The app, Postgres and LiveKit use about half, and a
# release build peaks around 650 MB (measured 2026-09-23). With no swap the
# kernel does not kill anything; it thrashes, and the live site stops
# answering until the build gives up. That happened twice on 2026-09-23.
#
# Why on the vault: swap holds whatever was in memory, which can include
# message keys in transit, session data and the secrets file's contents.
# On the root disk that would break GAMEPLAN 1b finding 3 (nothing secret on
# the unencrypted disk). On the vault it is encrypted at rest, and it cannot
# exist until the vault is unlocked: scryproof-unlock turns it on, and
# scryproof-lock turns it off before closing the vault.
#
# Also reinstalls lib.sh, scryproof-unlock and scryproof-lock, which learned
# about the swap file, without re-running 30-gate-services.sh.

source "$(dirname "$0")/lib.sh"
need_root
vault_is_mounted || die "the vault is locked. Unlock first (bash scripts/unlock.sh)."
size="${1:-1G}"

say "Installing lib.sh, scryproof-unlock and scryproof-lock"
install -m 0644 "$(dirname "$0")/lib.sh" /usr/local/lib/scryproof/lib.sh
install -m 0750 "$(dirname "$0")/scryproof-unlock" /usr/local/sbin/scryproof-unlock
install -m 0750 "$(dirname "$0")/scryproof-lock" /usr/local/sbin/scryproof-lock

if [ -f "$SWAP_FILE" ]; then
  note "$SWAP_FILE already exists"
else
  say "Making a $size swap file on the vault"
  # dd, not fallocate: a swap file must have no holes, and dd is sure of that
  # on any filesystem.
  dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$(numfmt --from=iec "$size" | awk '{print int($1/1048576)}')" status=none
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null
fi

# Use it only under pressure: the vault is a network volume, slower than RAM,
# and the running app should stay in memory while a build goes to swap.
echo 'vm.swappiness=10' > /etc/sysctl.d/60-scryproof-swap.conf
sysctl -q -p /etc/sysctl.d/60-scryproof-swap.conf

swap_is_on || swapon "$SWAP_FILE"
say "Swap"
swapon --show
free -m

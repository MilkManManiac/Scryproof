#!/usr/bin/env bash
# Give the app its Web Push key pair (VAPID), made on the box.
#
#   bash scripts/box.sh 90-push-keys.sh
#
# Phone notifications (server/src/services/push.ts) sign each empty ping with
# this key so Apple and Google know it comes from the server the phone
# subscribed to. Like SESSION_SECRET, it is made here and written straight
# into the app's .env on the vault: the private half never passes through a
# session, never touches the root disk, and is never printed. Only the public
# half is shown, and every browser is handed that one anyway.
#
# Safe to run twice: an existing pair is kept. Replacing it would silently
# break every phone that has already subscribed.
#
# The app reads it at start; the next deploy (or a restart) picks it up.

source "$(dirname "$0")/lib.sh"
need_root
vault_is_mounted || die "the vault is locked. Unlock first (bash scripts/unlock.sh)."

env_file=/srv/sites/scryproof/shared/.env
[ -f "$env_file" ] || die "no $env_file"

if grep -q '^VAPID_PRIVATE_KEY=' "$env_file"; then
  note "a push key pair is already there; keeping it"
  grep '^VAPID_PUBLIC_KEY=' "$env_file"
  exit 0
fi

b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }

say "Making a P-256 key pair in memory"
# SEC1 DER for a P-256 key: 7 bytes of header, the 32-byte private scalar,
# then parameters, and the 65-byte uncompressed public point at the very end.
der="$(openssl ecparam -name prime256v1 -genkey -noout -outform DER | base64 -w0)"
private="$(printf '%s' "$der" | base64 -d | head -c 39 | tail -c 32 | b64url)"
public="$(printf '%s' "$der" | base64 -d | tail -c 65 | b64url)"
unset der
[ "${#private}" -eq 43 ] && [ "${#public}" -eq 87 ] || die "the key came out the wrong size; nothing was written"

subject="$(grep '^PUBLIC_URL=' "$env_file" | cut -d= -f2-)"
subject="${subject:-https://scryproof.com}"

{
  printf '\n# Web Push (phone notifications), made on the box %s\n' "$(date -u +%F)"
  printf 'VAPID_PUBLIC_KEY=%s\n' "$public"
  printf 'VAPID_PRIVATE_KEY=%s\n' "$private"
  printf 'VAPID_SUBJECT=%s\n' "$subject"
} >> "$env_file"
unset private

note "written to $env_file (owner and mode unchanged)"
note "public key: $public"
say "Done. Deploy or restart the app to switch phone notifications on."

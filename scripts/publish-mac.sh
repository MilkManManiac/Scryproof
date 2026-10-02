#!/usr/bin/env bash
# Run only after Wes approves publication. Artifacts first, manifest last.
# --dry-run verifies local artifacts and prints the upload without using SSH.
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dry_run=false
case "${1:-}" in
  --dry-run) dry_run=true ;;
  '') ;;
  *) echo 'Usage: bash scripts/publish-mac.sh [--dry-run]' >&2; exit 1 ;;
esac
[ "$#" -le 1 ] || { echo 'Too many arguments.' >&2; exit 1; }
release="$root/desktop/release"
manifest="$release/installer-mac-arm64.json"
dmg="$release/Scryproof.dmg"
key="$root/desktop/src/update-key-mac.pub.pem"

# Derive the zip name only from a verified version. A stale manifest never
# selects the newest zip by accident, and path input cannot escape release/.
version=$(node --input-type=module - "$root" <<'JS'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { readMacInstallerManifest, macInstallerFileName, verifyInstallerFile } =
  await import(pathToFileURL(join(root, 'desktop/src/installer-core.js')));
try {
  const manifest = readMacInstallerManifest(
    readFileSync(join(root, 'desktop/release/installer-mac-arm64.json'), 'utf8'),
    readFileSync(join(root, 'desktop/src/update-key-mac.pub.pem'), 'utf8'));
  if (!manifest) throw new Error('The Mac manifest signature or fields are invalid.');
  if (!(await verifyInstallerFile(join(root, 'desktop/release', macInstallerFileName(manifest.version)), manifest))) {
    throw new Error('The Mac manifest hash/size does not match the zip. Sign it again: cd desktop && npm run sign-installer -- --mac');
  }
  console.log(manifest.version);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
JS
)
zip="$release/Scryproof-$version-mac-arm64.zip"
[ -s "$dmg" ] || { echo 'No desktop/release/Scryproof.dmg. Build the Mac release first.' >&2; exit 1; }
hash() { shasum -a 256 "$1" | cut -d' ' -f1; }
dmg_sum=$(hash "$dmg")
zip_sum=$(hash "$zip")
manifest_sum=$(hash "$manifest")
key_sum=$(hash "$key")
if "$dry_run"; then
  echo "Would send $dmg as Scryproof.dmg ($dmg_sum)."
  echo "Would send $zip as Scryproof-mac-arm64.zip ($zip_sum)."
  echo "Would send $manifest last as installer-mac-arm64.json ($manifest_sum)."
  echo 'Local signature, zip hash and size checks passed; no network calls made.'
  exit 0
fi

# Same box identity and vault conventions as publish-installer.sh.
# shellcheck disable=SC1091
source "$root/.env.box"
: "${BOX_HOST:?BOX_HOST missing from .env.box}"
BOX_PORT="${BOX_PORT:-22}"
BOX_USER="${BOX_USER:-root}"
BOX_KEY="${BOX_KEY:-$HOME/.ssh/scryproof}"
BOX_KEY="${BOX_KEY/#\~/$HOME}"
data=/srv/sites/scryproof/shared/data
dir=$data/downloads
opts=(-i "$BOX_KEY" -p "$BOX_PORT" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
sudo=""; [ "$BOX_USER" = root ] || sudo="sudo"
echo "Sending Mac release $version..."
scp "${opts[@]/-p/-P}" "$dmg" "$BOX_USER@$BOX_HOST:/tmp/Scryproof.dmg.part"
scp "${opts[@]/-p/-P}" "$zip" "$BOX_USER@$BOX_HOST:/tmp/Scryproof-mac-arm64.zip.part"
scp "${opts[@]/-p/-P}" "$manifest" "$BOX_USER@$BOX_HOST:/tmp/installer-mac-arm64.json.part"
ssh "${opts[@]}" "$BOX_USER@$BOX_HOST" "$sudo bash -s" <<EOF
set -e
install -d -m 0750 --owner="\$(stat -c %U $data)" --group="\$(stat -c %G $data)" $dir
for name in Scryproof.dmg Scryproof-mac-arm64.zip installer-mac-arm64.json; do
  chown --reference=$data /tmp/\$name.part
  chmod 0640 /tmp/\$name.part
  mv /tmp/\$name.part $dir/\$name
done
EOF
# Full hashes, including the DMG and the exact manifest bytes served.
for name in Scryproof.dmg Scryproof-mac-arm64.zip installer-mac-arm64.json; do
  case "$name" in
    Scryproof.dmg) expected=$dmg_sum ;;
    Scryproof-mac-arm64.zip) expected=$zip_sum ;;
    installer-mac-arm64.json) expected=$manifest_sum ;;
  esac
  served=$(curl -fsS "https://scryproof.com/download/$name" | shasum -a 256 | cut -d' ' -f1)
  [ "$served" = "$expected" ] || { echo "The box serves a different $name ($served, expected $expected)." >&2; exit 1; }
  echo "https://scryproof.com/download/$name matches the release just sent ($expected)."
done
echo
echo "Mac release $version"
echo "  DMG        SHA-256: $dmg_sum"
echo "  zip        SHA-256: $zip_sum"
echo "  update key SHA-256: $key_sum"
echo 'Paste these into the GitHub release notes (or a message you send by hand).'
echo 'The hashes must be published somewhere the box cannot change.'

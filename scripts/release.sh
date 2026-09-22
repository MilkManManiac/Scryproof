#!/usr/bin/env bash
# One deploy, for the website and for every installed desktop app.
#
#   bash scripts/release.sh
#
# Signs the client as built from this commit (the key is on this PC only),
# commits the signed update, pushes, deploys, and checks that the box is
# handing out the same update that was signed here. Commit your work first.
set -euo pipefail
cd "$(dirname "$0")/.."

signed='web/public/desktop-update/|desktop/src/client-version.json|desktop/src/update-key.pub.pem'
if [ -n "$(git status --porcelain | grep -Ev "$signed" || true)" ]; then
  echo "There are uncommitted changes. Commit them first, so the update matches a commit." >&2
  exit 1
fi

# Every release says what changed, in web/src/changelog.ts, or people cannot
# see it. SKIP_NOTES=1 for a release that changed nothing anyone would notice.
today=$(date +%F)
newest=$(grep -m1 -oE "date: '[0-9-]+'" web/src/changelog.ts | grep -oE '[0-9-]+')
if [ "${SKIP_NOTES:-}" != "1" ] && [ "$newest" != "$today" ]; then
  echo "The newest entry in web/src/changelog.ts is from $newest, not today. Add one, or SKIP_NOTES=1 if nothing anyone would notice changed." >&2
  exit 1
fi

# Building an installer signs a client too. Straight after one, release that client, so the two match.
if [ -n "$(git status --porcelain | grep -E "$signed" || true)" ]; then
  echo "Releasing the client that was already signed (by an installer build)."
else
  npm run release:client
fi
git add web/public/desktop-update desktop/src/client-version.json desktop/src/update-key.pub.pem
version=$(node -p "require('./desktop/src/client-version.json').version")
git commit -q -m "Signed desktop client $version"
git push -q

MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash -lc 'bash ~/ship.sh 6'
# The service is restarting when the deploy returns; health is a 502 for a few seconds.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS https://scryproof.com/api/health 2>/dev/null; then echo; break; fi
  sleep 3
done
served=$(curl -fsS https://scryproof.com/desktop-update/client.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
if [ "$served" = "$version" ]; then echo "The box is serving client $version."; else echo "The box is serving $served, not $version." >&2; exit 1; fi

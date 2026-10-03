#!/usr/bin/env bash
# Static exports are shipped separately from Scryproof and its signed desktop client.
set -euo pipefail
cd "$(dirname "$0")/../.."
export_dir="${1:-build/activities/drain-the-swamp}"
activities_host="${ACTIVITIES_SSH:-root@68.183.16.145}"
archive=$(mktemp /tmp/scryproof-activity.XXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
python3 - "$export_dir" "$archive" <<'PY'
import importlib.util, pathlib, sys, tarfile
spec = importlib.util.spec_from_file_location('release', 'scripts/activities/install-release.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
with tarfile.open(sys.argv[2], 'w:gz') as out:
    for file in sorted(pathlib.Path(sys.argv[1]).iterdir()):
        out.add(file, arcname=file.name, recursive=False)
with tarfile.open(sys.argv[2], 'r:gz') as check: mod.validate(check)
PY
remote_dir=$(ssh "$activities_host" 'mktemp -d /tmp/scryproof-activity.XXXXXXXX')
[[ "$remote_dir" =~ ^/tmp/scryproof-activity\.[A-Za-z0-9]+$ ]] || exit 1
trap 'rm -f "$archive"; ssh "$activities_host" "rm -rf -- $remote_dir"' EXIT
scp "$archive" "$activities_host:$remote_dir/game.tar.gz"
scp scripts/activities/install-release.py "$activities_host:$remote_dir/install.py"
ssh "$activities_host" "flock /run/lock/scryproof-activities-release.lock python3 $remote_dir/install.py $remote_dir/game.tar.gz"
curl --fail --silent --show-error https://activities.scryproof.com/health
python3 - "$export_dir" <<'PYCHECK'
import hashlib, json, pathlib, sys, urllib.request
local=pathlib.Path(sys.argv[1])
manifest=json.loads((local/'release.json').read_text())
base='https://activities.scryproof.com'
served=json.load(urllib.request.urlopen(base+'/drain-the-swamp/release.json', timeout=20))
if served != manifest: raise SystemExit('Hosted manifest differs from exported release')
for name in ['index.html','activity.js','index.js']:
    url = base+('/drain-the-swamp/' if name=='index.html' else '/releases/'+manifest['release']+'/drain-the-swamp/')+name
    with urllib.request.urlopen(url, timeout=30) as response:
        if hashlib.file_digest(response,'sha256').hexdigest() != manifest['files'][name]:
            raise SystemExit('Hosted checksum mismatch: '+name)
print('Hosted release verified:',manifest['release'])
PYCHECK

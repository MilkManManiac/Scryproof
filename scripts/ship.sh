#!/usr/bin/env bash
# Deploy the server: pull from the Windows repo, push to the box, run
# bonesdeploy. Runs INSIDE WSL (Ubuntu), where bonesdeploy and the box's git
# remote live; scripts/release.sh calls it from Git Bash through wsl.exe.
#
#   bash scripts/ship.sh [lines of deploy log to show, default 40]
#
# Committed 2026-10-10 from ~/ship.sh in WSL (audit finding 4: it was the one
# uncommitted piece of the release path). Holds no secret: the key it names
# is ~/.ssh/scryproof in WSL, the same deploy key as on the Windows side.
# Log goes to ~/deploy.log in WSL.
set -uo pipefail
. ~/.cargo/env
cd ~/scryproof
git pull -q origin main || exit 1
GIT_SSH_COMMAND="ssh -i ~/.ssh/scryproof -o IdentitiesOnly=yes" git push -q production main || exit 1
bonesdeploy deploy > ~/deploy.log 2>&1
code=$?
echo "deploy exit=$code, $(wc -l < ~/deploy.log) lines"
grep -v '^\s*$' ~/deploy.log | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-200 | tail -${1:-40}

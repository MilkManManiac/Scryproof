#!/usr/bin/env bash
# Restart the dev API on a clean database.
#
# Kills only the process listening on the API port, never every node process:
# this machine runs other node tooling and a blanket taskkill takes it down too.
#
#   bash scripts/dev-restart.sh [--keep-data]

set -uo pipefail

PORT="${PORT:-8787}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_DATA=0
[ "${1:-}" = "--keep-data" ] && KEEP_DATA=1

pid="$(powershell.exe -NoProfile -Command \
  "(Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess" \
  2>/dev/null | tr -d '\r\n ')"

if [ -n "$pid" ]; then
  echo "stopping process $pid on port $PORT"
  powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force" >/dev/null 2>&1
  sleep 3
fi

if [ "$KEEP_DATA" -eq 0 ]; then
  echo "clearing the local database"
  rm -rf "$ROOT/server/.data"
fi

cd "$ROOT/server" || exit 1
npx tsx src/index.ts > /tmp/scryproof-server.log 2>&1 &

for _ in $(seq 1 40); do
  if curl -fsS -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "server is up on port $PORT"
    exit 0
  fi
  sleep 1
done

echo "server did not come up; log follows"
tail -30 /tmp/scryproof-server.log
exit 1

#!/usr/bin/env bash
set -euo pipefail

output=$(nginx -t 2>&1)
status=$?
printf '%s\n' "$output"
[ "$status" -eq 0 ] || exit "$status"

case "$output" in
*"conflicting server name"*) exit 1 ;;
esac

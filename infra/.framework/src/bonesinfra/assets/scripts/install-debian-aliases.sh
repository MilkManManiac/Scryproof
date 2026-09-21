#!/usr/bin/env bash
set -euo pipefail

install -d -m 0755 /usr/local/bin

if command -v batcat >/dev/null 2>&1 && [ ! -x /usr/local/bin/bat ]; then
	ln -sf "$(command -v batcat)" /usr/local/bin/bat
fi

if command -v fdfind >/dev/null 2>&1 && [ ! -x /usr/local/bin/fd ]; then
	ln -sf "$(command -v fdfind)" /usr/local/bin/fd
fi

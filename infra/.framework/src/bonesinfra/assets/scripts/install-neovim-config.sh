#!/usr/bin/env bash
set -euo pipefail

NVIM_CONFIG_DIR="/etc/xdg/nvim"
NVIM_CONFIG_REPO="https://github.com/AlextheYounga/myneovim.git"

if [ -d "$NVIM_CONFIG_DIR/.git" ]; then
	git -C "$NVIM_CONFIG_DIR" fetch --depth=1 origin
	git -C "$NVIM_CONFIG_DIR" reset --hard FETCH_HEAD
else
	rm -rf "$NVIM_CONFIG_DIR"
	git clone --depth=1 "$NVIM_CONFIG_REPO" "$NVIM_CONFIG_DIR"
fi

chown -R root:root "$NVIM_CONFIG_DIR"

#!/usr/bin/env bash
set -euo pipefail

NVIM_VERSION_MINIMUM="0.11.1"
NVIM_INSTALL_DIR="/opt/nvim"
NVIM_BIN="/usr/local/bin/nvim"

current_version() {
	if ! command -v nvim >/dev/null 2>&1; then
		return 1
	fi

	nvim --version | sed -n '1s/^NVIM v\([0-9][^[:space:]]*\).*/\1/p'
}

if
	current="$(current_version || true)"
	[[ -n "$current" ]] && dpkg --compare-versions "$current" ge "$NVIM_VERSION_MINIMUM"
then
	exit 0
fi

case "$(uname -m)" in
amd64 | x86_64)
	asset="nvim-linux-x86_64.tar.gz"
	;;
arm64 | aarch64)
	asset="nvim-linux-arm64.tar.gz"
	;;
*)
	echo "Unsupported architecture for Neovim: $(uname -m)" >&2
	exit 1
	;;
esac

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

curl -fsSL "https://github.com/neovim/neovim/releases/latest/download/$asset" -o "$tmp_dir/nvim.tar.gz"
rm -rf "$NVIM_INSTALL_DIR"
install -d -m 0755 "$NVIM_INSTALL_DIR" /usr/local/bin
tar -xzf "$tmp_dir/nvim.tar.gz" -C "$tmp_dir"
cp -R "$tmp_dir"/nvim-linux-*/* "$NVIM_INSTALL_DIR/"
ln -sf "$NVIM_INSTALL_DIR/bin/nvim" "$NVIM_BIN"

installed="$(current_version)"
dpkg --compare-versions "$installed" ge "$NVIM_VERSION_MINIMUM"

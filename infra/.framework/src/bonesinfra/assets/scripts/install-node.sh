#!/usr/bin/env bash
set -euo pipefail

version="${1:?Node version is required}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Node version must be an exact X.Y.Z version: $version" >&2
	exit 1
fi

node_root="/opt/bonesdeploy/node"
install_dir="$node_root/v$version"
if [[ -x "$install_dir/bin/node" ]]; then
	exit 0
fi

case "$(uname -m)" in
x86_64) arch="x64" ;;
aarch64) arch="arm64" ;;
*)
	echo "Unsupported architecture for Node: $(uname -m)" >&2
	exit 1
	;;
esac

archive="node-v$version-linux-$arch.tar.xz"
base_url="https://nodejs.org/dist/v$version"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

curl -fsSL --retry 3 -o "$tmp_dir/$archive" "$base_url/$archive"
curl -fsSL --retry 3 -o "$tmp_dir/SHASUMS256.txt" "$base_url/SHASUMS256.txt"

checksum_line="$(awk -v archive="$archive" '$2 == archive { print; count++ } END { exit count != 1 }' "$tmp_dir/SHASUMS256.txt")"
(cd "$tmp_dir" && printf '%s\n' "$checksum_line" | sha256sum --check --status -)

install -d -m 0755 "$node_root"
tar --no-same-owner -xJf "$tmp_dir/$archive" -C "$tmp_dir"
extracted="$tmp_dir/node-v$version-linux-$arch"
[[ -x "$extracted/bin/node" ]]
"$extracted/bin/node" --version | grep -qx "v$version"
rm -rf -- "$install_dir"
mv "$extracted" "$install_dir"

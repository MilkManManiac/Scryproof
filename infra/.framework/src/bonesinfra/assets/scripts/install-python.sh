#!/usr/bin/env bash
set -euo pipefail

release="${1:?Python release is required}"
checksum="${2:?Python source checksum is required}"
python_root="${3:?Python install root is required}"
minor="${release%.*}"
prefix="$python_root/$release"
python_binary="$prefix/bin/python$minor"

if [[ -x "$python_binary" ]] && [[ "$("$python_binary" --version)" == "Python $release" ]]; then
	exit 0
fi

archive="Python-$release.tar.xz"
source_url="https://www.python.org/ftp/python/$release/$archive"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

curl --connect-timeout 10 --fail --location --max-time 300 --retry 3 --output "$tmp_dir/$archive" "$source_url"
printf '%s  %s\n' "$checksum" "$tmp_dir/$archive" | sha256sum --check --status
tar -xJf "$tmp_dir/$archive" -C "$tmp_dir"

pushd "$tmp_dir/Python-$release" >/dev/null
./configure --prefix="$prefix" --enable-optimizations --with-lto --disable-test-modules
make -j"$(nproc)"
make altinstall
popd >/dev/null

[[ "$("$python_binary" --version)" == "Python $release" ]]
"$python_binary" -c 'import bz2, compression.zstd, ctypes, hashlib, lzma, sqlite3, ssl, uuid, venv, zlib'
install -d -m 0755 /usr/local/bin
ln -sfn "$python_binary" "/usr/local/bin/python$minor"

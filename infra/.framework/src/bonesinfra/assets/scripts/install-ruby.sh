#!/usr/bin/env bash

set -euo pipefail

version="${1:?Ruby version is required}"

case "$version" in
3.2.8) checksum="77acdd8cfbbe1f8e573b5e6536e03c5103df989dc05fa68c70f011833c356075" ;;
3.3.8) checksum="5ae28a87a59a3e4ad66bc2931d232dbab953d0aa8f6baf3bc4f8f80977c89cab" ;;
3.4.8) checksum="53c4ddad41fbb6189f1f5ee0db57a51d54bd1f87f8755b3d68604156a35b045b" ;;
*)
	echo "Unsupported Ruby version: $version" >&2
	exit 1
	;;
esac

ruby_root="/opt/bonesdeploy/ruby"
install_dir="$ruby_root/$version"
ruby_binary="$install_dir/bin/ruby"
bundle_binary="$install_dir/bin/bundle"
if [ -x "$ruby_binary" ] && [ -x "$bundle_binary" ] && "$ruby_binary" --version | grep -q "^ruby $version "; then
	"$bundle_binary" --version >/dev/null
	exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
	bison \
	build-essential \
	ca-certificates \
	curl \
	libffi-dev \
	libgdbm-dev \
	libpq-dev \
	libreadline-dev \
	libssl-dev \
	libyaml-dev \
	shared-mime-info \
	zlib1g-dev

archive="ruby-$version.tar.gz"
source_url="https://cache.ruby-lang.org/pub/ruby/${version%.*}/$archive"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

curl -fsSL --retry 3 --retry-delay 2 -o "$tmp_dir/$archive" "$source_url"
printf '%s  %s\n' "$checksum" "$archive" >"$tmp_dir/$archive.sha256"
(cd "$tmp_dir" && sha256sum --check --status "$archive.sha256")

tar -xzf "$tmp_dir/$archive" -C "$tmp_dir"
source_dir="$tmp_dir/ruby-$version"
install -d -m 0755 "$ruby_root"
rm -rf -- "$install_dir"

(
	cd "$source_dir"
	./configure --prefix="$install_dir" --disable-install-doc
	make -j "$(nproc)"
	make install
)

"$ruby_binary" --version | grep -q "^ruby $version "
[ -x "$bundle_binary" ]
"$bundle_binary" --version >/dev/null

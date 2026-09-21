#!/usr/bin/env bash

BUILD_NODE_TMP_DIR=""
BUILD_RUBY_TMP_DIR=""
COREPACK_VERSION="0.31.0"

log() {
	echo "[bonesdeploy] $*"
}

die() {
	echo "[bonesdeploy] $*" >&2
	exit 1
}

on_error() {
	local status=$?
	echo "[bonesdeploy] Failed at line $LINENO: $BASH_COMMAND (status $status)" >&2
	exit "$status"
}

trap on_error ERR

cleanup_node_install() {
	if [ -n "${BUILD_NODE_TMP_DIR:-}" ]; then
		rm -rf "$BUILD_NODE_TMP_DIR"
	fi
}

cleanup_ruby_install() {
	if [ -n "${BUILD_RUBY_TMP_DIR:-}" ]; then
		rm -rf "$BUILD_RUBY_TMP_DIR"
	fi
}

cleanup_build_toolchain_install() {
	cleanup_node_install
	cleanup_ruby_install
}

trap cleanup_build_toolchain_install EXIT

configure_build_cache() {
	[ -n "${BUILD_CACHE_DIR:-}" ] || return 0

	local directory
	for directory in \
		"$BUILD_CACHE_DIR/corepack" \
		"$BUILD_CACHE_DIR/npm" \
		"$BUILD_CACHE_DIR/pnpm" \
		"$BUILD_CACHE_DIR/yarn/cache" \
		"$BUILD_CACHE_DIR/yarn/global" \
		"$BUILD_CACHE_DIR/composer" \
		"$BUILD_CACHE_DIR/bundler" \
		"$BUILD_CACHE_DIR/node" \
		"$BUILD_CACHE_DIR/ruby"; do
		mkdir -p "$directory"
	done

	export COREPACK_HOME="$BUILD_CACHE_DIR/corepack"
	export NPM_CONFIG_CACHE="$BUILD_CACHE_DIR/npm"
	export PNPM_STORE_DIR="$BUILD_CACHE_DIR/pnpm"
	export YARN_CACHE_FOLDER="$BUILD_CACHE_DIR/yarn/cache"
	export YARN_GLOBAL_FOLDER="$BUILD_CACHE_DIR/yarn/global"
	export COMPOSER_CACHE_DIR="$BUILD_CACHE_DIR/composer"
	export BUNDLE_USER_CACHE="$BUILD_CACHE_DIR/bundler"
}

node_read_version_from_package_json() {
	local version

	version="$(awk '
		$0 ~ /"volta"[[:space:]]*:[[:space:]]*{/ {
			in_section = 1
		}

		in_section {
			line = $0
			if (sub(/.*"node"[[:space:]]*:[[:space:]]*"/, "", line)) {
				sub(/".*/, "", line)
				print line
				exit
			}
		}

		in_section && $0 ~ /}/ {
			in_section = 0
		}
	' package.json)"

	if [ -n "$version" ]; then
		echo "$version"
		return
	fi

	awk '
		$0 ~ /"engines"[[:space:]]*:[[:space:]]*{/ {
			in_section = 1
		}

		in_section {
			line = $0
			if (sub(/.*"node"[[:space:]]*:[[:space:]]*"/, "", line)) {
				sub(/".*/, "", line)
				print line
				exit
			}
		}

		in_section && $0 ~ /}/ {
			in_section = 0
		}
	' package.json
}

node_read_version() {
	if [ -n "${NODE_VERSION:-}" ]; then
		echo "$NODE_VERSION"
		return
	fi

	if [ -f .node-version ]; then
		head -n 1 .node-version
		return
	fi

	if [ -f .nvmrc ]; then
		head -n 1 .nvmrc
		return
	fi

	if [ -f .tool-versions ]; then
		awk '$1 == "nodejs" || $1 == "node" { print $2; exit }' .tool-versions
		return
	fi

	node_read_version_from_package_json
}

node_resolve_version() {
	node_read_version |
		head -n 1 |
		sed -e 's/#.*$//' -e 's/\r$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^v//' || true
}

node_assert_exact_version() {
	local version="$1"

	if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		return
	fi

	die "Node requires an exact pinned version. Set NODE_VERSION or use .node-version, .nvmrc, .tool-versions, or package.json volta."
}

node_architecture() {
	case "$(uname -m)" in
	x86_64)
		echo "x64"
		;;
	aarch64)
		echo "arm64"
		;;
	*)
		die "Unsupported architecture for Node binary install: $(uname -m)"
		;;
	esac
}

node_configure_paths() {
	local version="$1"
	local node_arch="$2"

	: "${BUILD_CACHE_DIR:?BUILD_CACHE_DIR must be set by bonesremote}"

	NODE_DIR="$BUILD_CACHE_DIR/node/v${version}-linux-${node_arch}"
	NODE_BIN="$NODE_DIR/bin/node"

	export NODE_DIR NODE_BIN
}

node_is_installed() {
	local version="$1"

	[ -x "$NODE_BIN" ] && "$NODE_BIN" --version | grep -qx "v$version"
}

node_install() {
	local version="$1"
	local node_arch="$2"
	local archive="node-v${version}-linux-${node_arch}.tar.xz"
	local base_url="https://nodejs.org/dist/v${version}"
	local checksum_line

	node_configure_paths "$version" "$node_arch"
	BUILD_NODE_TMP_DIR="$(mktemp -d "$BUILD_CACHE_DIR/node/.tmp.XXXXXX")"

	log "Installing Node v${version}..."
	log "Downloading ${base_url}/${archive}"
	curl -fsSL --retry 3 --retry-delay 2 -o "$BUILD_NODE_TMP_DIR/$archive" "$base_url/$archive"
	curl -fsSL --retry 3 --retry-delay 2 -o "$BUILD_NODE_TMP_DIR/SHASUMS256.txt" "$base_url/SHASUMS256.txt"

	if ! checksum_line="$(awk -v archive="$archive" '$2 == archive { print; count++ } END { exit count != 1 }' "$BUILD_NODE_TMP_DIR/SHASUMS256.txt")"; then
		die "Node checksum entry not found or not unique for $archive"
	fi
	if ! (cd "$BUILD_NODE_TMP_DIR" && printf '%s\n' "$checksum_line" | sha256sum --check --status -); then
		die "Node archive checksum verification failed for $archive"
	fi

	mkdir "$BUILD_NODE_TMP_DIR/extracted"
	tar --no-same-owner -xJ -f "$BUILD_NODE_TMP_DIR/$archive" -C "$BUILD_NODE_TMP_DIR/extracted"
	local extracted="$BUILD_NODE_TMP_DIR/extracted/node-v${version}-linux-${node_arch}"
	[ -x "$extracted/bin/node" ] || die "Node archive did not contain the expected executable"
	"$extracted/bin/node" --version | grep -qx "v$version" || die "Node archive contained an unexpected version"

	rm -rf "$NODE_DIR"
	mv "$extracted" "$NODE_DIR"
	BUILD_NODE_TMP_DIR=""
}

node_corepack_version() {
	local node_version major minor
	node_version="$(node --version)"
	node_version="${node_version#v}"
	major="${node_version%%.*}"
	minor="${node_version#*.}"
	minor="${minor%%.*}"

	# Corepack 0.25+ requires Node >= 18.17 / >= 20.10 (uses URL.canParse).
	if [ "$major" -lt 18 ] ||
		{ [ "$major" -eq 18 ] && [ "$minor" -lt 17 ]; } ||
		{ [ "$major" -eq 20 ] && [ "$minor" -lt 10 ]; }; then
		echo "0.24.1"
	else
		echo "$COREPACK_VERSION"
	fi
}

node_ensure_corepack() {
	export PATH="$NODE_DIR/bin:$PATH"

	local target_version installed_version
	target_version="$(node_corepack_version)"
	installed_version="$(corepack --version 2>/dev/null || true)"
	if [ "$installed_version" != "$target_version" ]; then
		log "Installing Corepack ${target_version}..."
		npm install --global --prefix "$NODE_DIR" "corepack@${target_version}"
	fi

	corepack enable --install-directory "$NODE_DIR/bin" 2>/dev/null || true
}

install_node_dependencies() {
	local version
	local node_arch

	version="$(node_resolve_version)"
	node_assert_exact_version "$version"
	node_arch="$(node_architecture)"
	node_configure_paths "$version" "$node_arch"

	if node_is_installed "$version"; then
		log "Using cached Node v${version}..."
	else
		node_install "$version" "$node_arch"
	fi

	node_ensure_corepack
	log "Node: $(node --version)"
	log "npm:  $(npm --version)"
}

node_enable_toolchain() {
	local version
	local node_arch

	version="$(node_resolve_version)"
	node_assert_exact_version "$version"
	node_arch="$(node_architecture)"
	node_configure_paths "$version" "$node_arch"

	export PATH="$NODE_DIR/bin:$PATH"
	command -v node >/dev/null 2>&1 || die "node not found"
	command -v npm >/dev/null 2>&1 || die "npm not found"
	node_is_installed "$version" || die "Cached Node installation is missing or has the wrong version"
	node_ensure_corepack
}

ruby_resolve_version() {
	case "${RUBY_VERSION:-}" in
	3.2 | 3.2.8) echo "3.2.8" ;;
	3.3 | 3.3.8) echo "3.3.8" ;;
	3.4 | 3.4.8) echo "3.4.8" ;;
	*) die "Ruby requires one of 3.2.8, 3.3.8, or 3.4.8. Set RUBY_VERSION in .env.build." ;;
	esac
}

ruby_configure_paths() {
	local version="$1"

	: "${BUILD_CACHE_DIR:?BUILD_CACHE_DIR must be set by bonesremote}"

	RUBY_DIR="$BUILD_CACHE_DIR/ruby/$version"
	RUBY_BIN="$RUBY_DIR/bin/ruby"

	export RUBY_DIR RUBY_BIN
}

ruby_is_installed() {
	local version="$1"

	[ -x "$RUBY_BIN" ] && "$RUBY_BIN" --version | grep -q "^ruby $version "
}

ruby_checksum() {
	case "$1" in
	3.2.8) echo "77acdd8cfbbe1f8e573b5e6536e03c5103df989dc05fa68c70f011833c356075" ;;
	3.3.8) echo "5ae28a87a59a3e4ad66bc2931d232dbab953d0aa8f6baf3bc4f8f80977c89cab" ;;
	3.4.8) echo "53c4ddad41fbb6189f1f5ee0db57a51d54bd1f87f8755b3d68604156a35b045b" ;;
	esac
}

ruby_install() {
	local version="$1"
	local archive="ruby-$version.tar.gz"
	local checksum
	local source_url="https://cache.ruby-lang.org/pub/ruby/${version%.*}/$archive"

	ruby_configure_paths "$version"
	checksum="$(ruby_checksum "$version")"
	BUILD_RUBY_TMP_DIR="$(mktemp -d "$BUILD_CACHE_DIR/ruby/.tmp.XXXXXX")"

	log "Installing Ruby $version..."
	apt-get update
	DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
		bison build-essential ca-certificates curl libffi-dev libgdbm-dev libpq-dev \
		libreadline-dev libssl-dev libyaml-dev shared-mime-info zlib1g-dev
	curl -fsSL --retry 3 --retry-delay 2 -o "$BUILD_RUBY_TMP_DIR/$archive" "$source_url"
	printf '%s  %s\n' "$checksum" "$archive" >"$BUILD_RUBY_TMP_DIR/$archive.sha256"
	(cd "$BUILD_RUBY_TMP_DIR" && sha256sum --check --status "$archive.sha256") || die "Ruby archive checksum verification failed"
	tar -xzf "$BUILD_RUBY_TMP_DIR/$archive" -C "$BUILD_RUBY_TMP_DIR"

	rm -rf "$RUBY_DIR"
	(
		cd "$BUILD_RUBY_TMP_DIR/ruby-$version"
		./configure --prefix="$RUBY_DIR" --disable-install-doc
		make -j "$(nproc)"
		make install
	)
	ruby_is_installed "$version" || die "Ruby installation did not contain version $version"
	BUILD_RUBY_TMP_DIR=""
}

ruby_enable_toolchain() {
	local version

	version="$(ruby_resolve_version)"
	ruby_configure_paths "$version"
	if ! ruby_is_installed "$version"; then
		ruby_install "$version"
	fi

	export PATH="$RUBY_DIR/bin:$PATH"
	command -v ruby >/dev/null 2>&1 || die "Ruby not found"
	command -v bundle >/dev/null 2>&1 || die "Bundler not found"
	ruby_is_installed "$version" || die "Cached Ruby installation is missing or has the wrong version"
	log "Ruby: $(ruby --version)"
}

configure_build_cache

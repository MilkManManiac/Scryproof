#!/usr/bin/env bash
# Build the release.
#
# `npm ci`, not the stock kit's `npm install`. `ci` installs the lockfile
# verbatim; `install` lets npm choose versions, which is the moment a poisoned
# release gets picked up. The committed .npmrc keeps install scripts off either
# way. Nothing in this tree needs them: argon2, esbuild and rollup all ship
# their native parts as prebuilt optional packages.

set -Eeuo pipefail

source /workspace/deployment/functions.sh

node_enable_toolchain

rm -rf node_modules

npm ci --include=optional
npm run build

# Fail the build here, not at 9pm on a D&D night.
test -f server/dist/index.js || die "server bundle missing"
test -f web/dist/index.html || die "web build missing"
test -f server/drizzle/meta/_journal.json || die "migrations missing"

# What runs on the box needs runtime packages only. The test runners, the
# TypeScript compiler and both bundlers stay behind.
npm prune --omit=dev --include=optional

# The one thing a scripts-off install can get wrong is a missing prebuilt
# binary, and it would otherwise surface as "nobody can log in".
node -e "import('@node-rs/argon2').then(m => m.hash('build-check')).then(() => console.log('[build] argon2 native module loads'))"

#!/usr/bin/env bash
# Runs inside bonesremote's build container. Installs the exact Node named in
# .node-version, checksum-verified, into the build cache.

set -Eeuo pipefail

source /workspace/deployment/functions.sh

install_node_dependencies

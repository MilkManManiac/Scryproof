#!/usr/bin/env bash
set -euo pipefail

install -d -m 0755 /etc/apt/keyrings

curl -fsSL https://pgp.mongodb.com/server-8.0.asc -o /tmp/mongodb-server-8.0.asc
gpg --dearmor --yes -o /etc/apt/keyrings/mongodb-server-8.0.gpg /tmp/mongodb-server-8.0.asc
rm /tmp/mongodb-server-8.0.asc

. /etc/os-release
component=main
[ "$ID" = ubuntu ] && component=multiverse
echo "deb [signed-by=/etc/apt/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/$ID $VERSION_CODENAME/mongodb-org/8.0 $component" >/etc/apt/sources.list.d/mongodb-org-8.0.list

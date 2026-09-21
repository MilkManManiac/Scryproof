#!/usr/bin/env bash
# Install the LiveKit media server: a pinned release, checked against a known
# SHA-256 before anything is unpacked, run as its own user, gated by the vault.
#
#   60-livekit-install.sh <domain>
#
# Run it with the vault unlocked. The config holds the API secret, so it is
# written to the vault and nowhere else. The secret is generated here, on the
# box, and printed once so it can go into the app's .env (also on the vault).
#
# The unit and config below are copies of infra/livekit/livekit.service and
# infra/livekit/livekit.yaml.template. scripts/box.sh only ships this folder,
# so they are carried inline. Change one, change the other.

source "$(dirname "$0")/lib.sh"
need_root

LIVEKIT_VERSION="1.13.6"
# TODO before first use: fill this in. Only the Windows build's hash has been
# verified so far. Get it from checksums.txt on the v1.13.6 GitHub release page,
# read on a machine other than this box, and paste the 64 hex characters here.
# The script refuses to run while this is empty.
LIVEKIT_SHA256=""

ASSET="livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz"
URL="https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/${ASSET}"
CONFIG_DIR="$VAULT_MOUNT/livekit"
CONFIG="$CONFIG_DIR/livekit.yaml"
UNIT="livekit.service"

[ "$#" -eq 1 ] || die "usage: 60-livekit-install.sh <domain>"
DOMAIN="$1"
case "$DOMAIN" in
  *[!a-z0-9.-]*|""|.*|*..*) die "that does not look like a hostname: $DOMAIN" ;;
esac

[[ "$LIVEKIT_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "LIVEKIT_SHA256 is not filled in. Read the TODO at the top of this script."
[ "$(uname -m)" = "x86_64" ] || die "this installs the amd64 build, and this machine is $(uname -m)."
# Mounted is enough here. During first setup the unlocked flag does not exist
# yet, because scryproof-unlock is only installed by 30-gate-services.sh.
vault_is_mounted || die "the vault is not mounted. The config must be written onto it."

say "Download LiveKit $LIVEKIT_VERSION"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 -o "$work/$ASSET" "$URL"
note "fetched $ASSET"

say "Verify"
actual="$(sha256sum "$work/$ASSET" | cut -d' ' -f1)"
if [ "$actual" != "$LIVEKIT_SHA256" ]; then
  note "expected $LIVEKIT_SHA256"
  note "got      $actual"
  die "checksum mismatch. Nothing was installed."
fi
note "sha256 matches"

say "Install the binary"
tar -C "$work" -xzf "$work/$ASSET" livekit-server
install -o root -g root -m 0755 "$work/livekit-server" /usr/local/bin/livekit-server
note "$(/usr/local/bin/livekit-server --version)"

say "User"
if id livekit >/dev/null 2>&1; then
  note "exists"
else
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin livekit
  note "created livekit (no login, no home)"
fi
if getent group ssl-cert >/dev/null; then
  usermod -a -G ssl-cert livekit
  note "added to ssl-cert, to read the TLS key for TURN"
else
  note "no ssl-cert group here; check how the livekit user will read the TLS key"
fi

say "Config, on the vault"
install -d -o root -g livekit -m 0750 "$CONFIG_DIR"
if [ -f "$CONFIG" ]; then
  note "kept the existing $CONFIG (delete it to generate new keys)"
else
  # The box's own public address, read off the network card. Asking the outside
  # world (LiveKit's default is a Google STUN server) is a third party we do
  # not need and our firewall blocks.
  public_ip="$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  case "$public_ip" in
    ''|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*)
      die "could not find a public IPv4 on this box (got '$public_ip'); set node_ip by hand" ;;
  esac
  note "media address $public_ip"
  key="GO$(openssl rand -hex 6)"
  secret="$(openssl rand -hex 32)"
  umask 077
  cat > "$CONFIG" <<CONF
# Rendered by 60-livekit-install.sh from infra/livekit/livekit.yaml.template.
# The comments live in the template.
port: 7880
bind_addresses:
  - 127.0.0.1

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
  node_ip: $public_ip
  stun_servers:
    - $DOMAIN:3478

turn:
  enabled: true
  domain: $DOMAIN
  udp_port: 3478
  tls_port: 5349
  external_tls: false
  cert_file: /etc/ssl/certs/$DOMAIN.fullchain.pem
  key_file: /etc/ssl/private/$DOMAIN.key
  relay_range_start: 40000
  relay_range_end: 40999

keys:
  $key: $secret

logging:
  level: info
  json: false
  pion_level: error
CONF
  chown root:livekit "$CONFIG"
  chmod 0640 "$CONFIG"
  note "wrote $CONFIG"
  printf '\n    Put these three lines in the app .env on the vault. They are shown once.\n\n'
  printf '      LIVEKIT_URL=wss://%s\n' "$DOMAIN"
  printf '      LIVEKIT_API_KEY=%s\n' "$key"
  printf '      LIVEKIT_API_SECRET=%s\n\n' "$secret"
fi

for path in "/etc/ssl/certs/$DOMAIN.fullchain.pem" "/etc/ssl/private/$DOMAIN.key"; do
  if [ -e "$path" ]; then note "found   $path"; else note "MISSING $path  (TURN over TLS will not start until the config points at the real certificate)"; fi
done

say "Service"
cat > "/etc/systemd/system/$UNIT" <<'CONF'
[Unit]
Description=LiveKit media server (Scryproof voice)
After=network-online.target
Wants=network-online.target

[Service]
User=livekit
Group=livekit
SupplementaryGroups=ssl-cert
ExecStart=/usr/local/bin/livekit-server --config /mnt/vault/livekit/livekit.yaml
Restart=on-failure
RestartSec=3
LimitNOFILE=65536

NoNewPrivileges=true
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true
SystemCallArchitectures=native
SystemCallFilter=@system-service
UMask=0077
ReadOnlyPaths=/mnt/vault/livekit

[Install]
WantedBy=multi-user.target
CONF
systemctl daemon-reload
# Not enabled: a locked box must not try to start it. scryproof-unlock does.
systemctl disable "$UNIT" >/dev/null 2>&1 || true
mkdir -p "$STATE_DIR"
touch "$UNITS_FILE"
grep -qxF "$UNIT" "$UNITS_FILE" || printf '%s\n' "$UNIT" >> "$UNITS_FILE"
note "installed, and listed in $UNITS_FILE"
note "now run 30-gate-services.sh again so it gets the vault drop-in, then scryproof-unlock starts it"

say "Done."

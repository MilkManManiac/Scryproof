#!/usr/bin/env bash
# The firewall, inbound and outbound. GAMEPLAN section 4.
#
#   40-firewall.sh <ssh-port>
#
# RUN THIS AGAIN AFTER EVERY `bonesdeploy server setup`. That command resets the
# outbound default to "allow" (services/linux/firewall.py in bonesdeploy 0.8.7),
# which silently undoes the half of this file that matters most.
#
# Inbound is the ordinary part. Outbound is the instrument: default deny, with
# logging, and a short list of things this box is allowed to reach. After a day
# of real use, the log is the *proof* that nothing on the box phones home:
# LiveKit, Node, every npm package. Not a belief. A log.
#
#   journalctl -k --since yesterday | grep 'UFW BLOCK' | grep 'OUT='

source "$(dirname "$0")/lib.sh"
need_root

ssh_port="${1:-}"
case "$ssh_port" in
  ''|*[!0-9]*) die "pass the SSH port, e.g. 40-firewall.sh 22. Getting this wrong locks you out." ;;
esac

# The port in use by this very session, as a guard against a typo.
if [ -n "${SSH_CONNECTION:-}" ]; then
  live_port="$(printf '%s' "$SSH_CONNECTION" | awk '{print $4}')"
  [ "$live_port" = "$ssh_port" ] || die "you said SSH is on $ssh_port but this session is on $live_port. Refusing."
fi

MEDIA_UDP="50000:60000"   # LiveKit media. Must match livekit.yaml.
TURN_RELAY="40000:40999"  # LiveKit's built-in TURN relay range. Must match too.

say "Inbound"
ufw allow "$ssh_port/tcp"  comment 'ssh'
ufw allow 80/tcp           comment 'http: redirect and ACME'
ufw allow 443/tcp          comment 'https'
ufw allow 7881/tcp         comment 'livekit: media over TCP fallback'
ufw allow "$MEDIA_UDP/udp" comment 'livekit: media'
ufw allow 3478/udp         comment 'turn'
ufw allow 5349/tcp         comment 'turn over TLS'
ufw allow "$TURN_RELAY/udp" comment 'turn relay'
ufw --force default deny incoming

say "Outbound"
ufw allow out 53           comment 'dns'
ufw allow out 123/udp      comment 'ntp'
ufw allow out 80/tcp       comment 'apt, ACME'
ufw allow out 443/tcp      comment 'apt, ACME, nodejs.org, npm, container registry, backups'
# Media is UDP to whatever port the visitor's router picked, so the destination
# cannot be listed. The *source* can: only LiveKit's own port ranges may send.
ufw allow out proto udp from any port "$MEDIA_UDP"  comment 'livekit media to clients'
ufw allow out proto udp from any port "$TURN_RELAY" comment 'turn relay to clients'
ufw allow out proto udp from any port 3478          comment 'turn replies'
ufw --force default deny outgoing

say "Logging"
# "low" logs every blocked packet, rate limited. That is the instrument.
ufw logging low

ufw --force enable
ufw status verbose | sed 's/^/    /'

say "Check from a SECOND terminal that SSH still works before closing this one."

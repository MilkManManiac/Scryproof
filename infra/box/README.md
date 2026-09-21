# M0 runbook: from an empty droplet to a box that boots dumb

**Every script in this folder is UNVERIFIED.** They have been syntax-checked and
read carefully, and none has ever run on a real machine. Expect to fix things.
The first run is on a droplet with nothing on it, which is exactly when mistakes
are free. When a step here turns out wrong, fix the script and this file in the
same commit.

How to read this: one command per step. Run it, look at the last lines, and do
not go on until it says `==> Done.` A line starting `FAILED:` means stop and
send a screenshot.

Every box command is run from this PC, in the repo folder, through
`scripts/box.sh`. It copies `infra/box/remote/` to the box and runs the script
you name. Nothing is typed on the box itself.

Two rules that never bend:

- The vault passphrase lives in Wes's password manager and nowhere else. It is
  typed (pasted) into a prompt. It is never put in a command, a file, a chat
  message or a screenshot.
- Nothing secret is written before step 4. Until the vault exists, the box has
  only an unencrypted disk.

## Before step 1 (Wes, in the DigitalOcean panel)

- Droplet: Ubuntu 24.04, 2 GB / 1 vCPU, region ATL1, SSH key `gooffline`,
  backups off, monitoring off.
- Volume: 10 GB, same region, attached to the droplet, **"Manually Format and
  Mount"**. If DigitalOcean formats it, step 4 will refuse to touch it.
- Domain: an A record pointing at the droplet's IPv4. No proxy in front.
- Generate the vault passphrase in the password manager (6+ random words or
  24+ characters) and save it there first.

## 1. Tell the PC where the box is

Create `.env.box` in the repo root (it is gitignored):

    BOX_HOST=<droplet IPv4>
    BOX_PORT=22
    BOX_USER=root
    BOX_KEY=~/.ssh/gooffline

## 2. Look before touching anything

    bash scripts/box.sh 00-facts.sh

Read-only. Prints the OS, disks, the attached volume, swap, listening ports and
which DigitalOcean agents are installed. Keep the output: it is the "before".

## 3. Host hygiene

    bash scripts/box.sh 50-host-hygiene.sh

Removes the DigitalOcean agents, turns swap off for good, disables core dumps,
makes the system journal RAM-only, and registers the service that archives logs
onto the vault once it is open.

## 4. Create the vault (once, ever)

    bash scripts/box.sh 10-vault-create.sh

Asks for the passphrase twice. Paste from the password manager; nothing shows
as you type. It formats the volume as LUKS2, mounts it at `/mnt/vault`, and
saves a header backup at `/root/gooffline-vault-header.img`.

Afterwards, copy the header backup to this PC and delete it from the box. The
header is useless without the passphrase, but a damaged header with no backup
means the data is gone.

    scp -i ~/.ssh/gooffline root@<droplet IPv4>:/root/gooffline-vault-header.img ./

Store that file with the passphrase entry in the password manager, then remove
it from the repo folder.

## 5. Put the secret-holding folders on the vault, before anything fills them

    bash scripts/box.sh 20-vault-adopt.sh /srv/sites /srv/conf /var/lib/postgresql /etc/ssl/private /etc/letsencrypt

Each path becomes a bind mount backed by `/mnt/vault/binds/`. Doing this before
bonesdeploy and Postgres are installed means their secrets never touch the root
disk at all. The exact list is a best guess from reading bonesdeploy 0.8.7;
compare it with what step 6 actually creates and adopt anything missed.

## 6. bonesdeploy

Needs the bonesdeploy CLI on this PC, which needs Rust. That is an install on
Wes's machine: ask first.

    bonesdeploy init

`init` overwrites `infra/custom/runtime.py` and `manifest.py` with stubs. Put
ours back straight away:

    git checkout infra/custom

In the bonesdeploy config, set the template to `custom` and
`web_root = web/dist`. That folder is the only part of a release nginx is
allowed to read. Then:

    bonesdeploy server setup

## 7. Firewall, again, every time

    bash scripts/box.sh 40-firewall.sh 22

`bonesdeploy server setup` resets outbound traffic to "allow". This puts back
default-deny with logging. Run it after every `server setup`, no exceptions. It
refuses to run if the port you give is not the port your SSH session is on.

## 8. The app's settings

Write `/srv/sites/gooffline/shared/.env` on the box from `infra/.env.example`.
Generate `SESSION_SECRET` on the box (`openssl rand -hex 32`). The file is on
the vault because of step 5. It is never copied to this PC.

## 9. LiveKit

First fill in `LIVEKIT_SHA256` at the top of `60-livekit-install.sh` from the
release's `checksums.txt`. The script refuses to run until that is done.

    bash scripts/box.sh 60-livekit-install.sh <domain>

Prints three `LIVEKIT_...` lines once. Add them to the `.env` from step 8.
It also reports whether the TLS certificate is where the config expects;
if it says MISSING, correct the two paths in `/mnt/vault/livekit/livekit.yaml`.

## 10. First deploy

    git push production main

(or whatever remote name `bonesdeploy init` set up). The build runs on the box
in a container.

**Known risk: 2 GB of RAM and no swap.** `npm ci` plus the Vite and esbuild
builds may be killed for memory. If the build dies with no error, or with
"Killed", that is what happened. Options, best first:

1. Resize the droplet to 4 GB for the build ("CPU and RAM only", so it can be
   sized back down), then shrink it again. Costs cents.
2. Lower Node's appetite in `infra/deployment/build/02_build.sh`
   (`NODE_OPTIONS=--max-old-space-size=1024`) and build the two workspaces one
   after the other rather than together.
3. Swap, but only as a file **on the vault** and only during a build. Never
   swap on the root disk: memory contains the vault key.

## 11. Gate everything behind the vault

List units in the order they should start. Get the app's real unit name from
`systemctl list-units 'gooffline*'` first.

    bash scripts/box.sh 30-gate-services.sh postgresql.service livekit.service <the app unit> nginx.service

This also installs `gooffline-unlock` and `gooffline-lock` on the box. Any unit
added to `/etc/gooffline/units.list` later (step 9 adds `livekit.service`) only
gets its drop-in when this script is run again with that unit named.

## 12. The test that matters: reboot and find it locked

    bash scripts/box.sh gooffline-lock

Then reboot the droplet from the DigitalOcean panel and wait two minutes.

    bash scripts/box.sh 00-facts.sh

Expected: vault closed, `/mnt/vault` not mounted, Postgres, LiveKit, the app
and nginx all not running, nothing answering on 443. The site being DOWN after
a reboot is the pass condition. If anything started by itself, M0 has failed
and that unit needs gating.

## 13. Unlock

    bash scripts/unlock.sh

Paste the passphrase. It opens the vault, restores the bind mounts, sets the
unlocked flag and starts the units in order. Open the site in a browser.

## 14. Proof and paperwork

- Run `00-facts.sh` once more and keep the output as the "after".
- After a day of use, check that nothing phoned home:
  `journalctl -k --since yesterday | grep 'UFW BLOCK' | grep 'OUT='`
  Expect nothing. LiveKit is told its own address (`node_ip`) so that it does
  not ask Google's STUN server for it. Anything listed here is a program
  trying to reach a third party, and each line needs an explanation.
- URL and screenshot into `docs/HANDOFF.md`. M0 is not done until they are.

## After any reboot, forever

    bash scripts/unlock.sh

That is the whole procedure. The box cannot come back by itself, by design.

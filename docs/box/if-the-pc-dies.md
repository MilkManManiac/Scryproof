# If the PC dies

Every private file that only this PC holds, where its second copy is, and
whether that was checked. Written 2026-10-10 (audit finding 4) by looking at
the actual folders on this PC, in WSL, and on the box (read-only). "Checked"
means the file was seen; "logged" means HANDOFF says Wes copied it, nobody
opened the password manager to look.

Without the private files on this list, the box keeps running, but nobody
can deploy to it, release a desktop client, open a backup, or unlock the
vault after a reboot. That is the whole point of them; it is also why each
needs a second copy that is not on this disk.

| File | What it is for | On this PC | Second copy | Status |
|---|---|---|---|---|
| `~/.ssh/scryproof` (+ `.pub`) | The only SSH key the box accepts. Every `scripts/box.sh`, `backup-pull.sh`, `publish-*.sh` and the `production` git remote use it. | Checked: 411 bytes, ed25519, comment `gooffline-deploy`. | WSL `~/.ssh/scryproof` is the same key (identical `.pub`), but WSL is on this same disk. **No copy off the PC is recorded.** | **TO DO** |
| `~/.scryproof/update-key.pem` | Signs every desktop client update. Lose it and every installed app has to be reinstalled from a new installer. | Checked: 119 bytes. | Bitwarden secure note, logged 2026-09-21 (HANDOFF "The signing key"). | logged |
| `~/.scryproof-backup/backup-private-key.asc` (+ `gnupg/`) | Opens every backup. Nothing on the box can. | Checked: 723 bytes; `gnupg/` holds the same key. | Password manager, logged 2026-09-23 (HANDOFF "Done 2026-09-23"). | logged |
| `~/Documents/Scryproof-keep/gooffline-vault-header.img` | LUKS header backup. A damaged header means the vault is gone even with the passphrase. | Checked: 16 MB, 2026-09-21. Deleted from the box as the runbook says (`/root/scryproof-vault-header.img` is absent). | **None recorded.** It is useless without the passphrase, so it can sit next to the passphrase. | **TO DO** |
| The vault passphrase | Unlocks the vault after any reboot. | Not on this PC, by design. | Bitwarden, logged (HANDOFF "Vault"). | logged |
| `.env.box` (repo root, gitignored) | The box address for the scripts. | Checked. | Not secret: four lines (host `68.183.16.145`, port 22, user root, key path). Retype it from `infra/box/README.md` step 1. | nothing to do |
| WSL `~/scryproof/infra/secrets/.env.gpg` | The Postgres password, for `bonesdeploy site setup`. | Checked: 824 bytes, encrypted to RSA key `1EC9AA852E9DD0EF`. | **That key is not in WSL and was not found in root's or git's gpg home on the box.** As far as this check can tell nobody can open the file. It does not matter for a restore: the same password is in `DATABASE_URL` in the vault `.env`, which the backup now carries. | note only |
| WSL `~/ship.sh` | The deploy step. | Was uncommitted. | Now `scripts/ship.sh` in the repo. | done |
| `~/Scryproof-backups/*.tar.gpg` | The pulled backups. | Checked: newest is `scryproof-20260923-023548.tar.gpg`. The box holds the last seven nightly ones (newest 2026-10-09). | The box, until it dies too. | pull them (below) |

## To do (Wes)

Two files have no copy off this PC. One command each, from Git Bash in the
repo folder. Each prints the file; put it in a Bitwarden secure note with
the name shown, then clear the terminal.

1. The SSH key. Note name `scryproof ssh key`:

       cat ~/.ssh/scryproof

   Paste the whole thing including the BEGIN and END lines. To put it back
   on a new PC: paste into `~/.ssh/scryproof`, then `chmod 600 ~/.ssh/scryproof`.

2. The LUKS header. 16 MB, too big for a note, so Bitwarden file attachment
   (needs Premium) or any second disk or drive Wes trusts. The file is
   harmless on its own. Note name `scryproof vault header`:

       cp ~/Documents/Scryproof-keep/gooffline-vault-header.img ~/Downloads/

   then attach `Downloads\gooffline-vault-header.img` and delete it from
   Downloads.

3. The backups have not been pulled since 2026-09-23. Pull and check them;
   the check also proves the new `.env` and `livekit.yaml` are in the tar
   once the box has run the new backup script (`bash scripts/box.sh 70-backups.sh`):

       bash scripts/backup-pull.sh
       node scripts/backup-check.mjs

## On a new PC

1. Install Git, Node, WSL Ubuntu with Rust and bonesdeploy (README step 6).
2. Put back: `~/.ssh/scryproof` (600), `~/.scryproof/update-key.pem`,
   `~/.scryproof-backup/backup-private-key.asc` then
   `gpg --homedir ~/.scryproof-backup/gnupg --import` it, `.env.box` from
   README step 1, the vault header somewhere safe.
3. Clone the repo, `npm ci`. In WSL, clone it again at `~/scryproof` with
   `origin` pointing at the Windows checkout (`/mnt/c/Users/<you>/CodeProjects/GoOffline`)
   and `production` at `git@68.183.16.145:/home/git/scryproof.git`, and
   copy the SSH key into WSL's `~/.ssh/` too.
4. `bash scripts/box.sh 00-facts.sh` proves the key; `bash scripts/backup-pull.sh`
   then `node scripts/backup-check.mjs` proves the backup key.

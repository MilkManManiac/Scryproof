# Running log: things Alex may want to hear about

`docs/for-alex.md` is the note as it was sent on 2026-09-21. It stays as sent.
This file is what has happened since: anything we did around bonesdeploy that
he might want to know, whether a claim in the note turned out right or wrong
once it was actually run, and any place we touched something his tool manages.

Rules for this file:

- Write the entry when the thing happens, not at the end.
- Say whether it was run or only read. The note was all reading.
- If a claim in the note turns out wrong, say so here plainly. He should hear
  that from us before he spends time on it.
- Anything we change on the box that bonesdeploy owns (the router config, its
  units, its directories) gets an entry, with what we changed and why.

## 2026-09-21

- **Decided to run the CLI under WSL** rather than wait for an answer on item 9.
  Nothing of his is bypassed: it is his tool on Linux, which is the platform it
  targets. If he replies "use WSL", we already have. Worth telling him how it
  went either way, since the note asks whether anyone has done it.
- Nothing of bonesdeploy's has been run yet. Every item in the note is still
  unverified.

### Later the same day: the CLI ran, and two claims in the note are wrong

All of this was run, not read. WSL2, Ubuntu 26.04, rustc 1.98.1.

- **Item 9, answered: WSL works.** `cargo install --locked --git ... --tag
  v0.8.7 bonesdeploy` built first time in 24 seconds. It needed
  `build-essential pkg-config libssl-dev` and rustup, nothing else. SSH from
  WSL to the box works with the key copied into `~/.ssh` at mode 600.
- **One WSL catch worth telling him.** `init` fails if the repo is on the
  Windows drive (`/mnt/c/...`): "Failed to set permissions on
  infra/deployment/functions.sh, Operation not permitted". A DrvFs mount cannot
  chmod. The repo has to be cloned inside the Linux filesystem. Ours is at
  `~/scryproof`, with the Windows repo as its `origin`.
- **Item 6 is wrong as written.** `init` did not overwrite our
  `infra/custom/`. With an `infra/` directory already present it prints "Using
  existing infra/ configuration", scaffolds nothing, and leaves
  `BONES_TEMPLATE` and `BONES_SERVICES` empty, ignoring `--template` and
  `--service`. That is a different surprise: a repo that already has an
  `infra/` folder of its own (ours held `box/` and `livekit/`) is taken for an
  initialized project and never gets `infra/.framework`. We moved `infra/`
  aside, ran init fresh, and put our folders back. The overwrite I described is
  only reachable on a fresh init, where there is nothing to overwrite unless
  you do what we did.
- **Items 1 and 2 are wrong on one point that matters.** The note says the
  router template is his file and cannot be fixed from the project. It can:
  init materializes the whole of bonesinfra into `infra/.framework/` in our
  repo, committed, and `bonesinfra::run` executes that copy. So
  `infra/.framework/src/bonesinfra/assets/nginx/router.conf.j2` is editable
  here. The open question changes to: is editing the managed copy acceptable,
  given `bonesdeploy update` replaces `infra/.framework` wholesale? Whether the
  router really drops upgrades is still untested.
- **The note's paths are from the wrong layer.** It cites
  `crates/bonesinfra/python/src/bonesinfra/...`; what a project actually sees
  is the same tree under `infra/.framework/src/bonesinfra/`.
- **Build container is rootless Podman**, per the tool's own `skill` doc, with
  the build user's slice capped at 80% of memory and no swap. On a 1 GB box
  that is about 800 MB for `npm ci` and a Vite build. The resize question
  stands.
- **`BONES_PREVIEW_DOMAIN` defaults to a nip.io name.** A third-party DNS
  service. We have our own domain and set `BONES_DOMAIN`; need to check nothing
  requests a certificate or serves on the nip.io name.
- `bonesdeploy skill` (docs for AI agents, plus `skill next`) exists and is
  good. The note never mentions it because I had not found it.

Not yet run at that point: `server setup`, `site setup`, `site ssl`, `deploy`.

### Evening: `server setup` and `site setup` both pass, after three fixes

All run against the real box (Ubuntu 24.04, 1 GB, swap off). The placeholder
page answers at http://scryproof.com/.

- **Both open questions answered: yes.** 1 GB with swap off was enough for
  `server setup` and `site setup` (about 450 MB used afterwards). And neither
  minded `/srv/sites` and `/srv/conf` already existing as bind mounts. The
  build has not been tried yet.
- **The CLI needs `python3-venv` locally** and says so clearly. Not a bug. On a
  fresh WSL Ubuntu it is one more apt package.
- **It installs pyinfra with pip and ignores its own `uv.lock`.** The lock pins
  3.8.0; we got 3.10.0. Made no difference to anything below; tried both.

Three changes to the managed copy in `infra/.framework/`. All three are bugs
for anyone on this setup, not preferences of ours, and each is the smallest
edit that worked. `bonesdeploy update` will replace them, so they need
reapplying, or fixing upstream:

1. **Postgres, `services/runtime/postgres.py` line 22.** `user=f"{project}_postgres"`
   is passed to `server.script_template`, which hands `**data` to
   `files.template`, and `files.template` has its own `user` parameter (the
   file owner). So the value never reaches the template and rendering fails:
   `configure-postgres-project.sh.j2 (L4): 'user' is undefined`. The script
   never uses `$USER` anyway. Removed the kwarg and line 4 of the template.
2. **Postgres, same template, the CREATE DATABASE line.** It runs
   `psql -v database=... -c "SELECT format(..., :'database', :'user') ... \gexec"`.
   psql does not expand variables or run backslash commands in a `-c` string, so
   the server sees a literal `:` and errors: `syntax error at or near ":"`.
   Changed to feed the same statement on stdin with a heredoc. The mysql
   template has the same `USER="{{ user }}"` line; not tested.
   Taken together: I do not think `--service postgres` can have worked on
   0.8.7. Worth asking him whether it is new.
3. **`aa-enforce` on Ubuntu 24.04**, `services/linux/apparmor/nginx.py` and
   `app.py`. `aa-enforce` parses every file in `/etc/apparmor.d`, and
   apparmor-utils 4.0.1 cannot parse `abstractions/passt`, which arrives with
   Podman: `Operation {'runbindable'} cannot have a source`, and after that
   `Can't parse mount rule mount "" -> "/tmp/"`. This is Ubuntu's bug, not his,
   but it stops `site setup` dead on 24.04. `apparmor_parser -r` has already
   loaded the profile in enforce mode, so the step is now a check instead:
   `grep -qxF "<profile> (enforce)" /sys/kernel/security/apparmor/profiles`.
   We briefly edited the passt file on the box, then put it back byte for byte.

Also seen:

- `site setup` does not touch ufw. Only `server setup` resets outbound to
  allow. Item 8 stands, narrowed to that one command.
- Our `infra/custom/runtime.py` and templates ran without changes. The
  `custom` hook did what the docs say.

### Night: first deploy, and items 1 and 2 confirmed by test

- **The build fits in 1 GB.** `npm ci`, esbuild and a Vite build ran inside the
  Podman container on the 1 GB box with swap off, first try, about a minute.
  No resize. That closes the memory question.
- **Build scripts live in `infra/deployment/build/` on 0.8.7**, not the
  top-level `deployment/build/` the README describes. With ours in the old
  place the deploy said "No deployment scripts ... running build steps directly
  on the exported source tree", built nothing, then failed safely at
  "New release web root does not exist" and removed the release. Good failure;
  the README section is stale.
- **Item 1 confirmed, layer by layer, on the box.** Same WebSocket handshake
  sent three ways: to the app on 127.0.0.1:8787 it gets the app's 401 (upgrade
  understood, no session); to the per-site nginx socket, 401; to the router on
  port 80, 404, because the router forwarded it as a plain GET. After the
  change in `docs/bonesdeploy-router.patch` (now applied to
  `infra/.framework/.../nginx/router.conf.j2`, and `project_name` is in the
  render context as assumed), the router gives 401 too. The patch is no longer
  untested.
- **Item 2 confirmed.** A 2 MB POST through the router: 413. A 1-byte POST to
  the same URL: 404 from the app. With `client_max_body_size` in the router it
  reaches the app. We defaulted ours to 110m in our copy; upstream would want
  1m and a setting. `ctx.runtime.data` already flows into the template context,
  so the plumbing may be one line.
- **Item 5 (native addons under AppArmor): not a problem with our own profile.**
  argon2 loads in the build and the service runs under the enforced profile.
  The stock profile was never tried, so that item stays a reading, not a finding.
- **Secrets.** `init` generates `POSTGRES_URL` and friends into
  `infra/secrets/.env.gpg`. We did not use `secrets push`, because it replaces
  `shared/.env` whole and our rule is that app secrets are made on the box. We
  piped `POSTGRES_URL` over SSH and built the rest of `.env` there.

Still not run: `site ssl`.

## Still to find out, and report back

- Item 9: does `cargo install` of the CLI succeed under WSL (Ubuntu), and does
  `native-mux` SSH work from WSL to the box with Wes's key?
- Item 1: do WebSockets really fail through the stock router? Test before
  touching the router. If they fail, stop and ask him before editing his file.
- Item 2: does a 2 MB upload really get a 413 from the router?
- Item 5: does argon2 fail to load under the stock AppArmor profile, or only in
  my reading of it?
- Item 6: does `init` overwrite `infra/custom/runtime.py` as read?
- The two open questions: 1 GB with swap off for `server setup` and the build;
  `/srv/sites` and `/srv/conf` pre-existing as bind mounts.

### Late night: renamed to Scryproof, TLS, and the follow-up written

Everything after the first deploy is folded into `docs/for-alex-followup.md`,
which is the one document meant for him, with `docs/bonesdeploy-fixes.patch`.
New since the last entry: `/etc/ssl/private` set to 0700 by
`ensure-default-deny-ssl.sh.j2` breaks the next Postgres restart; no way to
remove or rename a site; stock router serves plain HTTP after a certificate
exists; the router's access log is on (item 4 confirmed, and turned off here).
`site ssl` worked first time.

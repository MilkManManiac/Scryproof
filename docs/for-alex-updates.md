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
  `~/gooffline`, with the Windows repo as its `origin`.
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

Not yet run: `server setup`, `site setup`, `site ssl`, `deploy`.

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

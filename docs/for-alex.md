# Notes on bonesdeploy v0.8.7, from GoOffline

Alex, this is written by Claude (Anthropic's coding model), not by Wes. Wes is
not a developer. He owns the project, pays for the box, clicks what needs
clicking and tests the result; I write the code and run the server setup from
his PC over SSH. If you do reply on the technical side, plain text he can paste
back to me works best.

None of this is a request for work. It is your tool and your time. These are
questions about how it is meant to be used, things we noticed while reading it,
and a few suggestions you are free to ignore. Where something did not fit us we
have worked around it on our side, and the notes say how.

GoOffline is a private, self-hosted Discord for Wes and his friends: a Node
API with a WebSocket gateway, Postgres, file uploads up to 100 MB, a native
addon (argon2), and LiveKit for end-to-end encrypted voice and video. It is
deployed with bonesdeploy, using the `custom` framework.

## Where we are, and the questions we have

As of 2026-09-21 there is a box: a DigitalOcean droplet, Ubuntu 24.04, 1 GB,
with a LUKS volume that `/srv/sites`, `/srv/conf`, `/var/lib/postgresql`,
`/etc/ssl/private` and `/etc/letsencrypt` are bind-mounted onto. Nothing of
bonesdeploy's is installed yet, because the next step is `bonesdeploy init` and
`server setup`, and the CLI will not build on Wes's PC (item 9).

Three things are where we are stuck, so they are the ones we would most like
your view on. Everything after them is observation and can be skipped.

1. **Item 9, Windows.** How would you expect someone on Windows to run the
   CLI? If the answer is WSL, do you know of anyone who has? One idea, if it is
   ever convenient: a prebuilt Linux `bonesdeploy` in the release next to
   `bonesremote` would mean no Rust toolchain is needed anywhere.
2. **Item 1, WebSockets.** As far as I can tell the router template does not
   pass upgrades, which would leave our chat gateway and LiveKit's signalling
   unable to connect through it. Is that right, or is there a supported way to
   do it that I missed? `docs/bonesdeploy-router.patch` is one possible shape
   for a change, untested, in case it is useful.
3. **Item 2, the 1 MB body cap** in the router. Same question: is there a
   setting for it that I did not find?

Two more questions, which are not in the list below because I have not read
enough to answer them myself:

- Is a 1 GB box with swap off enough for `server setup` and for a build inside
  the `buildpack-deps:bookworm` container? We can resize for the build if not.
- Does anything in `server setup` mind that `/srv/sites` and `/srv/conf`
  already exist as bind mounts (empty, root-owned, 755) before it runs?

How far to trust the rest: all of it comes from reading the source at `91f32c4`
(the 0.8.7 version bump). None of it has been run. Line numbers are from that
commit. If I have misread something, say so.

Paths below are relative to the bonesdeploy repo. `bonesinfra/` is short for
`crates/bonesinfra/python/src/bonesinfra/`.

## 1. WebSockets do not get through, at either nginx layer

Router, `bonesinfra/assets/nginx/router.conf.j2`, lines 16-25 and 42-51: the
`location /` blocks set Host, X-Real-IP, X-Forwarded-For and X-Forwarded-Proto.
There is no `proxy_http_version`, so it proxies as HTTP/1.0, and no `Upgrade`
or `Connection` header is passed on.

Per-site, `bonesinfra/frameworks/custom/templates/nginx/app-site-nginx.conf.j2`
lines 34-35 (same in the next, nuxt and django copies):

    proxy_http_version 1.1;
    proxy_set_header Connection "";

That is right for keepalive and wrong for WebSockets: the empty Connection
header strips the upgrade request.

Our side: the per-site template is ours to replace under the `custom`
framework, so `infra/custom/templates/site-nginx.conf.j2` has a map on
`$http_upgrade` and sends `Upgrade` and `Connection` on the gateway path. The
router is your file and we cannot fix it from the project.

Suggestion: the router could pass upgrades. `docs/bonesdeploy-router.patch` is
one way it might look. It is untested. The stock per-site templates would need
the same change to carry WebSockets.

## 2. Uploads are capped at 1 MB

Neither template sets `client_max_body_size`, so nginx's 1 MB default applies
at both layers. Anything larger gets a 413 before the app sees it.

Our side: `client_max_body_size 110m;` in our per-site template. The router
still caps it at 1 MB.

Suggestion: a setting in `bones.toml` that both templates read. The patch adds it to
the router as `nginx_client_max_body_size`, defaulting to `1m` so nothing
changes for existing sites. The plumbing from `bones.toml` is not in the patch.

## 3. X-Forwarded-For is appended twice

`$proxy_add_x_forwarded_for` is used in the router (lines 23 and 49) and again
in the per-site template (line 30). The per-site nginx listens on a unix socket,
so what it appends is `unix:`. The app receives something like
`<whatever the client sent>, <real ip>, unix:`.

An app that reads the first entry, which is what most do, can be lied to by
any client that sends its own X-Forwarded-For. That defeats per-IP rate limits.

Our side: the server reads the header from the right, skips entries that are
not IP addresses and skips loopback, and only trusts the header at all when the
socket peer is local (`server/src/lib/client-ip.ts`, 12 tests).

Suggestion: the router could set `X-Forwarded-For $remote_addr` (overwrite, not
append), since it is the edge, with the per-site layer passing it through
unchanged. Then the first entry is always true. You may have a reason for the
current shape that I cannot see from the templates.

## 4. Access logs are on by default

`access_log {{ paths.runtime_nginx_dir }}/access.log;` on line 13 of every
per-site template. The router inherits whatever the system nginx.conf says,
which on Ubuntu is also on.

For us that is a record of who connected and when, written to disk, on a chat
server whose point is not keeping that. Our per-site template sets
`access_log off;`.

Suggestion: a `bones.toml` switch for it, covering the router too. Most sites
want the log, so on by default makes sense.

## 5. The AppArmor profile blocks native Node addons and TCP

`bonesinfra/assets/apparmor/app-profile.j2` (the custom and next copies are the
same):

- Line 22, `{{ paths.releases }}/*/** r,` grants read only. Loading a `.node`
  file is an mmap with exec, which needs `m`. As written, argon2, sharp,
  better-sqlite3 and anything else with a native addon should fail to load
  under the profile.
- Line 6, `network unix stream,` is the default. A Node app that talks to
  Postgres over `127.0.0.1:5432`, which is the DATABASE_URL shape bonesdeploy
  itself hands out, needs inet.

Our side: our own `app-profile.j2` adds `node_modules/**.node mr,` under the
release path, and we pass `apparmor_network` with inet stream and dgram.

Question: have Node apps with native addons run under the stock profile for
you? If they have, I have misread how the rule applies and would like to know.
If not, a `.node` rule in the stock Node profiles, and a network default that
matches the DATABASE_URL the tool generates, would cover it.

## 6. `bonesdeploy init` overwrites project-owned files

`crates/bonesdeploy/src/commands/init/scaffold.rs`, lines 40-54:
`scaffold_custom_provisioning` does an unconditional `fs::write` of
`infra/custom/__init__.py`, `runtime.py` (line 44) and `manifest.py` (line 50).
Running init in a repo that already has a real `runtime.py` replaces it with
`def deploy(_ctx): pass`.

Our side: after init we run `git checkout infra/custom`. It is written into our
runbook, but it is the kind of thing that gets forgotten once.

Suggestion: init could skip files that already exist, or ask first.

## 7. The generic build kit uses `npm install`

`crates/bonesdeploy/assets/kit/deployment/build/02_run_build.sh` line 18:
`npm install --include=optional`. The sveltekit and vue kits do the same. The
next and nuxt kits already use `npm ci --include=optional` (line 15 and 27).

`npm install` can move versions inside the lockfile's ranges and rewrite the
lockfile during a production build. `npm ci` installs exactly what was
committed or fails.

Our side: our own `deployment/build/02_build.sh` uses `npm ci`.

Suggestion: `npm ci` when a `package-lock.json` exists, in all the kits.

## 8. `server setup` opens all outbound traffic

`bonesinfra/services/linux/firewall.py` line 11:
`ufw --force default allow outgoing`.

A sensible default for most people. We run outbound default-deny with a short
allow list, so every `server setup` run undoes it, quietly.

Our side: we rerun our firewall script after any `server setup`.

Question: is there already a way to tell `server setup` to leave the firewall,
or just the outbound policy, alone? If not, that would be a useful option, but
rerunning our script is a fine answer too.

## 9. The CLI cannot be built on Windows

Found 2026-09-21, the day the box came to exist. Wes's PC is Windows 11 with no
WSL. `crates/bonesdeploy/Cargo.toml` depends on `openssh` 0.11.6 with
`native-mux`, and that crate's `src/lib.rs` (lines 159-160) says:

    #[cfg(not(unix))]
    compile_error!("This crate can only be used on unix");

So `cargo install ... bonesdeploy` cannot succeed on Windows whatever is
installed. This is from reading the source; the build was not attempted,
because Rust was never installed once this turned up.

The server half is fine: the v0.8.7 release carries a prebuilt
`bonesremote-x86_64-unknown-linux-musl`, so nothing has to compile on the box.
There is no prebuilt `bonesdeploy`.

Question: is WSL the way you would expect a Windows user to run it, and do you
know of anyone who has? If a prebuilt Linux `bonesdeploy` ever appeared next to
`bonesremote`, WSL would need no Rust toolchain either, but that is only an
idea. Windows not being a target is a perfectly reasonable choice.

## Not a bug

The two-layer nginx design, the unix socket per site, the release/current
symlink layout and the `custom` framework hook all did what the docs said. The
`custom` hook is the reason we can use bonesdeploy at all.

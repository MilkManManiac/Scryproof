# Notes on bonesdeploy v0.8.7, from GoOffline

Alex, this is what came up while getting GoOffline ready to deploy with
bonesdeploy. GoOffline is a Node API with a WebSocket gateway, file uploads up
to 100 MB, and a native addon (argon2).

How far to trust this: all of it comes from reading the source at `91f32c4`
(the 0.8.7 version bump). Nothing here has been run on a box yet, because there
is no box yet. Line numbers are from that commit. If I have misread something,
say so.

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

Ask: make the router pass upgrades. `docs/bonesdeploy-router.patch` is a
suggested diff. It is untested. The stock per-site templates want the same
change.

## 2. Uploads are capped at 1 MB

Neither template sets `client_max_body_size`, so nginx's 1 MB default applies
at both layers. Anything larger gets a 413 before the app sees it.

Our side: `client_max_body_size 110m;` in our per-site template. The router
still caps it at 1 MB.

Ask: a setting in `bones.toml` that both templates read. The patch adds it to
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

Ask: have the router set `X-Forwarded-For $remote_addr` (overwrite, not
append), since it is the edge, and have the per-site layer pass it through
unchanged. Then the first entry is always true.

## 4. Access logs are on by default

`access_log {{ paths.runtime_nginx_dir }}/access.log;` on line 13 of every
per-site template. The router inherits whatever the system nginx.conf says,
which on Ubuntu is also on.

For us that is a record of who connected and when, written to disk, on a chat
server whose point is not keeping that. Our per-site template sets
`access_log off;`.

Ask: a `bones.toml` switch for it, covering the router too.

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

Ask: add the `.node` rule to the stock Node profiles, and make the network
default match the DATABASE_URL the tool generates.

## 6. `bonesdeploy init` overwrites project-owned files

`crates/bonesdeploy/src/commands/init/scaffold.rs`, lines 40-54:
`scaffold_custom_provisioning` does an unconditional `fs::write` of
`infra/custom/__init__.py`, `runtime.py` (line 44) and `manifest.py` (line 50).
Running init in a repo that already has a real `runtime.py` replaces it with
`def deploy(_ctx): pass`.

Our side: after init we run `git checkout infra/custom`. It is written into our
runbook, but it is the kind of thing that gets forgotten once.

Ask: skip files that already exist, or ask first.

## 7. The generic build kit uses `npm install`

`crates/bonesdeploy/assets/kit/deployment/build/02_run_build.sh` line 18:
`npm install --include=optional`. The sveltekit and vue kits do the same. The
next and nuxt kits already use `npm ci --include=optional` (line 15 and 27).

`npm install` can move versions inside the lockfile's ranges and rewrite the
lockfile during a production build. `npm ci` installs exactly what was
committed or fails.

Our side: our own `deployment/build/02_build.sh` uses `npm ci`.

Ask: `npm ci` when a `package-lock.json` exists, in all the kits.

## 8. `server setup` opens all outbound traffic

`bonesinfra/services/linux/firewall.py` line 11:
`ufw --force default allow outgoing`.

A sensible default for most people. We run outbound default-deny with a short
allow list, so every `server setup` run undoes it, quietly.

Our side: we rerun our firewall script after any `server setup`.

Ask: a way to tell `server setup` to leave the firewall alone, or at least to
leave the outbound policy alone.

## Not a bug

The two-layer nginx design, the unix socket per site, the release/current
symlink layout and the `custom` framework hook all did what the docs said. The
`custom` hook is the reason we can use bonesdeploy at all.

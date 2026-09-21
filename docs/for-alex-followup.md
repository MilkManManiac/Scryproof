# bonesdeploy v0.8.7 on a real box: what held up, what did not

Alex, Claude again. This replaces the first note. That one was written from
reading the source; this one is from running it. Nothing here needs a reply.
It is a report: two corrections to what I told you, then what we found, with a
tested patch for the parts that are bugs. Use any of it or none of it.

Where it ended up: the site is live at https://scryproof.com (the project is
called Scryproof now). `server setup`, `site setup`, `site ssl` and `deploy`
all pass. DigitalOcean, Ubuntu 24.04, 1 GB, swap off, with `/srv/sites`,
`/srv/conf`, `/var/lib/postgresql`, `/etc/ssl/private` and `/etc/letsencrypt`
bind-mounted from a LUKS volume before anything was installed. Node API with a
WebSocket gateway, Postgres, LiveKit, `custom` template. The CLI runs under
WSL2.

`docs/bonesdeploy-fixes.patch` is every change we made to the materialized
`infra/.framework/`, as one diff with paths rewritten to
`crates/bonesinfra/python/`. Each hunk is described below, and marked as a bug
fix or as our own preference, so you can tell which is which.

## Corrections to the first note

- **Item 6 was wrong.** `init` does not overwrite an existing
  `infra/custom/`. What happens instead: if an `infra/` directory exists at all
  (ours held unrelated folders), init prints "Using existing infra/
  configuration", scaffolds nothing, never materializes `infra/.framework`, and
  silently ignores `--template` and `--service`, leaving `BONES_TEMPLATE` and
  `BONES_SERVICES` empty. We moved `infra/` aside, ran init, and moved our
  folders back.
- **Items 1 and 2 said the router was out of our reach. It is not.** I had not
  understood that the whole of bonesinfra is materialized into the project and
  run from there. The router template is editable in our repo, and that is how
  we fixed both. The note's file paths were from the crate; what a project sees
  is the same tree under `infra/.framework/src/bonesinfra/`.
- I also never found `bonesdeploy skill`. It is good, and `skill next` was
  right every time.

## Your questions that answered themselves

- **Windows (item 9): WSL works.** `cargo install --locked --git ... --tag
  v0.8.7 bonesdeploy` built first time. A fresh WSL Ubuntu needs
  `build-essential pkg-config libssl-dev python3-venv` and rustup. One catch:
  the repo must live on the Linux filesystem. On `/mnt/c`, init fails with
  "Failed to set permissions on infra/deployment/functions.sh: Operation not
  permitted", because DrvFs cannot chmod.
- **1 GB with swap off is enough**, for setup and for the build: `npm ci`,
  esbuild and a Vite build inside the Podman container, about a minute, first
  try.
- **Pre-existing bind mounts at `/srv/sites` and `/srv/conf` are fine.**
  Nothing minded.

## Bugs, each with a fix in the patch

1. **`--service postgres` cannot provision on 0.8.7. Two separate faults.**
   - `services/runtime/postgres.py` passes `user=f"{project}_postgres"` to
     `server.script_template`. That forwards `**data` to `files.template`,
     which has its own `user` parameter (file owner), so the value never
     reaches Jinja: `configure-postgres-project.sh.j2 (L4): 'user' is
     undefined`. Same with pyinfra 3.8.0 (your lock) and 3.10.0 (what pip
     actually installed; the venv does not use `uv.lock`). The script never
     uses `$USER`. Fix: drop the kwarg and the template line. The mysql
     template has the same line; untested.
   - The `CREATE DATABASE` line runs `psql -v ... -c "SELECT format(...,
     :'database', :'user') ... \gexec"`. psql does not interpolate variables
     or run backslash commands inside `-c`, so the server gets a literal colon:
     `syntax error at or near ":"`. Fix: the same statement on stdin.
2. **`ensure-default-deny-ssl.sh.j2` sets `/etc/ssl/private` to 0700.** Debian
   and Ubuntu ship it 0710 root:ssl-cert, and Postgres (in `ssl-cert`) reads
   the snakeoil key through it. After this script runs, the next Postgres
   restart fails: `could not access private key file
   "/etc/ssl/private/ssl-cert-snakeoil.key": Permission denied`. It surfaces
   late, on whatever restart comes next, which makes it hard to connect to the
   cause. Fix: `install -d -m 0710`.
3. **`aa-enforce` fails on Ubuntu 24.04 once Podman is installed.** It parses
   every file in `/etc/apparmor.d`, and apparmor-utils 4.0.1 cannot parse
   `abstractions/passt`: `Operation {'runbindable'} cannot have a source`, then
   `Can't parse mount rule mount "" -> "/tmp/"`. Ubuntu's bug, but it stops
   `site setup` dead. `apparmor_parser -r` has already loaded the profile in
   enforce mode, so the patch replaces the call with a check:
   `grep -qxF "<profile> (enforce)" /sys/kernel/security/apparmor/profiles`.
4. **The router drops WebSocket upgrades (item 1, now confirmed).** The same
   handshake sent three ways on the box: to the app, its own 401; to the
   per-site nginx socket, 401; to the router on port 80, 404, because it arrived
   as a plain GET. With the patch the router answers 401 too, and LiveKit's
   signalling works through it. `project_name` is in the render context, so
   the per-project `map` variable works as drafted.
5. **The router caps bodies at 1 MB (item 2, confirmed).** 2 MB POST: 413.
   One-byte POST to the same URL: the app's 404. The patch adds
   `client_max_body_size {{ nginx_client_max_body_size | default("110m") }}`.
   The 110m default is ours; upstream would want 1m. `ctx.runtime.data` already
   flows into the template context, so a real setting may be one line.

## Ours, not bugs (also in the patch, skip them)

- **`access_log off;` in the router and default-deny servers (item 4).** The
  router inherits Ubuntu's http-level access log, so every client IP and
  request line lands in `/var/log/nginx/access.log`. For a private chat server
  that is the one record we do not want. A switch would be welcome; on by
  default is right for most people.
- **Port 80 redirects to HTTPS once `nginx_ssl_enabled` is true.** Stock keeps
  serving the site over plain HTTP after a certificate exists. You may intend
  that; we did not want it.

## Smaller things seen along the way

- **Build scripts are read from `infra/deployment/build/`**, not the top-level
  `deployment/build/` the README describes. With ours in the old place, deploy
  said "No deployment scripts", built nothing, failed at "New release web root
  does not exist" and removed the release. A clean failure. The README section
  is stale.
- **There is no way to remove or rename a site.** We renamed the project after
  the first deploy and took the old one out by hand from `site manifest`: units,
  target, nginx files, AppArmor profiles and cache, users and groups, linger,
  `/var/lib/bonesdeploy/users/<name>-build`, the bare repo, the bonesremote site
  state and lock, the log directory, the database and role. The manifest made
  that possible; it does not list the build user, the role or the database.
- **`secrets push` replaces `shared/.env` whole.** Documented, and fine. We
  generate app secrets on the box, so we never ran it, and piped `POSTGRES_URL`
  across instead. Worth a line in the docs for anyone mixing the two.
- **`server setup` resets ufw outbound to allow; `site setup` leaves ufw
  alone.** Item 8 stands, narrowed to that one command. We rerun our firewall
  script after it.
- **`BONES_PREVIEW_DOMAIN` defaults to a nip.io name** and the router keeps a
  server block for it after a real domain is set. Harmless, and a third-party
  DNS name we would rather not have in the config.
- On the root disk rather than our encrypted volume: `/home/git/<name>.git`,
  `/root/.config/bonesremote/` and `/var/log/bonesdeploy/`. No secrets in any of
  them that we could find. Noted only because we looked.

## Not tested, so still only my reading

- Item 3 (`X-Forwarded-For` appended at both layers). Our app reads it from the
  right and only trusts a local peer, so we never measured it.
- Item 5 (native addons and TCP under the stock AppArmor profile). Ours has a
  `.node mr` rule and inet, and argon2 loads under it. The stock profile was
  never run.
- Item 7 (`npm install` in the generic kits). We use our own build script.

## What worked without a fight

Rootless Podman build with no host access, the release/current cut-over and
the clean rollback on a failed verify, the per-site nginx on a unix socket, the
`custom` hook (ours ran unchanged through every step), `site ssl`, `doctor`,
`site manifest`, and `skill next`. For a tool pointed at a box it has never
seen, with an encrypted volume under half its paths, that is a lot going right.

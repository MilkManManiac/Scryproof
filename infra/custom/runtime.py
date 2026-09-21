"""
How Scryproof runs on the box.

bonesdeploy's `custom` template provisions nothing on purpose and then hands
control to this file. It is modelled on bonesdeploy's own Next.js runtime
(frameworks/next/runtime.py at v0.8.7), which is the closest shape to ours: a
Node process on a loopback TCP port behind the per-site nginx.

What differs from the stock runtimes, and why each difference exists:

- **Our own nginx template.** The stock one sends `Connection: ""`, which
  strips the WebSocket upgrade, so the gateway would never connect. It also
  proxies every request to Node, where we want nginx serving the built client;
  it caps request bodies at nginx's default 1 MB against our 100 MB attachment
  limit; and it writes an access log, which GAMEPLAN section 4 turns off.
- **Our own AppArmor profile.** The stock one grants read on the release but
  not `m` (map as executable), so Node could not load the native argon2 addon
  and no password could be checked. It also allows no network beyond unix
  sockets, and Postgres is on 127.0.0.1.
- **A writable uploads directory**, under `shared/` so it survives releases.
  `shared/` is on the encrypted volume (infra/box/README.md).

UNVERIFIED: written by reading bonesdeploy's source, not by running it. It has
never been executed. `bonesdeploy init` also rewrites `infra/custom/runtime.py`
and `manifest.py` with empty stubs, so after init run `git status` and restore
these two files with `git checkout infra/custom`.
"""

from pathlib import Path

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.languages import NODE
from bonesinfra.services.linux import application, runtime, shared, validation

TEMPLATES = Path(__file__).parent / "templates"

NAME = "scryproof"
PORT = 8787
ENTRYPOINT = "server/dist/index.js"
SHARED_DIRECTORIES = ("data", "data/uploads")

# Loopback TCP for Postgres, unix sockets for everything else. The app makes no
# outbound connection to anywhere: LiveKit tokens are signed locally.
APPARMOR_NETWORK = "network unix stream,\n  network inet stream,\n  network inet6 stream,"


def _data_dir(paths):
    return f"{paths['shared']}/data"


def deploy(ctx):
    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)

        def seed_placeholder(current_ctx, paths, _node_binary):
            # Before the first deploy there is no release, and the service has
            # to have *something* to start. This answers the health check and
            # nothing else.
            server_dir = f"{paths['placeholder_release']}/server/dist"
            mkdir(
                name="Ensure placeholder server directory exists",
                path=server_dir,
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0750",
            )
            render(
                "Seed placeholder Scryproof server",
                TEMPLATES / "placeholder-index.js.j2",
                f"{server_dir}/index.js",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0750",
                port=PORT,
                **template_data(current_ctx, paths=paths),
            )
            web_dir = f"{paths['placeholder_release']}/web/dist"
            mkdir(
                name="Ensure placeholder web directory exists",
                path=web_dir,
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0750",
            )
            render(
                "Seed placeholder page",
                TEMPLATES / "placeholder-index.html.j2",
                f"{web_dir}/index.html",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0640",
                **template_data(current_ctx, paths=paths),
            )

        def validate(current_ctx, paths, _node_binary):
            validation.run_as_runtime_user(
                current_ctx,
                "Validate the Scryproof server bundle exists as runtime user",
                f"test -f {paths['current']}/{ENTRYPOINT}",
            )

        def command(current_ctx, paths, node_binary):
            # --env-file-if-exists: the placeholder release has no .env, and the
            # real one is a symlink to shared/.env on the encrypted volume.
            return (
                f"/usr/bin/env --chdir={paths['current']} NODE_ENV=production "
                f"HOST=127.0.0.1 PORT={PORT} DATA_DIR={_data_dir(paths)} "
                f"{node_binary} --env-file-if-exists=.env {ENTRYPOINT}"
            )

        application.deploy_server(
            current_ctx,
            name=NAME,
            runtime_label="Scryproof API and gateway",
            nginx_template=TEMPLATES / "site-nginx.conf.j2",
            apparmor_template=TEMPLATES / "app-profile.j2",
            install=NODE.install,
            seed_placeholder=seed_placeholder,
            validate=validate,
            command=command,
            exec_paths=lambda _ctx, _paths, node: [node],
            writable_paths=lambda _ctx, paths: [_data_dir(paths)],
            tcp=True,
            port=PORT,
            apparmor_network=APPARMOR_NETWORK,
        )

    runtime.orchestrate(ctx, provision, uses_tcp=True)

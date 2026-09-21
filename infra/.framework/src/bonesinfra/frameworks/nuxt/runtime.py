from pathlib import Path

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.languages import NODE
from bonesinfra.services.linux import application, runtime, shared

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ()


def deploy(ctx):
    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)
        if current_ctx.runtime.data.get("is_static", True):
            application.deploy_static(
                current_ctx,
                static_root=".output/public",
                nginx_template=TEMPLATES / "nginx/static-site-nginx.conf.j2",
                placeholder_template=TEMPLATES / "nginx/index.html.j2",
            )
        else:

            def seed_placeholder(current_ctx, paths, _node_binary):
                server_dir = f"{paths['placeholder_release']}/.output/server"
                mkdir(
                    name="Ensure placeholder .output/server directory exists",
                    path=server_dir,
                    user="root",
                    group=current_ctx.runtime.runtime_group,
                    mode="0750",
                )
                render(
                    "Seed placeholder Nuxt nitro server",
                    TEMPLATES / "nuxt/placeholder-server.mjs.j2",
                    f"{server_dir}/index.mjs",
                    user="root",
                    group=current_ctx.runtime.runtime_group,
                    mode="0750",
                    **template_data(current_ctx, paths=paths),
                )

            def command(_current_ctx, paths, node_binary):
                socket = f"{paths['runtime_socket_dir']}/nuxt/nuxt.sock"
                return (
                    f"/usr/bin/env NODE_ENV=production NITRO_UNIX_SOCKET={socket} "
                    f"{node_binary} .output/server/index.mjs"
                )

            application.deploy_server(
                current_ctx,
                name="nuxt",
                runtime_label="Nuxt app server",
                nginx_template=TEMPLATES / "nginx/app-site-nginx.conf.j2",
                apparmor_template=TEMPLATES / "app-profile.j2",
                install=NODE.install,
                seed_placeholder=seed_placeholder,
                validate=application.empty_validation,
                command=command,
                exec_paths=lambda _ctx, _paths, node: [node],
                writable_paths=application.empty_writable,
            )

    runtime.orchestrate(ctx, provision)

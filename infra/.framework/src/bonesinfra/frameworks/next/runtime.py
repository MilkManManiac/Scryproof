from pathlib import Path

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.languages import NODE
from bonesinfra.services.linux import application, runtime, shared, validation

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ()


def deploy(ctx):
    is_static = ctx.runtime.data.get("is_static", True)

    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)
        if is_static:
            application.deploy_static(
                current_ctx,
                static_root="out",
                nginx_template=TEMPLATES / "nginx/static-site-nginx.conf.j2",
                placeholder_template=TEMPLATES / "nginx/index.html.j2",
            )
        else:

            def seed_placeholder(current_ctx, paths, _node_binary):
                server_dir = f"{paths['placeholder_release']}/.next/standalone"
                mkdir(
                    name="Ensure placeholder .next/standalone directory exists",
                    path=server_dir,
                    user="root",
                    group=current_ctx.runtime.runtime_group,
                    mode="0750",
                )
                render(
                    "Seed placeholder Next.js standalone server",
                    TEMPLATES / "next/placeholder-server.js.j2",
                    f"{server_dir}/server.js",
                    user="root",
                    group=current_ctx.runtime.runtime_group,
                    mode="0750",
                    **template_data(current_ctx, paths=paths),
                )

            def validate(current_ctx, paths, _node_binary):
                validation.run_as_runtime_user(
                    current_ctx,
                    "Validate Next.js standalone server exists as runtime user",
                    f"test -f {paths['current']}/.next/standalone/server.js",
                )

            def command(current_ctx, _paths, node_binary):
                port = current_ctx.runtime.data.get("internal_port", 3100)
                return (
                    f"/usr/bin/env NODE_ENV=production PORT={port} HOSTNAME=127.0.0.1 "
                    f"{node_binary} .next/standalone/server.js"
                )

            application.deploy_server(
                current_ctx,
                name="next",
                runtime_label="Next.js app server",
                nginx_template=TEMPLATES / "nginx/app-site-nginx.conf.j2",
                apparmor_template=TEMPLATES / "app-profile.j2",
                install=NODE.install,
                seed_placeholder=seed_placeholder,
                validate=validate,
                command=command,
                exec_paths=lambda _ctx, _paths, node: [node],
                writable_paths=application.empty_writable,
                tcp=True,
                port=3100,
                apparmor_network="network inet stream,",
            )

    runtime.orchestrate(ctx, provision, uses_tcp=not is_static)

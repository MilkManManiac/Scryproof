from pathlib import Path
from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.languages import NODE
from bonesinfra.services.linux import application, runtime, shared, validation

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ()


def deploy(ctx):
    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)

        def seed_placeholder(current_ctx, paths, _node_binary):
            build_dir = f"{paths['placeholder_release']}/build"
            mkdir(
                name="Ensure placeholder SvelteKit build directory exists",
                path=build_dir,
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0750",
            )
            render(
                "Seed placeholder SvelteKit build entrypoint",
                TEMPLATES / "sveltekit/placeholder-index.js.j2",
                f"{build_dir}/index.js",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0750",
                **template_data(current_ctx, paths=paths),
            )
            server.shell(
                name="Seed blank .env for SvelteKit placeholder",
                commands=[f"touch {quote(paths['placeholder_release'])}/.env"],
                _sudo=True,
            )

        def validate(current_ctx, paths, _node_binary):
            validation.run_as_runtime_user(
                current_ctx,
                "Validate SvelteKit build entrypoint exists as runtime user",
                f"test -e {paths['current']}/build",
            )

        def command(current_ctx, paths, node_binary):
            socket = f"{paths['runtime_socket_dir']}/sveltekit/sveltekit.sock"
            origin = f"https://{current_ctx.app.dns.domain}" if current_ctx.app.dns.domain else "https://localhost"
            return (
                f"/usr/bin/env --chdir={paths['current']} NODE_ENV=production "
                f"SOCKET_PATH={socket} ORIGIN={origin} {node_binary} --env-file=.env build"
            )

        application.deploy_server(
            current_ctx,
            name="sveltekit",
            runtime_label="SvelteKit app server",
            nginx_template=TEMPLATES / "nginx/app-site-nginx.conf.j2",
            apparmor_template=TEMPLATES / "app-profile.j2",
            install=NODE.install,
            seed_placeholder=seed_placeholder,
            validate=validate,
            command=command,
            exec_paths=lambda _ctx, _paths, node: [node],
            writable_paths=application.empty_writable,
        )

    runtime.orchestrate(ctx, provision)

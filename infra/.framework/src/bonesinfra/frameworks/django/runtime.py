from pathlib import Path
from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.languages import PYTHON
from bonesinfra.services.linux import application, runtime, shared, validation

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ("media",)


def deploy(ctx):
    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)

        def seed_placeholder(current_ctx, paths, python_binary):
            placeholder = paths["placeholder_release"]
            server.shell(
                name="Create placeholder venv with gunicorn",
                commands=[
                    f"cd {quote(placeholder)} && {python_binary} -m venv .venv && .venv/bin/pip install gunicorn"
                ],
                _sudo=True,
            )
            mkdir(
                name="Ensure placeholder config directory exists",
                path=f"{placeholder}/config",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0750",
            )
            render(
                "Seed placeholder WSGI application",
                TEMPLATES / "django/placeholder-wsgi.py.j2",
                f"{placeholder}/config/wsgi.py",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0640",
                **template_data(current_ctx, paths=paths),
            )

        def validate(current_ctx, paths, _python_binary):
            gunicorn = f"{paths['current']}/.venv/bin/gunicorn"
            module = current_ctx.runtime.data.get("wsgi_module", "config.wsgi:application")
            validation.run_as_runtime_user(
                current_ctx, "Validate Gunicorn configuration as runtime user", f"{gunicorn} --check-config {module}"
            )

        def command(current_ctx, paths, _python_binary):
            module = current_ctx.runtime.data.get("wsgi_module", "config.wsgi:application")
            return (
                f"{paths['current']}/.venv/bin/gunicorn {module} "
                f"--bind unix:{paths['runtime_socket_dir']}/gunicorn/gunicorn.sock"
            )

        application.deploy_server(
            current_ctx,
            name="gunicorn",
            runtime_label="Gunicorn",
            nginx_template=TEMPLATES / "nginx/app-site-nginx.conf.j2",
            apparmor_template=TEMPLATES / "app-profile.j2",
            install=PYTHON.install,
            seed_placeholder=seed_placeholder,
            validate=validate,
            command=command,
            exec_paths=lambda _ctx, paths, _binary: [f"{paths['current']}/.venv/bin/gunicorn"],
            writable_paths=lambda _ctx, paths: [f"{paths['shared']}/media"],
        )

    runtime.orchestrate(ctx, provision)

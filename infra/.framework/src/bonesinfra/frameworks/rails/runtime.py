from pathlib import Path
from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import render
from bonesinfra.services.languages import RUBY
from bonesinfra.services.linux import application, runtime, shared, validation

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ("tmp", "log", "storage")
BUNDLER_PATH = "vendor/bundle"


def bundler_binary(ruby_binary):
    return str(Path(ruby_binary).with_name("bundle"))


def bundler_command(bundle_binary, command):
    return f"BUNDLE_PATH={BUNDLER_PATH} {quote(bundle_binary)} {command}"


def deploy(ctx):
    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)

        def seed_placeholder(current_ctx, paths, ruby_binary):
            placeholder = paths["placeholder_release"]
            bundle_binary = bundler_binary(ruby_binary)
            render(
                "Seed placeholder Gemfile",
                TEMPLATES / "rails/placeholder-Gemfile.j2",
                f"{placeholder}/Gemfile",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0640",
                **template_data(current_ctx, paths=paths),
            )
            server.shell(
                name="Install placeholder gems",
                commands=[f"cd {quote(placeholder)} && {bundler_command(bundle_binary, 'install')}"],
                _sudo=True,
            )
            render(
                "Seed placeholder Rack config",
                TEMPLATES / "rails/placeholder-config.ru.j2",
                f"{placeholder}/config.ru",
                user="root",
                group=current_ctx.runtime.runtime_group,
                mode="0640",
                **template_data(current_ctx, paths=paths),
            )

        def install(current_ctx):
            return RUBY.install(current_ctx)

        def command(current_ctx, paths, ruby_binary):
            environment = current_ctx.runtime.data.get("rails_env", "production")
            socket = f"{paths['runtime_socket_dir']}/puma/puma.sock"
            bundle_binary = bundler_binary(ruby_binary)
            return (
                f"/usr/bin/env RAILS_ENV={environment} "
                f"{bundler_command(bundle_binary, f'exec puma -e {environment} -b unix://{socket}')}"
            )

        def validate(current_ctx, paths, ruby_binary):
            bundle_binary = bundler_binary(ruby_binary)
            validation.run_as_runtime_user(
                current_ctx,
                "Validate Puma availability as runtime user",
                f"cd {quote(paths['current'])} && {bundler_command(bundle_binary, 'exec puma --help >/dev/null')}",
            )

        application.deploy_server(
            current_ctx,
            name="puma",
            runtime_label="Puma",
            nginx_template=TEMPLATES / "nginx/app-site-nginx.conf.j2",
            apparmor_template=TEMPLATES / "app-profile.j2",
            install=install,
            seed_placeholder=seed_placeholder,
            validate=validate,
            command=command,
            exec_paths=lambda _ctx, _paths, ruby: [ruby, bundler_binary(ruby)],
            writable_paths=lambda _ctx, paths: [
                f"{paths['shared']}/tmp",  # noqa: S108 - Rails owns this shared application path.
                f"{paths['shared']}/log",
                f"{paths['shared']}/storage",
            ],
        )

    runtime.orchestrate(ctx, provision)

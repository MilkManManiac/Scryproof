from pathlib import Path

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import render
from bonesinfra.services.languages import PHP
from bonesinfra.services.linux import runtime, shared, systemd
from bonesinfra.services.linux.nginx import site

from . import docker

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ("storage", "storage/framework/views", "cache", "uploads")


def deploy(ctx):
    def provision(current_ctx):
        paths = current_ctx.paths_dict
        shared.ensure_directories(current_ctx, paths, SHARED_DIRECTORIES)
        if current_ctx.runtime.backend == "docker":
            docker.deploy(current_ctx)
            return
        php_executable = PHP.install(current_ctx)
        socket = PHP.configure_fpm_pool(current_ctx, paths=paths)
        site.render_php_fpm(
            current_ctx,
            paths=paths,
            template_src=TEMPLATES / "nginx/laravel-site-nginx.conf.j2",
            php_fpm_socket_path=socket,
        )
        render(
            "Deploy Laravel queue worker service",
            TEMPLATES / "queue-worker.service.j2",
            current_ctx.paths.systemd_service("worker"),
            **template_data(current_ctx, paths=paths, php_executable=php_executable),
        )
        systemd.register_service(current_ctx, paths=paths, name="worker")
        systemd.enable_and_start(current_ctx, "worker")

    runtime.orchestrate(ctx, provision)

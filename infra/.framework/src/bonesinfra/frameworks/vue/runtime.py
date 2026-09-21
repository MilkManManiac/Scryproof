from pathlib import Path

from bonesinfra.services.linux import runtime, shared
from bonesinfra.services.linux.application import deploy_static

TEMPLATES = Path(__file__).parent / "templates"
SHARED_DIRECTORIES = ()


def deploy(ctx):
    def provision(current_ctx):
        shared.ensure_directories(current_ctx, current_ctx.paths_dict, SHARED_DIRECTORIES)
        deploy_static(
            current_ctx,
            static_root="dist",
            nginx_template=TEMPLATES / "nginx/static-site-nginx.conf.j2",
            placeholder_template=TEMPLATES / "nginx/index.html.j2",
        )

    runtime.orchestrate(ctx, provision)

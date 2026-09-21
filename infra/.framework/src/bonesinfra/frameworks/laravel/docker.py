import hashlib
from pathlib import Path
from shlex import quote

from pyinfra.operations import apt, files, server, systemd

from bonesinfra.config.context import template_data
from bonesinfra.config.paths import BUILD_USER_HOME_ROOT, RUNTIME_IMAGES_ROOT
from bonesinfra.services.linux import runtime_logs, systemd as service
from bonesinfra.services.linux.nginx import site as nginx_site

TEMPLATES = Path(__file__).parent / "templates"


def deploy(ctx) -> None:
    project = ctx.app.project_name
    paths = ctx.paths_dict
    apt.packages(
        name="Install Docker Engine",
        packages=["docker.io"],
        present=True,
        update=True,
        _sudo=True,
    )
    systemd.service(
        name="Enable Docker Engine",
        service="docker",
        enabled=True,
        running=True,
        _sudo=True,
    )
    image = _build_runtime_image(ctx)
    runtime_logs.ensure(ctx)
    nginx_site.render_php_fpm(
        ctx,
        paths=paths,
        template_src=TEMPLATES / "nginx/laravel-site-nginx.conf.j2",
        php_fpm_socket_path=paths["runtime_php_fpm_socket"],
    )
    files.directory(
        name="Make Docker PHP-FPM socket directory container-writable",
        path=paths["runtime_socket_dir"],
        user="root",
        group=ctx.runtime.runtime_group,
        mode="0770",
        _sudo=True,
    )
    service.render_target(ctx, paths=paths)
    files.template(
        name=f"Deploy {project} Docker runtime service",
        src=str(TEMPLATES / "docker/docker-app.service.j2"),
        dest=ctx.paths.systemd_service("docker"),
        user="root",
        group="root",
        mode="0644",
        **template_data(ctx, paths=paths),
        docker_runtime_image=image,
        _sudo=True,
    )
    service.register_service(ctx, paths=paths, name="docker")
    service.enable_and_start(ctx, "docker")


def _build_runtime_image(ctx) -> str:
    project = ctx.app.project_name
    php_version = str(ctx.runtime.data.get("php_version", "8.3"))
    definition = f"laravel:{php_version}:bookworm"
    runtime_hash = hashlib.sha256(definition.encode()).hexdigest()[:12]
    image = f"bonesdeploy/laravel-{project}:{runtime_hash}"
    runtime_tag = f"bonesdeploy/laravel-{project}:runtime"
    build_root = f"{RUNTIME_IMAGES_ROOT}/{project}"
    build_user = f"{project}-build"
    containerfile = f"{build_root}/Containerfile"
    archive = f"{build_root}/{runtime_hash}.tar"

    files.directory(
        name="Create Laravel runtime image build directory",
        path=build_root,
        user=build_user,
        group=build_user,
        mode="0750",
        _sudo=True,
    )
    files.template(
        name="Deploy Laravel runtime Containerfile",
        src=str(TEMPLATES / "docker/Containerfile.j2"),
        dest=containerfile,
        user=build_user,
        group=build_user,
        mode="0640",
        php_version=php_version,
        _sudo=True,
    )
    files.template(
        name="Deploy Laravel runtime PHP-FPM pool",
        src=str(TEMPLATES / "docker/www.conf.j2"),
        dest=f"{build_root}/www.conf",
        user=build_user,
        group=build_user,
        mode="0640",
        runtime_user=ctx.runtime.runtime_user,
        runtime_group=ctx.runtime.runtime_group,
        _sudo=True,
    )
    podman = (
        f"runuser -u {quote(build_user)} -- env HOME={BUILD_USER_HOME_ROOT}/{quote(build_user)} "
        f"podman build --build-arg PHP_VERSION={quote(php_version)} --tag {quote(image)} --tag {quote(runtime_tag)} "
        f"--file {quote(containerfile)} {quote(build_root)} && "
        f"runuser -u {quote(build_user)} -- env HOME={BUILD_USER_HOME_ROOT}/{quote(build_user)} "
        f"podman save --format docker-archive --output {quote(archive)} {quote(image)} {quote(runtime_tag)} && "
        f"docker load --input {quote(archive)}"
    )
    server.shell(name="Build and load Laravel runtime image", commands=[podman], _sudo=True)
    return image

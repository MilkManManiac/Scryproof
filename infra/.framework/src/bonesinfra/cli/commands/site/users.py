from shlex import quote

from pyinfra.context import ctx_host
from pyinfra.facts.hardware import Cpus
from pyinfra.facts.server import Users
from pyinfra.operations import server

from bonesinfra.config.paths import (
    ASSETS_DIR,
    BUILD_CACHE_NAME,
    BUILD_SYSTEMD_STAGING_ROOT,
    BUILD_USER_HOME_ROOT,
    IMAGE_STORE_GRAPH_ROOT,
    SCRIPTS_DIR,
)
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.linux.image_store import BASE_IMAGE

_BUILD_CPU_QUOTA_PERCENT = 80
_BUILD_MEMORY_HIGH_PERCENT = 80
_BUILD_MEMORY_MAX_PERCENT = 80
_BUILD_MEMORY_SWAP_MAX = 0


def _ensure_group_membership(user, group):
    q_user = quote(user)
    q_group = quote(group)
    server.shell(
        name=f"Ensure {user} is a member of {group}",
        commands=[f"id -nG {q_user} | tr ' ' '\\n' | grep -Fxq {q_group} || gpasswd -a {q_user} {q_group}"],
        _sudo=True,
    )


def build_user_for(project_name: str) -> str:
    return f"{project_name}-build"


def build_group_for(project_name: str) -> str:
    return build_user_for(project_name)


def build_home_for(project_name: str) -> str:
    return f"{BUILD_USER_HOME_ROOT}/{build_user_for(project_name)}"


def build_cache_for(project_name: str) -> str:
    return f"{build_home_for(project_name)}/{BUILD_CACHE_NAME}"


def cpu_quota_for(online_cpu_count: int, per_cpu_percent: int = _BUILD_CPU_QUOTA_PERCENT) -> str:
    if online_cpu_count < 1:
        raise ValueError("online_cpu_count must be positive")
    return f"{online_cpu_count * per_cpu_percent}%"


def configure_build_user_storage(project_name: str):
    build_user = build_user_for(project_name)
    build_group = build_group_for(project_name)
    build_home = build_home_for(project_name)
    config_parent = f"{build_home}/.config"
    config_dir = f"{config_parent}/containers"
    storage_conf = f"{config_dir}/storage.conf"

    mkdir(
        name=f"Ensure .config directory for {build_user}",
        path=config_parent,
        user=build_user,
        group=build_group,
        mode="0700",
    )
    mkdir(
        name=f"Ensure containers config directory for {build_user}",
        path=config_dir,
        user=build_user,
        group=build_group,
        mode="0700",
    )
    render(
        name=f"Install storage.conf for {build_user}",
        src=ASSETS_DIR / "podman/build-user-storage.conf.j2",
        dest=storage_conf,
        user=build_user,
        group=build_group,
        mode="0600",
        additional_image_store=IMAGE_STORE_GRAPH_ROOT,
    )


def configure_build_user_cache(project_name: str):
    build_user = build_user_for(project_name)
    build_group = build_group_for(project_name)
    cache_dir = build_cache_for(project_name)

    mkdir(
        name=f"Ensure persistent build cache for {build_user}",
        path=cache_dir,
        user=build_user,
        group=build_group,
        mode="0700",
    )


def ensure_users_and_groups(ctx):
    build_user = build_user_for(ctx.app.project_name)
    build_group = build_group_for(ctx.app.project_name)
    build_home = build_home_for(ctx.app.project_name)
    host = ctx_host.get()
    cpu_quota = cpu_quota_for(host.get_fact(Cpus))
    staged_dropin = f"{BUILD_SYSTEMD_STAGING_ROOT}/{build_user}.slice.conf"

    _ensure_site_identities(ctx, host, build_group)
    _ensure_build_user(build_user, build_group, build_home)
    _configure_build_user(ctx, build_user, cpu_quota, staged_dropin)
    _verify_build_user(build_user, build_home)


def _ensure_site_identities(ctx, host, build_group):
    server.group(
        name="Ensure runtime group exists",
        group=ctx.runtime.runtime_group,
        _sudo=True,
    )

    server.group(
        name="Ensure build group exists",
        group=build_group,
        _sudo=True,
    )

    existing_user = host.get_fact(Users).get(ctx.runtime.runtime_user)

    if existing_user is None:
        server.user(
            name="Ensure runtime user exists with groups",
            user=ctx.runtime.runtime_user,
            system=True,
            home="/nonexistent",
            shell="/usr/sbin/nologin",
            create_home=False,
            groups=[ctx.runtime.runtime_group],
            _sudo=True,
        )
    elif (
        ctx.runtime.runtime_group != existing_user["group"] and ctx.runtime.runtime_group not in existing_user["groups"]
    ):
        _ensure_group_membership(ctx.runtime.runtime_user, ctx.runtime.runtime_group)


def _ensure_build_user(build_user, build_group, build_home):
    mkdir(
        name="Ensure bonesdeploy user home root exists",
        path=BUILD_USER_HOME_ROOT,
    )

    # useradd allocates unused subuid/subgid ranges for new non-system users.
    # ponytail: damaged existing mappings fail verification; repair them with
    # administrator-selected usermod ranges rather than guessing new ownership.
    server.user(
        name="Ensure build user exists",
        user=build_user,
        group=build_group,
        home=build_home,
        shell="/usr/sbin/nologin",
        create_home=True,
        _sudo=True,
    )

    mkdir(
        name=f"Ensure persistent home for {build_user}",
        path=build_home,
        user=build_user,
        group=build_group,
        mode="0700",
    )
    server.shell(
        name=f"Enable linger for {build_user}",
        commands=[f"loginctl enable-linger {quote(build_user)}"],
        _sudo=True,
    )
    server.shell(
        name=f"Start systemd user manager for {build_user}",
        commands=[f"systemctl start user@$(id -u {quote(build_user)}).service"],
        _sudo=True,
    )


def _configure_build_user(ctx, build_user, cpu_quota, staged_dropin):
    mkdir(
        name="Ensure systemd drop-in staging directory exists",
        path=BUILD_SYSTEMD_STAGING_ROOT,
    )
    render(
        name=f"Stage resource limits for {build_user}",
        src=ASSETS_DIR / "systemd/bonesdeploy-build.slice.j2",
        dest=staged_dropin,
        cpu_quota=cpu_quota,
        memory_high=f"{_BUILD_MEMORY_HIGH_PERCENT}%",
        memory_max=f"{_BUILD_MEMORY_MAX_PERCENT}%",
        memory_swap_max=_BUILD_MEMORY_SWAP_MAX,
    )
    server.script_template(
        name=f"Install and apply resource limits for {build_user}",
        src=str(SCRIPTS_DIR / "apply-build-resource-limits.sh.j2"),
        build_user=build_user,
        staged_dropin=staged_dropin,
        cpu_quota=cpu_quota,
        memory_high=f"{_BUILD_MEMORY_HIGH_PERCENT}%",
        memory_max=f"{_BUILD_MEMORY_MAX_PERCENT}%",
        memory_swap_max=_BUILD_MEMORY_SWAP_MAX,
        _sudo=True,
    )
    configure_build_user_storage(ctx.app.project_name)
    configure_build_user_cache(ctx.app.project_name)


def _verify_build_user(build_user, build_home):
    server.script_template(
        name=f"Verify rootless Podman for {build_user}",
        src=str(SCRIPTS_DIR / "verify-rootless-podman.sh.j2"),
        build_home=build_home,
        _sudo=True,
        _sudo_user=build_user,
        _chdir=build_home,
    )
    server.shell(
        name=f"Verify shared image store for {build_user}",
        commands=[
            f"HOME={quote(build_home)} XDG_RUNTIME_DIR=/run/user/$(id -u) "
            f"podman image exists {quote(BASE_IMAGE)} || "
            '(echo "ERROR: base image not found in shared store" >&2; false)',
        ],
        _sudo=True,
        _sudo_user=build_user,
        _chdir=build_home,
    )
    server.shell(
        name=f"Verify build cache for {build_user}",
        commands=[
            f"test -d {quote(build_home)}/cache "
            f"&& test -O {quote(build_home)}/cache "
            f"&& test -G {quote(build_home)}/cache "
            "|| (echo 'ERROR: build cache missing or unsafe' >&2; false)",
        ],
        _sudo=True,
        _sudo_user=build_user,
        _chdir=build_home,
    )

import re
from pathlib import Path
from shlex import quote

from pyinfra.operations import files, server, systemd

from bonesinfra.config.context import template_data
from bonesinfra.config.paths import ASSETS_DIR, ETC_SYSTEMD_SYSTEM
from bonesinfra.services.linux import validation

SERVICE_NAME_RE = re.compile(r"[a-z0-9][a-z0-9_-]*")


def runtime_paths(ctx):
    return ctx.paths_dict


def render_target(ctx, *, paths):
    """Install the root-owned systemd lifecycle target for this site."""
    files.template(
        name="Deploy site systemd target",
        src=str(ASSETS_DIR / "systemd/site.target.j2"),
        dest=paths["systemd_site_target"],
        user="root",
        group="root",
        mode="0644",
        **template_data(ctx, paths=paths),
        _sudo=True,
    )
    requires_dir = quote(paths["systemd_site_target_requires"])
    server.shell(
        name="Reconcile site systemd target memberships",
        commands=[
            f"rm -rf -- {requires_dir}; install -d -o root -g root -m 0755 -- {requires_dir}",
        ],
        _sudo=True,
    )


def register_service(ctx, *, paths, name):
    """Register an exact, project-derived required unit in the site's target."""
    if not SERVICE_NAME_RE.fullmatch(name):
        raise ValueError(f"invalid site service name: {name}")
    service_name = f"{ctx.app.project_name}-{name}.service"
    requires_dir = paths["systemd_site_target_requires"]
    link_path = f"{requires_dir}/{service_name}"
    service_path = str(Path(ETC_SYSTEMD_SYSTEM) / service_name)
    server.shell(
        name=f"Require {service_name} from site target",
        commands=[
            f"install -d -o root -g root -m 0755 -- {quote(requires_dir)} && "
            f"ln -sfn -- {quote(service_path)} {quote(link_path)}",
        ],
        _sudo=True,
    )


def remove_direct_boot(ctx, name):
    """Remove only the legacy direct multi-user boot link for a site service."""
    if not SERVICE_NAME_RE.fullmatch(name):
        raise ValueError(f"invalid site service name: {name}")
    service_name = f"{ctx.app.project_name}-{name}.service"
    link_path = Path(ETC_SYSTEMD_SYSTEM) / "multi-user.target.wants" / service_name
    server.shell(
        name=f"Remove {name} service from direct multi-user boot",
        commands=[f"rm -f -- {quote(str(link_path))}"],
        _sudo=True,
    )


def render_app_service(  # noqa: PLR0913
    ctx,
    *,
    paths,
    name,
    runtime_label,
    runtime_exec,
    apparmor_profile_name,
    runtime_write_paths,
    runtime_address_families="AF_UNIX",
):
    files.template(
        name=f"Deploy {name} systemd service",
        src=str(ASSETS_DIR / "systemd/app.service.j2"),
        dest=ctx.paths.systemd_service(name),
        user="root",
        group="root",
        mode="0644",
        runtime_name=name,
        runtime_label=runtime_label,
        runtime_exec=runtime_exec,
        apparmor_profile_name=apparmor_profile_name,
        runtime_write_paths=" ".join(runtime_write_paths),
        runtime_address_families=runtime_address_families,
        **template_data(ctx, paths=paths),
        _sudo=True,
    )
    register_service(ctx, paths=paths, name=name)


def enable_and_start(ctx, name, *, apparmor_profile_name=None):
    service_name = f"{ctx.app.project_name}-{name}.service"
    remove_direct_boot(ctx, name)
    systemd.service(
        name=f"Start {name} service",
        service=service_name,
        running=True,
        daemon_reload=True,
        _sudo=True,
    )
    if apparmor_profile_name:
        validation.verify_profile_attached(service_name, apparmor_profile_name)

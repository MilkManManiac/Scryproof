from pyinfra.operations import server

from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import render


def render_profile(
    ctx,
    *,
    paths,
    runtime,
    apparmor_exec_paths,
    apparmor_writable_paths,
    template_src,
    apparmor_network="network unix stream,",
):
    profile_name = f"bonesdeploy-{ctx.app.project_name}-{runtime}"
    profile_path = ctx.paths.apparmor_profile(runtime)

    render(
        f"Deploy {runtime} AppArmor profile",
        template_src,
        profile_path,
        apparmor_profile_name=profile_name,
        apparmor_runtime=runtime,
        apparmor_exec_paths=apparmor_exec_paths,
        apparmor_writable_paths=apparmor_writable_paths,
        apparmor_network=apparmor_network,
        **template_data(ctx, paths=paths),
    )
    server.shell(
        name=f"Load {runtime} AppArmor profile",
        commands=[f"apparmor_parser -r -T -W {profile_path}"],
        _sudo=True,
    )
    server.shell(
        name=f"Enforce {runtime} AppArmor profile",
        commands=[f'grep -qxF "{profile_name} (enforce)" /sys/kernel/security/apparmor/profiles'],
        _sudo=True,
    )
    return profile_name

from pyinfra.operations import files

from bonesinfra.config.paths import RUNTIME_SOCKET_PARENT


def ensure_runtime_dirs(ctx):
    project = ctx.app.project_name
    files.directory(
        name="Ensure runtime socket directory exists",
        path=f"{RUNTIME_SOCKET_PARENT}/{project}",
        user=ctx.runtime.runtime_user,
        group=ctx.runtime.runtime_group,
        mode="0711",
        _sudo=True,
    )

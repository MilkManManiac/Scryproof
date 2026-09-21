from pyinfra.operations import files

from bonesinfra.config.paths import BONESDEPLOY_LOG_ROOT


def ensure(ctx):
    files.directory(
        name="Ensure BonesDeploy log root exists",
        path=BONESDEPLOY_LOG_ROOT,
        user="root",
        group="root",
        mode="0755",
        _sudo=True,
    )
    files.directory(
        name="Ensure per-project log directory exists",
        path=f"{BONESDEPLOY_LOG_ROOT}/{ctx.app.project_name}",
        user=ctx.runtime.runtime_user,
        group=ctx.runtime.runtime_group,
        mode="0750",
        _sudo=True,
    )

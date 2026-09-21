from bonesinfra.pyinfra.operations import mkdir


def ensure_directories(ctx, paths, directories):
    for directory in directories:
        mkdir(
            name=f"Ensure shared directory {directory}",
            path=f"{paths['shared']}/{directory}",
            user=ctx.runtime.runtime_user,
            group=ctx.runtime.runtime_group,
            mode="0770",
        )

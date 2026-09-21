from bonesinfra.cli.commands.site import directories, placeholder, users
from bonesinfra.config.context import DeployContext


def deploy_site_setup(ctx: DeployContext):
    paths = ctx.paths_dict
    users.ensure_users_and_groups(ctx)
    directories.setup_repo_and_project(ctx, paths)
    placeholder.seed(ctx, paths)

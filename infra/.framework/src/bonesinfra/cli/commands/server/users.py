from pyinfra.operations import server

from bonesinfra.config.context import DEPLOY_USER, ServerContext
from bonesinfra.config.paths import SCRIPTS_DIR


def ensure_deploy_user(ctx: ServerContext):
    server.user(
        name="Ensure deploy user exists",
        user=DEPLOY_USER,
        shell="/bin/bash",
        ensure_home=True,
        _sudo=True,
    )
    install_authorized_key(ctx)


def install_authorized_key(ctx: ServerContext):
    deploy_user = DEPLOY_USER
    ssh_user = ctx.ssh_user
    server.script_template(
        name=f"Copy {ssh_user} SSH key to deploy user {deploy_user}",
        src=str(SCRIPTS_DIR / "copy-ssh-authorized-keys.sh.j2"),
        deploy_user=deploy_user,
        ssh_user=ssh_user,
        _sudo=True,
    )

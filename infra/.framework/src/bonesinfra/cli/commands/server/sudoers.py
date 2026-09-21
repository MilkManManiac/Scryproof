from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.context import DEPLOY_USER
from bonesinfra.config.paths import ASSETS_DIR, BONESREMOTE_BINARY, ETC_SUDOERS_D, USR_LOCAL_BIN
from bonesinfra.pyinfra.operations import render


def install():
    sudoers_path = f"{ETC_SUDOERS_D}/bonesdeploy"
    render(
        "Install BonesDeploy sudoers drop-in",
        ASSETS_DIR / "sudoers/bonesdeploy.j2",
        sudoers_path,
        user="root",
        group="root",
        mode="0440",
        deploy_user=DEPLOY_USER,
        bonesremote_path=f"{USR_LOCAL_BIN}/{BONESREMOTE_BINARY}",
    )

    sudoers_path = quote(sudoers_path)
    server.shell(
        name="Validate BonesDeploy sudoers drop-in",
        commands=[f"visudo -c -f {sudoers_path} >/dev/null || {{ rm -f {sudoers_path}; exit 1; }}"],
        _sudo=True,
    )

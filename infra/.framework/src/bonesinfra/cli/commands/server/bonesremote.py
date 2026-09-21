from pyinfra.operations import server

from bonesinfra.config.paths import SCRIPTS_DIR


def install(version: str):
    server.script_template(
        name="Install bonesremote binary",
        src=str(SCRIPTS_DIR / "install-bonesremote.sh.j2"),
        bonesremote_version=version,
        _sudo=True,
    )

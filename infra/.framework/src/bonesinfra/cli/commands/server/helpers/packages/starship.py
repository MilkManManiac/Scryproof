from pyinfra.operations import files, server

from bonesinfra.config.paths import ASSETS_DIR

STARSHIP_BIN = "/usr/local/bin/starship"
STARSHIP_CONFIG = "/etc/starship.toml"
PROFILE_SCRIPT = "/etc/profile.d/bonesinfra-shell.sh"


def install():
    server.shell(
        name="Install starship prompt",
        commands=[
            (f"test -x {STARSHIP_BIN} || curl -fsSL https://starship.rs/install.sh | sh -s -- -y -b /usr/local/bin")
        ],
        _sudo=True,
    )

    files.put(
        name="Install starship config",
        src=str(ASSETS_DIR / "starship.toml"),
        dest=STARSHIP_CONFIG,
        user="root",
        group="root",
        mode="0644",
        _sudo=True,
    )

    files.put(
        name="Install shell profile for starship",
        src=str(ASSETS_DIR / "profile.d/bonesinfra-shell.sh"),
        dest=PROFILE_SCRIPT,
        user="root",
        group="root",
        mode="0644",
        _sudo=True,
    )

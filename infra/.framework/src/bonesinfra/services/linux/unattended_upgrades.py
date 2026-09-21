from bonesinfra.config.paths import ASSETS_DIR
from bonesinfra.pyinfra.operations import render

AUTO_UPGRADES_PATH = "/etc/apt/apt.conf.d/20auto-upgrades"
UNATTENDED_UPGRADES_PATH = "/etc/apt/apt.conf.d/50unattended-upgrades"


def configure():
    render(
        "Install apt auto-upgrades config",
        ASSETS_DIR / "unattended-upgrades/20auto-upgrades.j2",
        AUTO_UPGRADES_PATH,
    )

    render(
        "Install unattended-upgrades config",
        ASSETS_DIR / "unattended-upgrades/50unattended-upgrades.j2",
        UNATTENDED_UPGRADES_PATH,
    )

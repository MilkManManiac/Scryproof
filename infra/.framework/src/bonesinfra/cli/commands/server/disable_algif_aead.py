from pyinfra.operations import server

from bonesinfra.config.paths import ASSETS_DIR
from bonesinfra.pyinfra.operations import render

DISABLE_ALGIF_PATH = "/etc/modprobe.d/disable-algif.conf"


def configure():
    render(
        "Disable the vulnerable algif_aead module",
        ASSETS_DIR / "modprobe/disable-algif.conf.j2",
        DISABLE_ALGIF_PATH,
    )

    # Containerized hosts (LXC-style VPSes, e2e containers) share the host
    # kernel: /proc/modules shows the host's modules and unloading is neither
    # possible nor ours to do. The modprobe.d blacklist above still applies.
    server.shell(
        name="Unload the vulnerable algif_aead module",
        commands=[
            "if ! systemd-detect-virt --container --quiet"
            " && grep -q '^algif_aead ' /proc/modules; then rmmod algif_aead; fi"
        ],
        _sudo=True,
    )

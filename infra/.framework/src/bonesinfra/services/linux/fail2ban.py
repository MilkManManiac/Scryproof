from pyinfra.operations import systemd

from bonesinfra.config.paths import ASSETS_DIR
from bonesinfra.pyinfra.operations import render

FAIL2BAN_JAIL_LOCAL = "/etc/fail2ban/jail.local"


def configure(ctx):
    render(
        "Install fail2ban jail.local",
        ASSETS_DIR / "fail2ban/jail.local.j2",
        FAIL2BAN_JAIL_LOCAL,
        ssh_port=int(ctx.port),
    )

    systemd.service(
        name="Ensure fail2ban service is enabled and started",
        service="fail2ban",
        enabled=True,
        running=True,
        _sudo=True,
    )

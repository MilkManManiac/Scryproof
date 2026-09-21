from pyinfra.operations import server


def configure(ctx):
    ssh_port = int(ctx.port)
    cmds = [
        f"ufw allow {ssh_port}/tcp",
        "ufw allow 80/tcp",
        "ufw allow 443/tcp",
        "ufw --force default deny incoming",
        "ufw --force default allow outgoing",
        "ufw --force enable",
    ]

    server.shell(
        name="Apply UFW configuration",
        commands=cmds,
        _sudo=True,
    )

    server.shell(
        name="Display UFW status",
        commands=["ufw status verbose"],
        _sudo=True,
    )

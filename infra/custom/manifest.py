"""What this project puts on the box, for `bonesdeploy site manifest`."""

NAME = "scryproof"


def artifacts(ctx):
    paths = ctx.paths
    placeholder = paths.placeholder_release
    return [
        ("application AppArmor profile", paths.apparmor_profile(NAME), "file", "framework"),
        ("application systemd service", paths.systemd_service(NAME), "file", "framework"),
        ("application systemd requirement", paths.systemd_service_requirement(NAME), "link", "framework"),
        ("application runtime directory", paths.runtime_service_dir(NAME), "directory", "framework"),
        ("application log directory", paths.site_log_dir, "directory", "framework"),
        ("placeholder server bundle", f"{placeholder}/server/dist/index.js", "file", "framework"),
        ("placeholder page", f"{placeholder}/web/dist/index.html", "file", "framework"),
    ]


def services(_ctx):
    return [
        ("site nginx", "{project}-nginx.service", "runtime"),
        ("application service", "{project}-scryproof.service", "framework"),
    ]


def mode(_ctx):
    return "server"

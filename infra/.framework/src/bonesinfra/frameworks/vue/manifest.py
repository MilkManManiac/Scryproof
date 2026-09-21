def artifacts(ctx):
    paths = ctx.paths
    return [
        ("static placeholder web root", f"{paths.placeholder_release}/dist", "directory", "framework"),
        ("static placeholder index", f"{paths.placeholder_release}/dist/index.html", "file", "framework"),
        ("current static web root", f"{paths.current}/dist", "directory", "framework"),
        ("nginx site configuration", paths.site_nginx_config, "file", "runtime"),
        ("nginx site", paths.nginx_site_available, "file", "runtime"),
        ("enabled nginx site", paths.nginx_site_enabled, "link", "runtime"),
        ("site systemd target", paths.systemd_site_target, "file", "runtime"),
        ("site systemd requirements", paths.systemd_site_target_requires, "directory", "runtime"),
        ("site nginx systemd service", paths.systemd_site_nginx_service, "file", "runtime"),
        ("site nginx systemd requirement", paths.systemd_site_nginx_requirement, "link", "runtime"),
        ("runtime socket directory", paths.runtime_socket_dir, "directory", "runtime"),
        ("runtime nginx directory", paths.runtime_nginx_dir, "directory", "runtime"),
        ("runtime nginx socket", paths.runtime_nginx_socket, "socket", "runtime"),
        ("runtime nginx PID", paths.runtime_nginx_pid, "file", "runtime"),
    ]


def services(_ctx):
    return [("site nginx", "{project}-nginx.service", "runtime")]


def mode(_ctx):
    return "static"

def artifacts(ctx):
    paths = ctx.paths
    placeholder = paths.placeholder_release
    return [
        ("application AppArmor profile", paths.apparmor_profile("gunicorn"), "file", "framework"),
        ("application systemd service", paths.systemd_service("gunicorn"), "file", "framework"),
        ("application systemd requirement", paths.systemd_service_requirement("gunicorn"), "link", "framework"),
        ("application runtime directory", paths.runtime_service_dir("gunicorn"), "directory", "framework"),
        ("application runtime socket", paths.runtime_service_socket("gunicorn"), "file", "framework"),
        ("application log directory", paths.site_log_dir, "directory", "framework"),
        ("Django placeholder virtual environment", f"{placeholder}/.venv", "directory", "framework"),
        ("Django placeholder configuration", f"{placeholder}/config", "directory", "framework"),
        ("Django placeholder WSGI application", f"{placeholder}/config/wsgi.py", "file", "framework"),
        ("nginx site configuration", paths.site_nginx_config, "file", "runtime"),
        ("nginx site", paths.nginx_site_available, "file", "runtime"),
        ("enabled nginx site", paths.nginx_site_enabled, "link", "runtime"),
    ]


def services(_ctx):
    return [
        ("site nginx", "{project}-nginx.service", "runtime"),
        ("application service", "{project}-gunicorn.service", "framework"),
    ]


def mode(_ctx):
    return "server"

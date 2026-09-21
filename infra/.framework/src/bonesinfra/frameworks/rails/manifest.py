def artifacts(ctx):
    paths = ctx.paths
    placeholder = paths.placeholder_release
    return [
        ("application AppArmor profile", paths.apparmor_profile("puma"), "file", "framework"),
        ("application systemd service", paths.systemd_service("puma"), "file", "framework"),
        ("application systemd requirement", paths.systemd_service_requirement("puma"), "link", "framework"),
        ("application runtime directory", paths.runtime_service_dir("puma"), "directory", "framework"),
        ("application runtime socket", paths.runtime_service_socket("puma"), "file", "framework"),
        ("application log directory", paths.site_log_dir, "directory", "framework"),
        ("Rails placeholder Gemfile", f"{placeholder}/Gemfile", "file", "framework"),
        ("Rails placeholder Rack configuration", f"{placeholder}/config.ru", "file", "framework"),
        ("nginx site configuration", paths.site_nginx_config, "file", "runtime"),
        ("nginx site", paths.nginx_site_available, "file", "runtime"),
        ("enabled nginx site", paths.nginx_site_enabled, "link", "runtime"),
    ]


def services(_ctx):
    return [
        ("site nginx", "{project}-nginx.service", "runtime"),
        ("application service", "{project}-puma.service", "framework"),
    ]


def mode(_ctx):
    return "server"

def artifacts(ctx):
    paths = ctx.paths
    if ctx.runtime.data.get("is_static", True):
        return [
            ("static placeholder web root", f"{paths.placeholder_release}/.output/public", "directory", "framework"),
            ("static placeholder index", f"{paths.placeholder_release}/.output/public/index.html", "file", "framework"),
            ("current static web root", f"{paths.current}/.output/public", "directory", "framework"),
        ]
    return [
        ("application AppArmor profile", paths.apparmor_profile("nuxt"), "file", "framework"),
        ("application systemd service", paths.systemd_service("nuxt"), "file", "framework"),
        ("application systemd requirement", paths.systemd_service_requirement("nuxt"), "link", "framework"),
        ("application runtime directory", paths.runtime_service_dir("nuxt"), "directory", "framework"),
        ("application runtime socket", paths.runtime_service_socket("nuxt"), "file", "framework"),
        ("application log directory", paths.site_log_dir, "directory", "framework"),
        ("Nuxt placeholder server directory", f"{paths.placeholder_release}/.output/server", "directory", "framework"),
        ("Nuxt placeholder server", f"{paths.placeholder_release}/.output/server/index.mjs", "file", "framework"),
    ]


def services(ctx):
    services = [("site nginx", "{project}-nginx.service", "runtime")]
    if not ctx.runtime.data.get("is_static", True):
        services.append(("application service", "{project}-nuxt.service", "framework"))
    return services


def mode(ctx):
    return "static" if ctx.runtime.data.get("is_static", True) else "server"

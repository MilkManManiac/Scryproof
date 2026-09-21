def artifacts(ctx):
    paths = ctx.paths
    if ctx.runtime.data.get("is_static", True):
        return [
            ("static placeholder web root", f"{paths.placeholder_release}/out", "directory", "framework"),
            ("static placeholder index", f"{paths.placeholder_release}/out/index.html", "file", "framework"),
            ("current static web root", f"{paths.current}/out", "directory", "framework"),
        ]
    placeholder = paths.placeholder_release
    return [
        ("application AppArmor profile", paths.apparmor_profile("next"), "file", "framework"),
        ("application systemd service", paths.systemd_service("next"), "file", "framework"),
        ("application systemd requirement", paths.systemd_service_requirement("next"), "link", "framework"),
        ("application runtime directory", paths.runtime_service_dir("next"), "directory", "framework"),
        ("application runtime socket", paths.runtime_service_socket("next"), "file", "framework"),
        ("application log directory", paths.site_log_dir, "directory", "framework"),
        ("Next.js placeholder standalone directory", f"{placeholder}/.next/standalone", "directory", "framework"),
        ("Next.js placeholder standalone server", f"{placeholder}/.next/standalone/server.js", "file", "framework"),
    ]


def services(ctx):
    services = [("site nginx", "{project}-nginx.service", "runtime")]
    if not ctx.runtime.data.get("is_static", True):
        services.append(("application service", "{project}-next.service", "framework"))
    return services


def mode(ctx):
    return "static" if ctx.runtime.data.get("is_static", True) else "server"

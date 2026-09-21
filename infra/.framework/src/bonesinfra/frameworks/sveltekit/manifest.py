def artifacts(ctx):
    paths = ctx.paths
    placeholder = paths.placeholder_release
    return [
        ("application AppArmor profile", paths.apparmor_profile("sveltekit"), "file", "framework"),
        ("application systemd service", paths.systemd_service("sveltekit"), "file", "framework"),
        ("application systemd requirement", paths.systemd_service_requirement("sveltekit"), "link", "framework"),
        ("application runtime directory", paths.runtime_service_dir("sveltekit"), "directory", "framework"),
        ("application runtime socket", paths.runtime_service_socket("sveltekit"), "file", "framework"),
        ("application log directory", paths.site_log_dir, "directory", "framework"),
        ("SvelteKit placeholder build directory", f"{placeholder}/build", "directory", "framework"),
        ("SvelteKit placeholder entrypoint", f"{placeholder}/build/index.js", "file", "framework"),
        ("SvelteKit placeholder environment", f"{placeholder}/.env", "file", "framework"),
    ]


def services(_ctx):
    return [
        ("site nginx", "{project}-nginx.service", "runtime"),
        ("application service", "{project}-sveltekit.service", "framework"),
    ]


def mode(_ctx):
    return "server"

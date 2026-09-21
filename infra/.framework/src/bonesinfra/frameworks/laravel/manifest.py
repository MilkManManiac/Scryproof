from bonesinfra.services.languages.php import php_fpm_pool_config_path, php_fpm_socket_path


def artifacts(ctx):
    paths = ctx.paths
    version = str(ctx.runtime.data.get("php_version", "8.5"))
    project = ctx.app.project_name
    entries = [
        (
            "PHP-FPM pool configuration",
            php_fpm_pool_config_path(version, project),
            "file",
            "framework",
        ),
        (
            "PHP-FPM socket",
            php_fpm_socket_path(version, project),
            "socket",
            "framework",
        ),
        ("PHP log directory", paths.site_log_dir, "directory", "framework"),
        ("current PHP web root", paths.current_web_root, "directory", "framework"),
        ("nginx site configuration", paths.site_nginx_config, "file", "runtime"),
        ("nginx site", paths.nginx_site_available, "file", "runtime"),
        ("enabled nginx site", paths.nginx_site_enabled, "link", "runtime"),
    ]
    if ctx.runtime.backend == "docker":
        entries.extend(
            [
                (
                    "Docker runtime socket",
                    paths.runtime_php_fpm_socket,
                    "socket",
                    "docker",
                ),
                (
                    "Docker runtime service",
                    paths.systemd_service("docker"),
                    "file",
                    "docker",
                ),
            ]
        )
    entries.append(("Laravel queue worker service", paths.systemd_service("worker"), "file", "framework"))
    return entries


def services(ctx):
    entries = [("site nginx", "{project}-nginx.service", "runtime")]
    if ctx.runtime.backend == "docker":
        entries.append(("Docker application", "{project}-docker.service", "docker"))
    entries.append(("Laravel queue worker", "{project}-worker.service", "framework"))
    return entries


def mode(_ctx):
    return "php"

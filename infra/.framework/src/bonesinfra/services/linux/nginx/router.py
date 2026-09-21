from pathlib import Path

from pyinfra.operations import files, server, systemd

from bonesinfra.config.context import template_data
from bonesinfra.config.paths import ASSETS_DIR, SCRIPTS_DIR
from bonesinfra.pyinfra.operations import letsencrypt_cert_paths, mkdir, render
from bonesinfra.services.linux import systemd as service


def install_default_deny_server(paths):
    # ponytail: self-signed is enough here because this server never serves
    # content; it only gives nginx a TLS default that can return 444.
    server.script_template(
        name="Ensure nginx default-deny SSL certificate exists",
        src=str(SCRIPTS_DIR / "ensure-default-deny-ssl.sh.j2"),
        cert=paths["nginx_default_deny_ssl_certificate"],
        key=paths["nginx_default_deny_ssl_certificate_key"],
        _sudo=True,
    )
    render(
        "Deploy nginx default-deny server",
        ASSETS_DIR / "nginx/default-deny.conf.j2",
        paths["nginx_default_deny_site_available"],
        paths=paths,
    )
    files.link(
        name="Enable nginx default-deny server",
        path=paths["nginx_default_deny_site_enabled"],
        target=paths["nginx_default_deny_site_available"],
        force=True,
        _sudo=True,
    )
    files.link(
        name="Disable Debian default nginx site",
        path=paths["nginx_default_site_enabled"],
        present=False,
        _sudo=True,
    )


def validate_config(name="Validate nginx configuration"):
    server.script(
        name=name,
        src=str(SCRIPTS_DIR / "validate-nginx-safety.sh"),
        _sudo=True,
    )


def render_router_config(ctx, paths, *, ssl_enabled, stage=None, validate=False, reload=False):
    nginx_server_name = ctx.app.dns.domain or ctx.app.dns.preview_domain
    label = f" ({stage})" if stage else ""
    cert_path, key_path = letsencrypt_cert_paths(nginx_server_name)
    render(
        f"Deploy router nginx config{label}",
        ASSETS_DIR / "nginx/router.conf.j2",
        paths["nginx_site_available"],
        nginx_server_name=nginx_server_name,
        nginx_ssl_enabled=ssl_enabled,
        nginx_ssl_certificate_path=cert_path,
        nginx_ssl_certificate_key_path=key_path,
        **template_data(ctx, paths=paths),
    )
    if validate:
        validate_config(f"Validate nginx configuration{label}")
    if reload:
        systemd.service(
            name=f"Reload nginx{label}",
            service="nginx",
            reloaded=True,
            _sudo=True,
        )


def setup(ctx, paths, *, nginx_address_families="AF_UNIX", nginx_ip_loopback_only=False):
    nginx_server_name = ctx.app.dns.domain or ctx.app.dns.preview_domain
    if not nginx_server_name:
        raise ValueError("domain or preview_domain is required for nginx config")

    service.render_target(ctx, paths=paths)
    # 0711: system nginx (www-data) needs traversal to reach the per-site
    # nginx socket at /run/<project>/nginx/nginx.sock. 0750 would block it.
    mkdir(
        name="Ensure socket directory exists",
        path=paths["runtime_socket_dir"],
        user=ctx.runtime.runtime_user,
        group=ctx.runtime.runtime_group,
        mode="0711",
    )
    mkdir(
        name="Ensure nginx runtime directory exists",
        path=paths["runtime_nginx_dir"],
        user=ctx.runtime.runtime_user,
        group=ctx.runtime.runtime_group,
        mode="0711",
    )
    mkdir(
        name="Ensure conf directory exists",
        path=paths["conf_root"],
        group=ctx.runtime.runtime_group,
        mode="0750",
    )
    render(
        "Deploy per-site nginx systemd service",
        ASSETS_DIR / "nginx/site-nginx.service.j2",
        paths["systemd_site_nginx_service"],
        nginx_address_families=nginx_address_families,
        nginx_ip_loopback_only=nginx_ip_loopback_only,
        **template_data(ctx, paths=paths),
    )
    service.register_service(ctx, paths=paths, name="nginx")
    systemd.daemon_reload(
        name="Reload systemd after site-nginx service change",
        _sudo=True,
    )

    # SSL state comes from the root .env (app.dns.ssl_enabled), not runtime data —
    # SSL is owned by `ssl apply`, not `runtime apply`.
    nginx_ssl_enabled = ctx.app.dns.ssl_enabled and ctx.app.dns.domain
    render_router_config(ctx, paths, ssl_enabled=nginx_ssl_enabled)
    install_default_deny_server(paths)

    files.link(
        name="Enable router nginx site",
        path=paths["nginx_site_enabled"],
        target=paths["nginx_site_available"],
        force=True,
        _sudo=True,
    )
    validate_config("Validate nginx configuration")


def start_services(ctx, paths):
    systemd.service(
        name="Ensure nginx service is enabled and started",
        service="nginx",
        enabled=True,
        running=True,
        _sudo=True,
    )
    service.remove_direct_boot(ctx, "nginx")
    systemd.service(
        name="Enable and restart site systemd target",
        service=Path(paths["systemd_site_target"]).name,
        enabled=True,
        running=True,
        restarted=True,
        daemon_reload=True,
        _sudo=True,
    )
    # ponytail: reload only after the per-site nginx socket exists, so the
    # router never flips over to a missing upstream and briefly serves 502s.
    server.shell(
        name="Reload nginx to apply site config changes",
        commands=["systemctl reload nginx"],
        _sudo=True,
    )

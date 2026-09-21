from pyinfra.operations import server

from bonesinfra.pyinfra.operations import mkdir
from bonesinfra.services.linux.nginx import router as nginx_router


def deploy_ssl(ctx):
    paths = ctx.paths_dict

    mkdir(
        name="Ensure ACME webroot exists",
        path=paths["acme_webroot"],
        mode="0755",
    )

    nginx_router.install_default_deny_server(paths)
    nginx_router.render_router_config(
        ctx, paths, ssl_enabled=False, stage="certbot challenge", validate=True, reload=True
    )
    obtain_certificate(ctx, paths)
    nginx_router.render_router_config(ctx, paths, ssl_enabled=True, stage="SSL enable", validate=True, reload=True)


def obtain_certificate(ctx, paths):
    server.shell(
        name="Obtain or renew certificate",
        commands=[
            "certbot certonly --non-interactive --agree-tos "
            f"--email {ctx.app.dns.email} "
            f"--webroot "
            f"-w {paths['acme_webroot']} "
            f"-d {ctx.app.dns.domain} "
            "--keep-until-expiring"
        ],
        _sudo=True,
    )

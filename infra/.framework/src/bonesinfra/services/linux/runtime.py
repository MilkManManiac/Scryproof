from bonesinfra.services.linux.apparmor import nginx as apparmor
from bonesinfra.services.linux.nginx import router


def setup(ctx, *, uses_tcp=False):
    paths = ctx.paths_dict
    network = "network inet stream," if uses_tcp else "network unix stream,"
    address_families = "AF_UNIX AF_INET" if uses_tcp else "AF_UNIX"

    apparmor.setup(ctx, paths, nginx_apparmor_network=network)
    router.setup(
        ctx,
        paths,
        nginx_address_families=address_families,
        nginx_ip_loopback_only=uses_tcp,
    )


def orchestrate(ctx, provision, *, uses_tcp=False):
    setup(ctx, uses_tcp=uses_tcp)
    provision(ctx)
    start_services(ctx)


def start_services(ctx):
    router.start_services(ctx, ctx.paths_dict)

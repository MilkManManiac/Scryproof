from bonesinfra.services.runtime import get_service


def deploy_services(ctx):
    for name in ctx.services.services:
        get_service(name).provision(ctx)

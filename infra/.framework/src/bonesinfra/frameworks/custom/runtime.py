from . import custom

SHARED_DIRECTORIES = ()


def deploy(ctx):
    custom.deploy(ctx)

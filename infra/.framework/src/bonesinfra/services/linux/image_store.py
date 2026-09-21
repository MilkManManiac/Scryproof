from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.paths import ASSETS_DIR, IMAGE_STORE_GRAPH_ROOT, IMAGE_STORE_RUN_ROOT, IMAGE_STORE_STORAGE_CONF
from bonesinfra.pyinfra.operations import mkdir, render

BASE_IMAGE = "docker.io/library/buildpack-deps:bookworm"


def ensure_shared_store():
    mkdir(
        name="Ensure shared image store graph root exists",
        path=IMAGE_STORE_GRAPH_ROOT,
        user="root",
        group="root",
        mode="0755",
    )
    mkdir(
        name="Ensure shared image store run root exists",
        path=IMAGE_STORE_RUN_ROOT,
        user="root",
        group="root",
        mode="0755",
    )
    render(
        name="Install shared image store storage configuration",
        src=ASSETS_DIR / "podman/image-store-storage.conf.j2",
        dest=IMAGE_STORE_STORAGE_CONF,
    )


def seed_base_image():
    server.shell(
        name="Pull base image into shared store",
        commands=[f"CONTAINERS_STORAGE_CONF={quote(IMAGE_STORE_STORAGE_CONF)} podman pull {quote(BASE_IMAGE)}"],
        _sudo=True,
    )
    server.shell(
        name="Verify base image exists in shared store",
        commands=[f"CONTAINERS_STORAGE_CONF={quote(IMAGE_STORE_STORAGE_CONF)} podman image exists {quote(BASE_IMAGE)}"],
        _sudo=True,
    )
    server.shell(
        name="Prune dangling layers from shared store",
        commands=[f"CONTAINERS_STORAGE_CONF={quote(IMAGE_STORE_STORAGE_CONF)} podman image prune --force"],
        _sudo=True,
    )
    # ponytail: recursive chmod is O(store-size); fine for intentionally
    # small seeded store — switch to targeted metadata perms if store grows.
    server.shell(
        name="Ensure shared store is world-readable for rootless users",
        commands=[
            f"chmod -R a+rX {quote(IMAGE_STORE_GRAPH_ROOT)}",
            f"chmod -R a+rX {quote(IMAGE_STORE_RUN_ROOT)}",
        ],
        _sudo=True,
    )

from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.context import template_data
from bonesinfra.config.paths import ASSETS_DIR
from bonesinfra.pyinfra.operations import render


def seed(ctx, paths):
    render(
        "Seed placeholder index page",
        ASSETS_DIR / "nginx/index.html.j2",
        paths["placeholder_index"],
        user="root",
        group=ctx.runtime.runtime_group,
        mode="0640",
        **template_data(ctx, paths=paths),
    )

    # Only point `current` at the placeholder when no release link exists yet, so
    # re-running setup after a deploy never replaces the active release.
    current = quote(paths["current"])
    placeholder = quote(paths["placeholder_release"])
    server.shell(
        name="Point current symlink at placeholder release when none exists",
        commands=[f"test -e {current} -o -L {current} || ln -s {placeholder} {current}"],
        _sudo=True,
    )

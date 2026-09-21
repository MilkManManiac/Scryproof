from __future__ import annotations

from pathlib import Path
from shlex import quote

from pyinfra.operations import server

from bonesinfra.config.context import DeployContext
from bonesinfra.config.paths import PATCHES_ROOT


def write_marker(ctx: DeployContext, patch_id: str) -> None:
    marker = f"{PATCHES_ROOT}/{ctx.app.project_name}/{patch_id}"
    marker_dir = str(Path(marker).parent)
    server.shell(
        name=f"Write remote patch marker {patch_id}",
        commands=[
            (
                f"if [ ! -e {quote(marker)} ]; then mkdir -p {quote(marker_dir)}; "
                f'tmp={quote(marker)}.tmp-$$; printf \'completed\\n\' > "$tmp"; mv "$tmp" {quote(marker)}; fi'
            ),
        ],
        _sudo=True,
    )

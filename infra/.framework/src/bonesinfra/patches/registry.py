from __future__ import annotations

import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from bonesinfra.config.context import DeployContext
from bonesinfra.patches import local, remote

VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")


@dataclass(frozen=True, order=True)
class Version:
    major: int
    minor: int
    patch: int

    @classmethod
    def parse(cls, value: str) -> Version:
        match = VERSION_RE.fullmatch(value)
        if match is None:
            raise ValueError(f"invalid version '{value}'")
        return cls(*(int(component) for component in match.groups()))


@dataclass(frozen=True)
class Patch:
    identifier: str
    introduced_in: Version
    local_apply: Callable[[Path], None]


PATCHES = (Patch("0003-project-infra", Version(0, 8, 0), local.migrate_to_project_infra),)


def apply_local(ctx: DeployContext, target_version: str) -> None:
    marker_dir = _local_marker_dir(ctx)
    project_root = Path.cwd()
    for patch in select_patches(target_version):
        marker = marker_dir / patch.identifier
        if marker.exists():
            continue
        patch.local_apply(project_root)
        _write_marker(marker)


def apply_remote(ctx: DeployContext, target_version: str) -> None:
    for patch in select_patches(target_version):
        remote.write_marker(ctx, patch.identifier)


def select_patches(target_version: str) -> tuple[Patch, ...]:
    target = Version.parse(target_version)
    return tuple(patch for patch in PATCHES if patch.introduced_in <= target)


def _local_marker_dir(ctx: DeployContext) -> Path:
    data_home = os.environ.get("XDG_DATA_HOME")
    root = Path(data_home) / "bonesdeploy" if data_home else Path.home() / ".local/share/bonesdeploy"
    return root / "patches" / ctx.app.project_name


def _write_marker(marker: Path) -> None:
    marker.parent.mkdir(parents=True, exist_ok=True)
    temporary = marker.with_name(f".{marker.name}.tmp-{os.getpid()}")
    temporary.write_text("completed\n")
    temporary.replace(marker)

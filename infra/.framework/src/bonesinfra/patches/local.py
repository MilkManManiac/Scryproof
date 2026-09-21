from __future__ import annotations

import filecmp
import shutil
import tempfile
from pathlib import Path

OWNED_ENTRIES = frozenset(("deployment", "infra", "secrets"))
CONTROL_ENTRIES = frozenset((".git", ".gitignore", "bones.toml"))


def migrate_to_project_infra(project_root: Path) -> None:
    old_path = project_root / ".bones"
    if not old_path.exists() and not old_path.is_symlink():
        return

    source = old_path.resolve() if old_path.is_symlink() else old_path
    if not source.is_dir():
        raise RuntimeError(".bones is neither a directory nor a symlink; migration refused")

    _validate_source(source)
    staging = Path(tempfile.mkdtemp(prefix=".infra.migrate-", dir=project_root))
    try:
        _copy_owned_content(source, staging)
        _verify_owned_content(source, staging)
        _move_owned_content(staging, project_root / "infra")
        _verify_owned_content(source, project_root / "infra")
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    if old_path.is_symlink():
        old_path.unlink()
    else:
        shutil.rmtree(old_path)


def _validate_source(source: Path) -> None:
    for entry in source.iterdir():
        if entry.name not in OWNED_ENTRIES | CONTROL_ENTRIES:
            raise RuntimeError(f"Unexpected entry {entry} in old .bones; migration is ambiguous")
        if entry.name in CONTROL_ENTRIES:
            if entry.is_symlink():
                raise RuntimeError(f"Old control entry {entry} is a symlink; migration refused")
        else:
            _validate_tree(entry)

    old_infra = source / "infra"
    if old_infra.is_dir():
        for name in ("deployment", "secrets"):
            if (old_infra / name).exists() or (old_infra / name).is_symlink():
                raise RuntimeError(f"Both .bones/infra/{name} and .bones/{name} exist; migration is ambiguous")


def _validate_tree(path: Path) -> None:
    if path.is_symlink() or not (path.is_dir() or path.is_file()):
        raise RuntimeError(f"Unsafe entry {path} in old .bones; migration refused")
    if path.is_dir():
        for child in path.iterdir():
            _validate_tree(child)


def _copy_owned_content(source: Path, destination: Path) -> None:
    old_infra = source / "infra"
    if old_infra.is_dir():
        custom = destination / "custom"
        custom.mkdir(parents=True)
        for entry in old_infra.iterdir():
            _copy_tree(entry, custom / entry.name)
        (custom / "__init__.py").touch(exist_ok=True)
    for name in ("deployment", "secrets"):
        entry = source / name
        if entry.exists() or entry.is_symlink():
            _copy_tree(entry, destination / name)


def _copy_tree(source: Path, destination: Path) -> None:
    if source.is_dir():
        destination.mkdir()
        shutil.copystat(source, destination)
        for entry in source.iterdir():
            _copy_tree(entry, destination / entry.name)
    elif source.is_file():
        shutil.copy2(source, destination)
    else:
        raise RuntimeError(f"Unsafe entry {source} in old .bones; migration refused")


def _verify_owned_content(source: Path, destination: Path) -> None:
    old_infra = source / "infra"
    if old_infra.is_dir():
        for entry in old_infra.iterdir():
            _verify_tree(entry, destination / "custom" / entry.name)
    for name in ("deployment", "secrets"):
        entry = source / name
        if entry.exists() or entry.is_symlink():
            _verify_tree(entry, destination / name)


def _move_owned_content(staging: Path, destination: Path) -> None:
    for name in ("deployment", "secrets", "custom"):
        source = staging / name
        if not source.exists():
            continue
        target = destination / name
        if target.exists() or target.is_symlink():
            raise RuntimeError(f"{target} already exists; migration will not merge or overwrite it")
    for name in ("deployment", "secrets", "custom"):
        source = staging / name
        if not source.exists():
            continue
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        source.replace(target)


def _verify_tree(source: Path, destination: Path) -> None:
    if source.is_dir() != destination.is_dir() or source.is_file() != destination.is_file():
        raise RuntimeError(f"Migration destination has an unsafe type for {destination}")
    if source.is_file():
        if not filecmp.cmp(source, destination, shallow=False):
            raise RuntimeError(f"Migration verification failed for {destination}")
        return
    for entry in source.iterdir():
        _verify_tree(entry, destination / entry.name)

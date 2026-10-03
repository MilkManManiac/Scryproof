#!/usr/bin/env python3
"""Install a verified static export on the box, with an atomic, reversible switch.

Run as root: python3 install-release.py /tmp/game.tar.gz
No build commands or game code execute on the server.
"""

import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import tarfile
import tempfile

BASE = Path("/srv/sites/scryproof-activities")
MAX_BYTES = 256 * 1024 * 1024
REQUIRED = {
    "index.html",
    "index.js",
    "index.wasm",
    "index.pck",
    "activity.js",
    "activity.css",
    "release.json",
}


def validate(archive):
    """Validate before writing anything: flat regular files, hashes, bounded size."""
    members = archive.getmembers()
    names = set()
    total = 0
    for member in members:
        if not member.isfile() or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_.-]*\.(html|js|css|wasm|pck|png|json)", member.name
        ):
            raise ValueError(f"Unsafe export member: {member.name}")
        if member.name in names:
            raise ValueError("Duplicate export member")
        names.add(member.name)
        total += member.size
    if total > MAX_BYTES or len(members) > 64 or not REQUIRED <= names:
        raise ValueError("Export is oversized or incomplete")
    manifest = json.load(archive.extractfile("release.json"))
    if manifest.get("game") != "drain-the-swamp" or not re.fullmatch(
        r"[a-f0-9]{40}", manifest.get("revision", "")
    ):
        raise ValueError("Invalid game provenance")
    if set(manifest["files"]) != names - {"release.json"}:
        raise ValueError("Manifest does not describe exactly these files")
    for name, expected in manifest["files"].items():
        if (
            hashlib.file_digest(archive.extractfile(name), "sha256").hexdigest()
            != expected
        ):
            raise ValueError(f"Export checksum mismatch: {name}")
    if not re.fullmatch(
        manifest["revision"][:12] + r"-[a-f0-9]{12}", manifest.get("release", "")
    ):
        raise ValueError("Invalid immutable release identifier")
    return manifest


def install(path):
    if os.geteuid() != 0:
        raise SystemExit("Run as root on the activities host")
    if not Path("/srv/sites").is_mount():
        raise SystemExit("The vault must be mounted")
    group = pwd.getpwnam("scryproof-activities").pw_gid
    with tarfile.open(path, "r:gz") as archive:
        manifest = validate(archive)
        release = BASE / "releases" / manifest["release"]
        if release.exists():
            raise SystemExit(f"Release already installed: {release}")
        stage = Path(tempfile.mkdtemp(prefix=".stage-", dir=BASE / "releases"))
        try:
            game = stage / "drain-the-swamp"
            game.mkdir()
            os.chown(stage, 0, group)
            os.chmod(stage, 0o750)
            os.chown(game, 0, group)
            os.chmod(game, 0o750)
            for member in archive.getmembers():
                target = game / member.name
                with archive.extractfile(member) as src, target.open("xb") as out:
                    shutil.copyfileobj(src, out)
                os.chown(target, 0, group)
                os.chmod(target, 0o640)
            stage.rename(release)
        except BaseException:
            shutil.rmtree(stage, ignore_errors=True)
            raise
    old = BASE / "current"
    previous = old.resolve() if old.exists() else None
    link = BASE / ".next"
    link.unlink(missing_ok=True)
    link.symlink_to(release)
    link.replace(old)
    print(
        json.dumps(
            {"release": str(release), "previous": str(previous) if previous else None}
        )
    )


if __name__ == "__main__":
    import sys

    install(sys.argv[1])

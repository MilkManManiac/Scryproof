#!/usr/bin/env python3
"""Export a committed Drain The Swamp checkout without modifying it.

GODOT=/path/to/godot GODOT_WEB_TEMPLATE=/path/to/web_nothreads_release.zip \
  python3 scripts/activities/build-drain-the-swamp.py ~/CodeProjects/DrainTheSwamp
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument(
    "--out", type=Path, default=ROOT / "build/activities/drain-the-swamp"
)
args = parser.parse_args()
source = args.source.expanduser().resolve()
godot = os.environ.get("GODOT", "godot")
template = Path(os.environ["GODOT_WEB_TEMPLATE"]).resolve()
version = subprocess.check_output([godot, "--version"], text=True).strip()
if not version.startswith("4.6.3.stable."):
    raise SystemExit(f"Expected Godot 4.6.3 stable; found {version}")
if subprocess.check_output(
    ["git", "-C", str(source), "status", "--porcelain"], text=True
).strip():
    raise SystemExit(
        "Game checkout has uncommitted changes. Commit or choose a clean checkout first."
    )
revision = subprocess.check_output(
    ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
).strip()
with tempfile.TemporaryDirectory(prefix="scryproof-game-build-") as tmp:
    work = Path(tmp) / "game"
    shutil.copytree(
        source,
        work,
        ignore=shutil.ignore_patterns(
            ".git", ".godot", "build", "export", "_screenshots", ".claude"
        ),
    )
    preset = work / "export_presets.cfg"
    config = preset.read_text().split("[preset.1]")[0]
    config = config.replace(
        'custom_template/release=""', f'custom_template/release="{template}"'
    )
    config = config.replace(
        "progressive_web_app/enabled=true", "progressive_web_app/enabled=false"
    )
    config = config.replace(
        "[preset.0.options]", "[preset.0.options]\n\nvariant/thread_support=false"
    )
    preset.write_text(config)
    # Both imports and export happen on the workstation, never on the live box.
    for step, command in enumerate(
        [
            ["--headless", "--import"],
            ["--headless", "--import"],
            ["--headless", "--export-release", "Web", "build/web/index.html"],
        ]
    ):
        (work / "build/web").mkdir(parents=True, exist_ok=True)
        env = {
            **os.environ,
            "XDG_CONFIG_HOME": str(Path(tmp) / "config"),
            "XDG_DATA_HOME": str(Path(tmp) / "data"),
            "XDG_CACHE_HOME": str(Path(tmp) / "cache"),
        }
        result = subprocess.run(
            [godot, "--path", str(work), *command],
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )
        log = result.stdout + result.stderr
        if result.returncode or (
            step > 0 and ("SCRIPT ERROR" in log or "Parse Error" in log)
        ):
            Path("/tmp/scryproof-game-build.log").write_text(log)
            raise SystemExit(
                "Game build failed; details in /tmp/scryproof-game-build.log"
            )
    output = work / "build/web"
    # Exported inline code is moved to files so game CSP needs no unsafe-inline scripts.
    html = (output / "index.html").read_text()
    styles = re.findall(r"<style>(.*?)</style>", html, flags=re.S)
    (output / "activity.css").write_text("\n".join(styles))
    html = re.sub(
        r"<style>.*?</style>",
        '<link rel="stylesheet" href="activity.css">',
        html,
        flags=re.S,
    )
    scripts = re.findall(r"<script>(.*?)</script>", html, flags=re.S)
    if len(scripts) != 1:
        raise SystemExit(
            "Unexpected Godot HTML shell: expected one inline startup script"
        )
    startup = scripts[0]
    if "engine.startGame" not in startup:
        raise SystemExit("Godot startup hook missing")
    failure_hook = "function displayFailureNotice(err) {"
    if failure_hook not in startup:
        raise SystemExit("Godot failure hook missing")
    startup = startup.replace(failure_hook, failure_hook + "\n        report('error');")
    startup = startup.replace(
        "setStatusMode('hidden');", "setStatusMode('hidden'); report('ready');"
    )
    startup = startup.replace(
        "'onProgress': function",
        "'onExit': function () { report('ended'); },\n            'onProgress': function",
    )
    bridge = """function report(status) {
  if (window.parent !== window) window.parent.postMessage({type: 'scryproof-activity', game: 'drain-the-swamp', status}, '*');
}
window.addEventListener('error', () => report('error'));
window.addEventListener('unhandledrejection', () => report('error'));
"""
    (output / "activity.js").write_text(bridge + startup)
    html = re.sub(
        r"<script>.*?</script>", '<script src="activity.js"></script>', html, flags=re.S
    )
    (output / "index.html").write_text(html)
    # Pin every asset to an immutable release. The stable page URL preserves
    # Godot saves, while overlapping launches/deploys cannot mix engine and pack.
    digest = hashlib.sha256(
        b"".join(
            p.name.encode() + p.read_bytes()
            for p in sorted(output.iterdir())
            if p.is_file()
        )
    ).hexdigest()[:12]
    release_id = f"{revision[:12]}-{digest}"
    prefix = f"/releases/{release_id}/drain-the-swamp/"
    html = re.sub(r'(src|href)="([^"]+)"', lambda m: f'{m[1]}="{prefix}{m[2]}"', html)
    (output / "index.html").write_text(html)
    startup = (
        (output / "activity.js")
        .read_text()
        .replace('"executable":"index"', f'"executable":"{prefix}index"')
    )
    (output / "activity.js").write_text(startup)
    files = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in output.iterdir()
        if p.is_file()
    }
    (output / "release.json").write_text(
        json.dumps(
            {
                "game": "drain-the-swamp",
                "revision": revision,
                "release": release_id,
                "godot": version,
                "files": files,
            },
            indent=2,
        )
        + "\n"
    )
    if args.out.exists():
        shutil.rmtree(args.out)
    shutil.copytree(output, args.out)
print(f"Exported Drain The Swamp {revision} to {args.out}")

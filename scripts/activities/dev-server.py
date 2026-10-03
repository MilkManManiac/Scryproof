#!/usr/bin/env python3
"""Serve exported games on a separate loopback origin, with production-like policy."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

GAME_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors http://localhost:5179 app://scryproof"


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        manifest = Path(self.directory) / "drain-the-swamp/release.json"
        if manifest.exists():
            release = json.loads(manifest.read_text())["release"]
            prefix = f"/releases/{release}/drain-the-swamp/"
            parsed = urlsplit(path).path
            if parsed.startswith(prefix):
                path = "/drain-the-swamp/" + parsed[len(prefix) :]
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Content-Security-Policy", GAME_CSP)
        self.send_header(
            "Permissions-Policy",
            "camera=(), microphone=(), display-capture=(), geolocation=(), payment=()",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", nargs="?", default="build/activities")
args = parser.parse_args()
ThreadingHTTPServer(
    ("127.0.0.1", 5180), partial(Handler, directory=args.directory)
).serve_forever()

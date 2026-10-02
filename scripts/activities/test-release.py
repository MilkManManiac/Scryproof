import importlib.util
import io
import json
import tarfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "release", Path(__file__).with_name("install-release.py")
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ExportValidation(unittest.TestCase):
    def check(self, entries):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as out:
            for name, body, kind in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.size = len(body)
                if kind == tarfile.SYMTYPE:
                    member.linkname = "/srv/sites/scryproof/shared/.env"
                    member.size = 0
                out.addfile(member, io.BytesIO(body) if member.isfile() else None)
        stream.seek(0)
        with tarfile.open(fileobj=stream) as archive:
            return release.validate(archive)

    def entries(self):
        game = Path("build/activities/drain-the-swamp")
        return [
            (p.name, p.read_bytes(), tarfile.REGTYPE) for p in sorted(game.iterdir())
        ]

    def test_real_export(self):
        self.assertEqual(self.check(self.entries())["game"], "drain-the-swamp")

    def test_traversal_and_symlink(self):
        for name, kind in [("../.env", tarfile.REGTYPE), ("game.js", tarfile.SYMTYPE)]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.check(self.entries() + [(name, b"secret", kind)])

    def test_duplicate(self):
        entries = self.entries()
        with self.assertRaises(ValueError):
            self.check(entries + [entries[0]])

    def test_tampered_pack(self):
        entries = [
            (n, b + b"tampered" if n == "index.pck" else b, k)
            for n, b, k in self.entries()
        ]
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.check(entries)

    def test_incomplete(self):
        with self.assertRaises(ValueError):
            self.check([e for e in self.entries() if e[0] != "index.wasm"])

    def test_size_limit(self):
        original = release.MAX_BYTES
        release.MAX_BYTES = 1024
        try:
            with self.assertRaises(ValueError):
                self.check(self.entries())
        finally:
            release.MAX_BYTES = original


if __name__ == "__main__":
    unittest.main()

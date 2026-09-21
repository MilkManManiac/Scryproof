import re

from pyinfra.operations import apt, server

from bonesinfra.config.paths import PYTHON_ROOT, SCRIPTS_DIR
from bonesinfra.services.languages.base import LanguageRuntime

PYTHON_RELEASES = {
    "3.14": (
        "3.14.7",
        "3b48dac8fb59f62eaa67ac83c1eb12bda1b7a08406dd286e252c11a66be27f81",
    ),
}
PYTHON_BUILD_PACKAGES = [
    "build-essential",
    "ca-certificates",
    "curl",
    "libbz2-dev",
    "libexpat1-dev",
    "libffi-dev",
    "libgdbm-compat-dev",
    "libgdbm-dev",
    "liblzma-dev",
    "libncurses-dev",
    "libpq-dev",
    "libreadline-dev",
    "libsqlite3-dev",
    "libssl-dev",
    "libzstd-dev",
    "pkg-config",
    "uuid-dev",
    "zlib1g-dev",
]


class PythonRuntime(LanguageRuntime):
    config_key = "python_version"
    default_version = "3.14"
    version_pattern = re.compile(r"^[0-9]+\.[0-9]+$")

    def install_version(self, _ctx) -> str:
        release, checksum = self._release()
        apt.packages(
            name="Install CPython build dependencies",
            packages=PYTHON_BUILD_PACKAGES,
            present=True,
            update=True,
            _sudo=True,
        )
        server.script(
            name=f"Install Python {release}",
            src=str(SCRIPTS_DIR / "install-python.sh"),
            args=(release, checksum, PYTHON_ROOT),
            _sudo=True,
        )
        return f"{PYTHON_ROOT}/{release}/bin/python{self.version}"

    def _release(self) -> tuple[str, str]:
        try:
            return PYTHON_RELEASES[self.version]
        except KeyError as error:
            supported = ", ".join(PYTHON_RELEASES)
            raise ValueError(
                f"Unsupported python_version: {self.version!r}; supported versions: {supported}"
            ) from error


PYTHON = PythonRuntime()

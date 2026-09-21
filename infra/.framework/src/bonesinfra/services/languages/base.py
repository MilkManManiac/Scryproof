import re
from abc import ABC, abstractmethod


class LanguageRuntime(ABC):
    config_key: str
    default_version: str
    version_pattern: re.Pattern[str]

    def __init__(self) -> None:
        self.version = ""
        self.executable = ""

    def install(self, ctx) -> str:
        version = str(ctx.runtime.data.get(self.config_key, self.default_version))
        if not self.version_pattern.fullmatch(version):
            raise ValueError(f"{self.config_key} has an invalid version: {version!r}")
        self.version = version
        self.executable = self.install_version(ctx)
        return self.executable

    @abstractmethod
    def install_version(self, ctx) -> str:
        raise NotImplementedError

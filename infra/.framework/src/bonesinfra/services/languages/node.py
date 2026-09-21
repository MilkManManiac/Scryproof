import re

from pyinfra.operations import server

from bonesinfra.config.paths import SCRIPTS_DIR
from bonesinfra.services.languages.base import LanguageRuntime

NODE_ROOT = "/opt/bonesdeploy/node"


class NodeRuntime(LanguageRuntime):
    config_key = "node_version"
    default_version = "24.19.0"
    version_pattern = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")

    def install_version(self, _ctx) -> str:
        server.script(
            name=f"Install Node.js v{self.version}",
            src=str(SCRIPTS_DIR / "install-node.sh"),
            args=(self.version,),
            _sudo=True,
        )
        return f"{NODE_ROOT}/v{self.version}/bin/node"


NODE = NodeRuntime()

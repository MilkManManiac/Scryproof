from pyinfra.operations import apt, server, systemd

from bonesinfra.config.paths import SCRIPTS_DIR
from bonesinfra.services.runtime.base import RuntimeService, credentials_for


class MySQLService(RuntimeService):
    apt_package = "mysql-server"
    implementation = "mysql"

    def provision(self, ctx):
        apt.packages(
            name=f"Install {self.implementation}",
            packages=[self.apt_package],
            present=True,
            update=True,
            cache_time=3600,
            _sudo=True,
        )
        project = self._identifier(ctx.app.project_name)
        creds = credentials_for(ctx, self.implementation)
        server.script_template(
            name=f"Configure {self.implementation} for project",
            src=str(SCRIPTS_DIR / "configure-mysql-project.sh.j2"),
            user=f"{project}_mysql",
            project=project,
            database=creds.get("database", project),
            username=creds.get("username", f"{project}_mysql"),
            password=creds["password"],
            _sudo=True,
        )
        systemd.service(
            name=f"Enable {self.implementation}",
            service="mysql",
            enabled=True,
            running=True,
            restarted=True,
            _sudo=True,
        )


MYSQL_SERVICE = MySQLService()

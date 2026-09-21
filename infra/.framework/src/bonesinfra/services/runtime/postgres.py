from pyinfra.operations import apt, server, systemd

from bonesinfra.config.paths import SCRIPTS_DIR
from bonesinfra.services.runtime.base import RuntimeService, credentials_for


class PostgresService(RuntimeService):
    def provision(self, ctx):
        apt.packages(
            name="Install PostgreSQL",
            packages=["postgresql"],
            present=True,
            update=True,
            cache_time=3600,
            _sudo=True,
        )
        project = self._identifier(ctx.app.project_name)
        creds = credentials_for(ctx, "postgres")
        server.script_template(
            name="Configure PostgreSQL for project",
            src=str(SCRIPTS_DIR / "configure-postgres-project.sh.j2"),
            project=project,
            database=creds.get("database", project),
            username=creds.get("username", f"{project}_postgres"),
            password=creds["password"],
            _sudo=True,
        )
        systemd.service(
            name="Enable PostgreSQL",
            service="postgresql",
            enabled=True,
            running=True,
            restarted=True,
            _sudo=True,
        )


POSTGRES_SERVICE = PostgresService()

from pyinfra.operations import apt, server, systemd

from bonesinfra.config.paths import MONGODB_ADMIN_ENV, MONGODB_CONFIG, SCRIPTS_DIR
from bonesinfra.services.runtime.base import RuntimeService, credentials_for


class MongoDBService(RuntimeService):
    def provision(self, ctx):
        server.script(
            name="Install MongoDB package source",
            src=str(SCRIPTS_DIR / "install-mongodb-repo.sh"),
            _sudo=True,
        )
        apt.packages(
            name="Install MongoDB",
            packages=["mongodb-org"],
            present=True,
            update=True,
            _sudo=True,
        )
        project = self._identifier(ctx.app.project_name)
        creds = credentials_for(ctx, "mongodb")
        server.shell(
            name="Configure MongoDB for project",
            commands=[
                f"sed -ri 's/^[[:space:]]*bindIp:.*/  bindIp: 127.0.0.1/' {MONGODB_CONFIG}",
                (
                    f"grep -q '^security:' {MONGODB_CONFIG} || "
                    f"printf '\\nsecurity:\\n  authorization: enabled\\n' >> {MONGODB_CONFIG}"
                ),
            ],
            _sudo=True,
        )
        systemd.service(
            name="Enable MongoDB",
            service="mongod",
            enabled=True,
            running=True,
            restarted=True,
            _sudo=True,
        )
        server.script_template(
            name="Create least-privilege MongoDB project user",
            src=str(SCRIPTS_DIR / "create-mongodb-project-user.sh.j2"),
            admin_file=MONGODB_ADMIN_ENV,
            project=project,
            user=f"{project}_mongodb",
            database=creds.get("database", project),
            username=creds.get("username", f"{project}_mongodb"),
            password=creds["password"],
            _sudo=True,
        )


MONGODB_SERVICE = MongoDBService()

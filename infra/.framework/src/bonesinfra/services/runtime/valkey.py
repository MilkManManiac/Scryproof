from pyinfra.operations import apt, server, systemd

from bonesinfra.config.paths import BONESINFRA_SERVICES_ROOT, ETC_SYSTEMD_SYSTEM, SCRIPTS_DIR
from bonesinfra.services.runtime.base import RuntimeService, credentials_for


class ValKeyService(RuntimeService):
    service = "valkey"
    unit = "valkey-server"
    package_user = "valkey"
    default_port = 16379

    def manifest_artifacts(self, ctx) -> list[tuple[str, str, str, str]]:
        project = self._identifier(ctx.app.project_name)
        service_name = f"{project}-{self.service}"
        return [
            (f"{self.service} configuration", f"{BONESINFRA_SERVICES_ROOT}/{service_name}.conf", "file", "service"),
            (f"{self.service} data directory", f"/var/lib/{self.service}/{project}", "directory", "service"),
            (f"{self.service} systemd service", ctx.paths.systemd_service(self.service), "file", "service"),
        ]

    def manifest_services(self, ctx) -> list[tuple[str, str, str]]:
        project = self._identifier(ctx.app.project_name)
        return [(f"{self.service} service", f"{project}-{self.service}.service", "service")]

    def provision(self, ctx):
        apt.packages(
            name=f"Install {self.unit}",
            packages=[self.unit],
            present=True,
            update=True,
            cache_time=3600,
            _sudo=True,
        )
        project = self._identifier(ctx.app.project_name)
        creds = credentials_for(ctx, self.service)
        service_name = f"{project}-{self.service}"
        server.script_template(
            name=f"Configure isolated {self.service} instance for project",
            src=str(SCRIPTS_DIR / "setup-key-value-store.sh.j2"),
            config=f"{BONESINFRA_SERVICES_ROOT}/{service_name}.conf",
            data=f"/var/lib/{self.service}/{project}",
            password=creds["password"],
            port=str(creds.get("port", "6379")),
            unit=self.unit,
            runtime_group=ctx.runtime.runtime_group,
            binary=f"/usr/bin/{self.package_user}-server",
            service=self.service,
            project=project,
            package_user=self.package_user,
            unit_path=f"{ETC_SYSTEMD_SYSTEM}/{service_name}.service",
            _sudo=True,
        )
        systemd.service(
            name=f"Enable isolated {self.service} instance",
            service=service_name,
            enabled=True,
            running=True,
            restarted=True,
            daemon_reload=True,
            _sudo=True,
        )


VALKEY_SERVICE = ValKeyService()

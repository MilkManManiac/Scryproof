from __future__ import annotations

# The parser import is intentionally lazy to keep domain dataclasses importable.
# ruff: noqa: PLC0415
from dataclasses import dataclass, field
from typing import Any

from bonesinfra.config.paths import DeploymentPaths

DEPLOY_USER = "git"


@dataclass
class DeployContext:
    server: ServerContext
    app: AppConfig
    runtime: RuntimeConfig
    services: ServicesConfig
    service_credentials: dict[str, dict[str, Any]] = field(default_factory=dict)
    template: str = "custom"

    @classmethod
    def from_request(cls, body):
        from bonesinfra.config.request import parse_site

        return parse_site(body)

    @property
    def paths(self) -> DeploymentPaths:
        try:
            return self._paths
        except AttributeError:
            pass
        self._paths = DeploymentPaths.new(
            self.app.project_name,
            self.app.repo_path,
            self.app.project_root,
            self.runtime.web_root,
        )
        return self._paths

    @property
    def paths_dict(self) -> dict[str, Any]:
        return self.paths.__dict__


def template_data(ctx: DeployContext, *, paths: dict[str, Any] | None = None, **extra: Any) -> dict[str, Any]:
    """Build flat template context from DeployContext for Jinja2 template rendering."""
    if paths is None:
        paths = ctx.paths_dict

    data: dict[str, Any] = {
        "project_name": ctx.app.project_name,
        "project_root": paths["project_root"],
        "web_root": ctx.runtime.web_root,
        "repo_path": paths["repo"],
        "branch": ctx.app.deploy.branch,
        "deploy_user": DEPLOY_USER,
        "runtime_user": ctx.runtime.runtime_user,
        "runtime_group": ctx.runtime.runtime_group,
        "runtime_backend": ctx.runtime.backend,
        "project_root_parent": paths["project_root_parent"],
        "ssh_port": int(ctx.server.port),
        "paths": paths,
        "ssl_domain": ctx.app.dns.domain,
        "ssl_email": ctx.app.dns.email,
        "preview_domain": ctx.app.dns.preview_domain,
    }

    for key, value in ctx.runtime.data.items():
        if key not in data:
            data[key] = value

    data.update(extra)
    return data


@dataclass
class AppConfig:
    project_name: str
    repo_path: str
    project_root: str
    dns: DnsConfig
    deploy: DeployConfig


@dataclass
class ServerContext:
    ssh_user: str
    host: str
    port: str

    @classmethod
    def from_request(cls, body):
        from bonesinfra.config.request import parse_request

        return parse_request(body, server_only=True)


@dataclass
class DnsConfig:
    domain: str
    preview_domain: str
    email: str
    ssl_enabled: bool


@dataclass
class DeployConfig:
    branch: str


@dataclass
class RuntimeConfig:
    backend: str
    web_root: str
    runtime_user: str
    runtime_group: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ServicesConfig:
    services: tuple[str, ...] = ()

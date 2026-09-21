"""Typed provisioning request parsing at the Python process boundary."""

from collections.abc import Mapping
from typing import Any

# ValueError is part of the public boundary contract for malformed requests.
# ruff: noqa: TRY004
from bonesinfra.config.context import (
    AppConfig,
    DeployConfig,
    DeployContext,
    DnsConfig,
    RuntimeConfig,
    ServerContext,
    ServicesConfig,
)
from bonesinfra.config.paths import DEFAULT_PROJECT_ROOT_PARENT, DEFAULT_REPO_PARENT, DEFAULT_WEB_ROOT

SUPPORTED_DATABASE_SERVICES = frozenset({"postgres", "mariadb", "mysql", "mongodb", "valkey", "redis"})
_RESERVED_PROJECT_NAMES = {
    "basic",
    "default",
    "emergency",
    "final",
    "graphical",
    "halt",
    "initrd",
    "local-fs",
    "multi-user",
    "network",
    "network-online",
    "poweroff",
    "reboot",
    "remote-fs",
    "rescue",
    "shutdown",
    "sockets",
    "swap",
    "sysinit",
    "system-update",
    "timers",
    "umount",
}
_FRAMEWORKS = {"custom", "django", "laravel", "next", "nuxt", "rails", "sveltekit", "vue"}


def reject_unknown(mapping: Mapping[str, Any], allowed: set[str], where: str) -> None:
    for key in mapping:
        if key not in allowed:
            raise ValueError(f"unknown {where} field '{key}'")


def parse_server_connection(server: Mapping[str, Any]) -> ServerContext:
    reject_unknown(server, {"host", "ssh_user", "port"}, "server")
    host = _string(server.get("host", ""), "server.host")
    ssh_user = _string(server.get("ssh_user", ""), "server.ssh_user") or "root"
    port = _string(server.get("port", "22"), "server.port")
    if not port.isdigit():
        raise ValueError("server.port must contain only digits")
    return ServerContext(host=host, ssh_user=ssh_user, port=port)


def parse_site(body: Mapping[str, Any]) -> DeployContext:  # noqa: C901
    reject_unknown(body, {"server", "site", "services"}, "request")
    server = body.get("server")
    site = body.get("site")
    if not isinstance(server, Mapping):
        raise ValueError("server is required")
    if not isinstance(site, Mapping):
        raise ValueError("site is required")
    reject_unknown(
        site,
        {
            "project_name",
            "domain",
            "preview_domain",
            "email",
            "ssl_enabled",
            "template",
            "backend",
            "web_root",
            "branch",
            "node_version",
            "services",
            "extras",
        },
        "site",
    )
    name = _string(site.get("project_name", ""), "site.project_name")
    _validate_project_name(name)
    backend = site.get("backend", "native")
    if backend not in {"native", "docker"}:
        raise ValueError("RUNTIME_BACKEND must be 'native' or 'docker'")
    template = _string(site.get("template", "custom"), "site.template")
    if template not in _FRAMEWORKS:
        raise ValueError(f"unknown framework infrastructure: {template}")
    ssl_enabled = site.get("ssl_enabled", False)
    if isinstance(ssl_enabled, str) and ssl_enabled.lower() in {"true", "false"}:
        ssl_enabled = ssl_enabled.lower() == "true"
    if not isinstance(ssl_enabled, bool):
        raise ValueError("site.ssl_enabled must be a boolean")
    extras = site.get("extras", {})
    if not isinstance(extras, Mapping):
        raise ValueError("site.extras must be an object")
    for key, value in extras.items():
        if isinstance(value, (list, dict)):
            raise ValueError(f"site.extras.{key} must be a scalar")
    services_value = site.get("services", [])
    if not isinstance(services_value, list) or not all(isinstance(name, str) for name in services_value):
        raise TypeError("SERVICES must be a list")
    services = _database_services(services_value)
    credentials = _credentials(body.get("services", {}))
    return DeployContext(
        server=parse_server_connection(server),
        app=AppConfig(
            name,
            f"{DEFAULT_REPO_PARENT}/{name}.git",
            f"{DEFAULT_PROJECT_ROOT_PARENT}/{name}",
            DnsConfig(
                _string(site.get("domain", ""), "site.domain"),
                _string(site.get("preview_domain", ""), "site.preview_domain"),
                _string(site.get("email", ""), "site.email"),
                ssl_enabled,
            ),
            DeployConfig(_string(site.get("branch", "main"), "site.branch")),
        ),
        runtime=RuntimeConfig(
            backend, _string(site.get("web_root", ""), "site.web_root") or DEFAULT_WEB_ROOT, name, name, dict(extras)
        ),
        services=ServicesConfig(services),
        service_credentials=credentials,
        template=template,
    )


def parse_request(body: Mapping[str, Any], *, server_only: bool = False) -> DeployContext | ServerContext:
    reject_unknown(body, {"server", "site", "services"}, "request")
    if server_only:
        if "site" in body:
            raise ValueError("unknown request field 'site'")
        if "services" in body:
            raise ValueError("unknown request field 'services'")
        server = body.get("server")
        if not isinstance(server, Mapping):
            raise ValueError("server is required")
        return parse_server_connection(server)
    return parse_site(body)


def _credentials(value: Any) -> dict[str, dict[str, Any]]:  # noqa: C901
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise ValueError("services must be an object")
    result = {}
    for name, creds in value.items():
        if name not in SUPPORTED_DATABASE_SERVICES:
            raise ValueError(f"unsupported database service credentials: {name}")
        if creds is None:
            continue
        if not isinstance(creds, Mapping):
            raise ValueError(f"services.{name} must be an object or null")
        allowed = {"password", "username", "database", "port"}
        reject_unknown(creds, allowed, f"services.{name}")
        result[name] = dict(creds)
        password = result[name].get("password")
        if password is not None and (
            not isinstance(password, str)
            or not password
            or any(c in password for c in "'\\")
            or not all(c.isascii() and c.isprintable() for c in password)
        ):
            raise ValueError(f"services.{name}.password must be printable ASCII without quotes or backslashes")
        port = result[name].get("port")
        if port is not None and (not isinstance(port, str) or not port.isdigit()):
            raise ValueError(f"services.{name}.port must contain only digits")
    return result


def _database_services(values: list[str]) -> tuple[str, ...]:
    unsupported = set(values) - SUPPORTED_DATABASE_SERVICES
    if unsupported:
        raise ValueError(f"unsupported database services: {', '.join(sorted(unsupported))}")
    if "mariadb" in values and "mysql" in values:
        raise ValueError("mariadb and mysql cannot be provisioned together")
    if len(set(values)) != len(values):
        raise ValueError("database services must not contain duplicates")
    return tuple(values)


def _validate_project_name(value: str) -> None:
    if (
        value
        and all(char.isascii() and (char.islower() or char.isdigit() or char == "-") for char in value)
        and value not in _RESERVED_PROJECT_NAMES
    ):
        return
    raise ValueError(f"Invalid project name: {value}")


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    return value

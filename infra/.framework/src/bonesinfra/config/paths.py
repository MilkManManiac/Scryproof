from dataclasses import dataclass
from pathlib import Path

ASSETS_DIR = Path(__file__).parent.parent / "assets"
SCRIPTS_DIR = ASSETS_DIR / "scripts"

DEFAULT_REPO_PARENT = "/home/git"
IMAGE_STORE_GRAPH_ROOT = "/var/lib/bonesdeploy/image-store"
IMAGE_STORE_RUN_ROOT = "/run/bonesdeploy/image-store"
IMAGE_STORE_STORAGE_CONF = "/etc/bonesdeploy/image-store-storage.conf"
BUILD_CACHE_NAME = "cache"
BUILD_USER_HOME_ROOT = "/var/lib/bonesdeploy/users"
BUILD_SYSTEMD_STAGING_ROOT = "/run/bonesdeploy"
BONESDEPLOY_LOG_ROOT = "/var/log/bonesdeploy"
PATCHES_ROOT = "/var/lib/bonesdeploy/patches"
RUNTIME_IMAGES_ROOT = "/var/lib/bonesdeploy/runtime-images"
BONESINFRA_SERVICES_ROOT = "/etc/bonesinfra/services"
MONGODB_CONFIG = "/etc/mongod.conf"
MONGODB_ADMIN_ENV = "/root/.config/bonesinfra/mongodb-admin.env"
DEFAULT_PROJECT_ROOT_PARENT = "/srv/sites"
DEFAULT_CONF_ROOT_PARENT = "/srv/conf"
DEFAULT_WEB_ROOT = "public"
PYTHON_ROOT = "/opt/bonesdeploy/python"

ETC_NGINX_SITES_AVAILABLE = "/etc/nginx/sites-available"
ETC_NGINX_SITES_ENABLED = "/etc/nginx/sites-enabled"
ETC_SYSTEMD_SYSTEM = "/etc/systemd/system"
ETC_APPARMOR_D = "/etc/apparmor.d"
ETC_SSL_CERTS = "/etc/ssl/certs"
ETC_SSL_PRIVATE = "/etc/ssl/private"
ETC_SUDOERS_D = "/etc/sudoers.d"

RUNTIME_SOCKET_PARENT = "/run"
NGINX_CONF = "nginx.conf"
INDEX_HTML = "index.html"
GIT_HEAD = "HEAD"
RELEASES_DIR = "releases"
SHARED_DIR = "shared"
CURRENT_LINK = "current"
PLACEHOLDER_RELEASE_NAME = "19700101_000000"

NGINX_SOCKET = "nginx.sock"
NGINX_PID = "nginx.pid"
PHP_FPM_SOCKET = "php-fpm.sock"
DEFAULT_NGINX_SITE = "default"
BONESDEPLOY_NGINX_DEFAULT_DENY_SITE = "00-bonesdeploy-default-deny.conf"
BONESDEPLOY_NGINX_DEFAULT_DENY_CERT = "bonesdeploy-default-deny.crt"
BONESDEPLOY_NGINX_DEFAULT_DENY_KEY = "bonesdeploy-default-deny.key"

BONESREMOTE_CONFIG_DIR = "/root/.config/bonesremote"
BONESREMOTE_SITES_DIR = "sites"
BONESREMOTE_SITE_ROOT = f"{BONESREMOTE_CONFIG_DIR}/{BONESREMOTE_SITES_DIR}"

BONESREMOTE_BINARY = "bonesremote"

USR_LOCAL_BIN = "/usr/local/bin"
APPARMOR_ENABLED_PARAM = "/sys/module/apparmor/parameters/enabled"
APPARMOR_PROFILES = "/sys/kernel/security/apparmor/profiles"


def _parent_or_default(path: str, fallback: str) -> str:
    parent = str(Path(path).parent)
    return fallback if parent == "." else parent


@dataclass
class DeploymentPaths:
    project_name: str
    repo: str
    repo_parent: str
    repo_head: str
    site_nginx_config: str
    site_root: str
    conf_root: str
    project_root: str
    project_root_parent: str
    releases: str
    shared: str
    shared_env: str
    current: str
    current_web_root: str
    placeholder_release: str
    placeholder_web_root: str
    placeholder_index: str
    nginx_site_available: str
    nginx_site_enabled: str
    nginx_default_deny_site_available: str
    nginx_default_deny_site_enabled: str
    nginx_default_deny_ssl_certificate: str
    nginx_default_deny_ssl_certificate_key: str
    nginx_default_site_enabled: str
    systemd_site_nginx_service: str
    systemd_site_nginx_requirement: str
    systemd_site_target: str
    systemd_site_target_requires: str
    nginx_apparmor_profile: str
    runtime_socket_dir: str
    runtime_nginx_dir: str
    runtime_nginx_socket: str
    runtime_nginx_pid: str
    runtime_php_fpm_socket: str
    site_log_dir: str
    acme_webroot: str
    sudoers_path: str
    usr_local_bin: str
    bonesremote_global_link: str
    apparmor_enabled_param: str
    apparmor_profiles: str

    @classmethod
    def new(
        cls,
        project_name: str,
        repo_path: str,
        project_root: str,
        web_root: str | None = None,
    ) -> "DeploymentPaths":
        if web_root is None:
            web_root = DEFAULT_WEB_ROOT

        placeholder_release = Path(project_root) / RELEASES_DIR / PLACEHOLDER_RELEASE_NAME
        current = Path(project_root) / CURRENT_LINK
        runtime_socket_dir = Path(RUNTIME_SOCKET_PARENT) / project_name
        runtime_nginx_dir = runtime_socket_dir / "nginx"
        conf_root = Path(DEFAULT_CONF_ROOT_PARENT) / project_name

        repo = Path(repo_path)
        return cls(
            project_name=project_name,
            repo=repo_path,
            repo_parent=_parent_or_default(repo_path, DEFAULT_REPO_PARENT),
            repo_head=str(repo / GIT_HEAD),
            site_nginx_config=str(conf_root / NGINX_CONF),
            site_root=str(Path(BONESREMOTE_SITE_ROOT) / project_name),
            conf_root=str(conf_root),
            project_root=project_root,
            project_root_parent=_parent_or_default(project_root, DEFAULT_PROJECT_ROOT_PARENT),
            releases=str(Path(project_root) / RELEASES_DIR),
            shared=str(Path(project_root) / SHARED_DIR),
            shared_env=str(Path(project_root) / SHARED_DIR / ".env"),
            current=str(current),
            current_web_root=str(current / web_root),
            placeholder_release=str(placeholder_release),
            placeholder_web_root=str(placeholder_release / web_root),
            placeholder_index=str(placeholder_release / web_root / INDEX_HTML),
            nginx_site_available=str(Path(ETC_NGINX_SITES_AVAILABLE) / f"{project_name}.conf"),
            nginx_site_enabled=str(Path(ETC_NGINX_SITES_ENABLED) / f"{project_name}.conf"),
            nginx_default_deny_site_available=str(
                Path(ETC_NGINX_SITES_AVAILABLE) / BONESDEPLOY_NGINX_DEFAULT_DENY_SITE
            ),
            nginx_default_deny_site_enabled=str(Path(ETC_NGINX_SITES_ENABLED) / BONESDEPLOY_NGINX_DEFAULT_DENY_SITE),
            nginx_default_deny_ssl_certificate=str(Path(ETC_SSL_CERTS) / BONESDEPLOY_NGINX_DEFAULT_DENY_CERT),
            nginx_default_deny_ssl_certificate_key=str(Path(ETC_SSL_PRIVATE) / BONESDEPLOY_NGINX_DEFAULT_DENY_KEY),
            nginx_default_site_enabled=str(Path(ETC_NGINX_SITES_ENABLED) / DEFAULT_NGINX_SITE),
            systemd_site_nginx_service=str(Path(ETC_SYSTEMD_SYSTEM) / f"{project_name}-nginx.service"),
            systemd_site_nginx_requirement=str(
                Path(ETC_SYSTEMD_SYSTEM) / f"{project_name}.target.requires/{project_name}-nginx.service"
            ),
            systemd_site_target=str(Path(ETC_SYSTEMD_SYSTEM) / f"{project_name}.target"),
            systemd_site_target_requires=str(Path(ETC_SYSTEMD_SYSTEM) / f"{project_name}.target.requires"),
            nginx_apparmor_profile=str(Path(ETC_APPARMOR_D) / f"bonesdeploy-{project_name}-nginx"),
            runtime_socket_dir=str(runtime_socket_dir),
            runtime_nginx_dir=str(runtime_nginx_dir),
            runtime_nginx_socket=str(runtime_nginx_dir / NGINX_SOCKET),
            runtime_nginx_pid=str(runtime_nginx_dir / NGINX_PID),
            runtime_php_fpm_socket=str(runtime_socket_dir / PHP_FPM_SOCKET),
            site_log_dir=f"/var/log/bonesdeploy/{project_name}",
            acme_webroot=f"/var/www/{project_name}",
            sudoers_path=str(Path(ETC_SUDOERS_D) / "bonesdeploy"),
            usr_local_bin=USR_LOCAL_BIN,
            bonesremote_global_link=str(Path(USR_LOCAL_BIN) / BONESREMOTE_BINARY),
            apparmor_enabled_param=APPARMOR_ENABLED_PARAM,
            apparmor_profiles=APPARMOR_PROFILES,
        )

    def systemd_service(self, name: str) -> str:
        return str(Path(ETC_SYSTEMD_SYSTEM) / f"{self.project_name}-{name}.service")

    def systemd_service_requirement(self, name: str) -> str:
        return str(Path(self.systemd_site_target_requires) / f"{self.project_name}-{name}.service")

    def apparmor_profile(self, name: str) -> str:
        return str(Path(ETC_APPARMOR_D) / f"bonesdeploy-{self.project_name}-{name}")

    def runtime_service_dir(self, name: str) -> str:
        return str(Path(self.runtime_socket_dir) / name)

    def runtime_service_socket(self, name: str) -> str:
        return str(Path(self.runtime_service_dir(name)) / f"{name}.sock")

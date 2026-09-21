from shlex import quote

from pyinfra.operations import server

PROFILE_CHECK_ATTEMPTS = 20
PROFILE_CHECK_INTERVAL_SECONDS = "0.1"


def run_as_runtime_user(ctx, name, command):
    user = ctx.runtime.runtime_user
    q_user = quote(user)
    home = f"$(getent passwd {q_user} | cut -d: -f6)"
    wrapped = f"HOME={home} XDG_CONFIG_HOME={home}/.config {command}"
    server.shell(name=name, commands=[wrapped], _sudo=True, _sudo_user=user)


def verify_profile_attached(service_name, profile_name, *, name=None):
    q_service = quote(service_name)
    q_profile = quote(profile_name)
    command = (
        f'attempt=0; while [ "$attempt" -lt {PROFILE_CHECK_ATTEMPTS} ]; do '
        f"if systemctl is-active --quiet {q_service}; then "
        f"pid=$(systemctl show -p MainPID --value {q_service}); "
        f'if [ "$pid" != "0" ] && [ -n "$pid" ] && '
        f"grep -qF -- {q_profile} /proc/$pid/attr/current; then exit 0; fi; "
        f"fi; attempt=$((attempt + 1)); sleep {PROFILE_CHECK_INTERVAL_SECONDS}; done; "
        f"systemctl status {q_service} --no-pager --full >&2; "
        f"journalctl -u {q_service} -n 50 --no-pager >&2; false"
    )
    server.shell(name=name or f"Verify {service_name} attached to {profile_name}", commands=[command], _sudo=True)

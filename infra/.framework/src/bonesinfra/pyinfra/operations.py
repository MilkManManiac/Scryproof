from pyinfra.operations import files


def mkdir(name, path, user="root", group="root", mode="0755"):
    files.directory(
        name=name,
        path=path,
        user=user,
        group=group,
        mode=mode,
        _sudo=True,
    )


def render(name, src, dest, user="root", group="root", mode="0644", **data):  # noqa: PLR0913
    files.template(
        name=name,
        src=str(src),
        dest=dest,
        user=user,
        group=group,
        mode=mode,
        **data,
        _sudo=True,
    )


def letsencrypt_cert_paths(domain: str) -> tuple[str, str]:
    live = f"/etc/letsencrypt/live/{domain}"
    return f"{live}/fullchain.pem", f"{live}/privkey.pem"

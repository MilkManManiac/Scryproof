from bonesinfra.config.context import template_data
from bonesinfra.pyinfra.operations import mkdir, render
from bonesinfra.services.linux import runtime_logs, runtime_paths, systemd, validation
from bonesinfra.services.linux.apparmor import app as apparmor
from bonesinfra.services.linux.nginx import site as nginx


def deploy_static(ctx, *, static_root, nginx_template, placeholder_template):
    paths = systemd.runtime_paths(ctx)
    runtime_paths.ensure_runtime_dirs(ctx)
    placeholder_root = f"{paths['placeholder_release']}/{static_root}"
    mkdir(
        name="Ensure static placeholder directory exists",
        path=placeholder_root,
        user="root",
        group=ctx.runtime.runtime_group,
        mode="0750",
    )
    render(
        "Seed static placeholder index page",
        placeholder_template,
        f"{placeholder_root}/index.html",
        user="root",
        group=ctx.runtime.runtime_group,
        mode="0640",
        **template_data(ctx, paths=paths),
    )
    nginx.render_static(ctx, paths=paths, template_src=nginx_template, root=static_root)


def deploy_server(  # noqa: PLR0913
    ctx,
    *,
    name,
    runtime_label,
    nginx_template,
    apparmor_template,
    install,
    seed_placeholder,
    validate,
    command,
    exec_paths,
    writable_paths,
    tcp=False,
    port=3000,
    apparmor_network="network unix stream,",
):
    paths = systemd.runtime_paths(ctx)
    runtime_binary = install(ctx)
    runtime_paths.ensure_runtime_dirs(ctx)
    runtime_logs.ensure(ctx)
    profile = apparmor.render_profile(
        ctx,
        paths=paths,
        runtime=name,
        template_src=apparmor_template,
        apparmor_exec_paths=exec_paths(ctx, paths, runtime_binary),
        apparmor_writable_paths=writable_paths(ctx, paths),
        apparmor_network=apparmor_network,
    )
    seed_placeholder(ctx, paths, runtime_binary)
    validate(ctx, paths, runtime_binary)
    systemd.render_app_service(
        ctx,
        paths=paths,
        name=name,
        runtime_label=runtime_label,
        runtime_exec=command(ctx, paths, runtime_binary),
        apparmor_profile_name=profile,
        runtime_write_paths=writable_paths(ctx, paths),
        runtime_address_families="AF_UNIX AF_INET" if tcp else "AF_UNIX",
    )
    if tcp:
        port = ctx.runtime.data.get("internal_port", port)
        nginx.render_proxy(ctx, paths=paths, template_src=nginx_template, port=port)
    else:
        nginx.render_proxy(
            ctx,
            paths=paths,
            template_src=nginx_template,
            socket_path=paths["runtime_socket_dir"] + f"/{name}/{name}.sock",
        )
    systemd.enable_and_start(ctx, name, apparmor_profile_name=profile)


def empty_validation(_ctx, _paths, _runtime_binary):
    pass


def empty_writable(_ctx, _paths):
    return []


def empty_exec(_ctx, _paths, runtime_binary):
    return [runtime_binary]


def validate_file(ctx, paths, _runtime_binary, path):
    validation.run_as_runtime_user(ctx, "Validate application output", f"test -e {paths['current']}/{path}")

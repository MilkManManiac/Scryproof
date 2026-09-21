import json
import sys
from collections.abc import Mapping

import typer

from bonesinfra.cli.commands.server import deploy_server_setup
from bonesinfra.cli.commands.server.helpers import deploy_helpers
from bonesinfra.cli.commands.site import deploy_site_setup
from bonesinfra.cli.commands.site.services import deploy_services
from bonesinfra.cli.commands.site.ssl import deploy_ssl
from bonesinfra.config.context import DeployContext, ServerContext
from bonesinfra.config.request import parse_request
from bonesinfra.manifest import inspect_for_runner, render
from bonesinfra.patches import apply_local, apply_remote
from bonesinfra.project import load_manifest, load_runtime
from bonesinfra.pyinfra.runner import run

app = typer.Typer()
runtime_app = typer.Typer()
server_app = typer.Typer()
site_app = typer.Typer()
ssl_app = typer.Typer()
helpers_app = typer.Typer()
services_app = typer.Typer()
manifest_app = typer.Typer()
patches_app = typer.Typer()
app.add_typer(runtime_app, name="runtime", help="Runtime operations")
app.add_typer(server_app, name="server", help="Server baseline operations")
app.add_typer(site_app, name="site", help="Site base provisioning operations")
app.add_typer(ssl_app, name="ssl", help="SSL operations")
app.add_typer(helpers_app, name="helpers", help="Helper tool operations")
app.add_typer(services_app, name="services", help="Service operations")
app.add_typer(manifest_app, name="manifest", help="Manifest inspection")
app.add_typer(patches_app, name="patches", help="Update patches")


def _validate_host(ctx: DeployContext | ServerContext) -> None:
    host = ctx.host if isinstance(ctx, ServerContext) else ctx.server.host
    if not host:
        print("Error: missing HOST", file=sys.stderr)
        sys.exit(3)


def _read_request(request_stdin: bool, *, server_only: bool = False) -> DeployContext | ServerContext:
    if not request_stdin:
        print("Error: --request-stdin is required", file=sys.stderr)
        sys.exit(3)
    try:
        body = json.loads(sys.stdin.read())
        if not isinstance(body, Mapping):
            raise TypeError("request must be a JSON object")  # noqa: TRY301
        return parse_request(body, server_only=server_only)
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(3)


@runtime_app.command("apply")
def runtime_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
):
    ctx = _read_request(request_stdin)
    _validate_host(ctx)
    project_runtime = load_runtime(ctx)
    run(ctx=ctx, deploy=project_runtime.deploy)


@server_app.command("apply")
def server_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
    bonesremote_version: str = typer.Option(..., "--bonesremote-version", help="Release version to install"),
):
    ctx = _read_request(request_stdin, server_only=True)
    if not ctx.host:
        print("Error: missing HOST", file=sys.stderr)
        sys.exit(3)
    run(
        ctx=ctx,
        deploy=lambda server_ctx: deploy_server_setup(server_ctx, bonesremote_version),
    )


@site_app.command("apply")
def site_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
):
    ctx = _read_request(request_stdin)
    _validate_host(ctx)
    run(ctx=ctx, deploy=deploy_site_setup)


@ssl_app.command("apply")
def ssl_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
):
    ctx = _read_request(request_stdin)
    if not ctx.app.dns.domain or not ctx.app.dns.email:
        print("Error: DOMAIN and EMAIL are required", file=sys.stderr)
        sys.exit(3)
    _validate_host(ctx)
    run(ctx=ctx, deploy=deploy_ssl)


@helpers_app.command("apply")
def helpers_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
):
    ctx = _read_request(request_stdin)
    _validate_host(ctx)
    run(ctx=ctx, deploy=deploy_helpers)


@services_app.command("apply")
def services_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
):
    ctx = _read_request(request_stdin)
    _validate_host(ctx)
    for name in ctx.services.services:
        creds = ctx.service_credentials.get(name)
        if not creds or not creds.get("password"):
            print(f"Error: credentials for {name} are required; use bonesdeploy secrets edit", file=sys.stderr)
            sys.exit(3)
    run(ctx=ctx, deploy=deploy_services)


@manifest_app.command("show")
def manifest_show_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
    output_format: str = typer.Option("text", "--format", help="Output format: text or json"),
):
    if output_format not in {"text", "json"}:
        raise typer.BadParameter("must be text or json", param_hint="--format")
    ctx = _read_request(request_stdin)
    _validate_host(ctx)
    project_manifest = load_manifest(ctx)
    data = run(ctx=ctx, deploy=lambda current_ctx: inspect_for_runner(current_ctx, project_manifest), quiet=True)
    if not isinstance(data, dict):
        raise TypeError("manifest inspection returned no report")
    print(render(data, output_format))


@patches_app.command("apply")
def patches_apply_cmd(
    request_stdin: bool = typer.Option(
        False,  # noqa: FBT003
        "--request-stdin",
        help="Read the typed JSON provisioning request from stdin",
    ),
    target_version: str = typer.Option(..., "--target-version", help="Version being updated to"),
    scope: str = typer.Option(..., "--scope", help="Patch scope: local or remote"),
):
    if scope not in {"local", "remote"}:
        raise typer.BadParameter("must be local or remote", param_hint="--scope")
    ctx = _read_request(request_stdin)
    if scope == "local":
        apply_local(ctx, target_version)
        return
    _validate_host(ctx)
    run(ctx=ctx, deploy=lambda patch_ctx: apply_remote(patch_ctx, target_version), ssh_user_override="root", quiet=True)

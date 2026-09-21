from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager

from pyinfra.api.output import set_echo, set_formatter
from pyinfra.api.state import BaseStateCallback, State
from rich.console import Console
from rich.markup import escape
from rich.panel import Panel
from rich.status import Status
from rich.table import Table
from rich.text import Text

console = Console(stderr=True)
_err = Console(stderr=True)

_STATUS_STYLES = {
    "Success": "bold green",
    "No changes": "cyan",
    "Failure": "bold red",
}


class _PyinfraLogHandler(logging.Handler):
    def emit(self, record):
        console.print(self.format(record), markup=True, highlight=False)


class BonesDeployCallback(BaseStateCallback):
    _status: Status | None = None

    @classmethod
    def _stop_status(cls) -> None:
        if cls._status is not None:
            cls._status.stop()
            cls._status = None

    @staticmethod
    def operation_start(state: State, op_hash: str) -> None:
        BonesDeployCallback._stop_status()
        op_meta = state.get_op_meta(op_hash)
        op_name = ", ".join(op_meta.names) or "Operation"
        BonesDeployCallback._status = console.status(
            f"[bold cyan]☠[/]  Running operation: [bold]{escape(op_name)}[/]",
            spinner="dots",
        )
        BonesDeployCallback._status.start()

    @staticmethod
    def operation_end(state: State, op_hash: str) -> None:
        BonesDeployCallback._stop_status()
        op_meta = state.get_op_meta(op_hash)
        op_name = ", ".join(op_meta.names) or "Operation"
        status = "No changes"

        for host in state.inventory:
            try:
                op_data = state.get_op_data_for_host(host, op_hash)
            except KeyError:
                continue

            operation_meta = op_data.operation_meta
            if not operation_meta.is_complete() or operation_meta.did_error():
                status = "Failure"
                break

            if operation_meta.did_change():
                status = "Success"

        status_style = _STATUS_STYLES.get(status, "dim")
        console.print(f"☠  {op_name}", end=" ")
        console.print(f"[{status_style}]{status}[/{status_style}]")


def setup_output() -> None:
    os.environ["PYINFRA_PROGRESS"] = "off"

    def bones_echo(message=None, **kwargs):
        del kwargs
        if message is not None:
            _err.print(message, markup=True, highlight=False)

    def bones_format(text, *args, **kwargs):
        fg = args[0] if args else kwargs.get("fg")
        styles = []
        if kwargs.get("bold"):
            styles.append("bold")
        if fg:
            styles.append(str(fg))

        text = escape(str(text))
        if not styles:
            return text
        return f"[{' '.join(styles)}]{text}[/]"

    set_echo(bones_echo)
    set_formatter(bones_format)

    pyinfra_logger = logging.getLogger("pyinfra")
    pyinfra_logger.handlers.clear()
    handler = _PyinfraLogHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler.setLevel(logging.WARNING)
    pyinfra_logger.addHandler(handler)
    pyinfra_logger.setLevel(logging.WARNING)
    pyinfra_logger.propagate = False


def print_banner() -> None:
    console.print()
    title = Text("☠  bonesdeploy", style="bold cyan")
    console.print(Panel(title, border_style="cyan"))


def print_target(hostname: str, user: str) -> None:
    info = Table.grid(padding=(0, 1))
    info.add_column(style="dim")
    info.add_column(style="bold yellow")
    info.add_row("target:", f"{user}@{hostname}")
    console.print(info)
    console.print()


def print_connected() -> None:
    console.print("☠  [bold cyan]connected[/]")
    console.print()


def stop_live_output() -> None:
    BonesDeployCallback._stop_status()


def print_done(success: bool) -> None:
    console.print()
    if success:
        console.print("☠  [bold green]deploy complete[/]")
    else:
        console.print("☠  [bold red]deploy failed[/]")
    console.print()


@contextmanager
def activity(message: str) -> Iterator[None]:
    with console.status(f"[bold cyan]☠ bonesdeploy[/] {message}", spinner="dots"):
        yield

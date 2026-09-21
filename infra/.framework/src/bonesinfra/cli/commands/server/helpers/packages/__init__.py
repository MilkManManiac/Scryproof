from pyinfra.operations import apt, server

from bonesinfra.cli.commands.server.helpers.packages import neovim, rainfrog, starship
from bonesinfra.config.paths import SCRIPTS_DIR

HELPER_APT_PACKAGES: list[str] = [
    "age",
    "apt-listchanges",
    "apt-transport-https",
    "automysqlbackup",
    "autossh",
    "bash-completion",
    "bat",
    "btop",
    "borgbackup",
    "fastfetch",
    "fd-find",
    "fzf",
    "gnupg",
    "iftop",
    "inotify-tools",
    "iotop",
    "jdupes",
    "jq",
    "lsb-release",
    "lsof",
    "lynis",
    "moreutils",
    "mutt",
    "ncdu",
    "powerstat",
    "powertop",
    "rename",
    "ripgrep",
    "smartmontools",
    "sysbench",
    "sysstat",
    "telnet",
    "tmux",
    "tree",
]


def install_helper_apt_packages(packages):
    apt.packages(
        name="Install supplementary helper apt packages",
        packages=packages,
        present=True,
        update=True,
        cache_time=3600,
        _sudo=True,
    )


def install_debian_command_aliases():
    server.script(
        name="Install Debian helper command aliases",
        src=str(SCRIPTS_DIR / "install-debian-aliases.sh"),
        _sudo=True,
    )

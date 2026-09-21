from pyinfra.operations import server


# Install https://github.com/achristmascarl/rainfrog
# This is too big to be installed as a cargo crate, so we install it via the install script.
def install():
    server.shell(
        name="Install rainfrog binary",
        commands=[("curl -LSsf https://raw.githubusercontent.com/achristmascarl/rainfrog/main/install.sh | bash")],
        _sudo=True,
    )

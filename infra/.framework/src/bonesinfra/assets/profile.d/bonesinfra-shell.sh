export STARSHIP_CONFIG=/etc/starship.toml

if [ -n "${BASH_VERSION:-}" ] && command -v starship >/dev/null 2>&1; then
	eval "$(starship init bash)"
fi

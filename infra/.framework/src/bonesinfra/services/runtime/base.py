class RuntimeService:
    def provision(self, ctx):
        raise NotImplementedError

    def manifest_artifacts(self, _ctx) -> list[tuple[str, str, str, str]]:
        return []

    def manifest_services(self, _ctx) -> list[tuple[str, str, str]]:
        return []

    @staticmethod
    def _identifier(project_name):
        name = project_name.replace("-", "_")
        _max_identifier_len = 48
        if not name or len(name) > _max_identifier_len or not name.replace("_", "").isalnum():
            raise ValueError("project_name cannot be used as a service identifier")
        return name


def credentials_for(ctx, name):
    credentials = getattr(ctx, "service_credentials", {}).get(name)
    if not credentials or not credentials.get("password"):
        raise ValueError(f"credentials for {name} are required; use bonesdeploy secrets edit")
    return credentials

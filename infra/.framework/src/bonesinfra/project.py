from __future__ import annotations

import hashlib
import importlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

from bonesinfra.config.context import DeployContext

FRAMEWORKS = frozenset({"custom", "django", "laravel", "next", "nuxt", "rails", "sveltekit", "vue"})


def load_runtime(ctx: DeployContext) -> ModuleType:
    core, custom = _load_selected(ctx, "runtime.py", "deploy")
    return _compose_runtime(core, custom)


def load_manifest(ctx: DeployContext) -> ModuleType:
    core, custom = _load_selected(ctx, "manifest.py", "artifacts")
    core_path = _module_path(core, "manifest.py")
    _require_callable(core, "services", core_path)
    _require_callable(core, "mode", core_path)
    if custom is not None:
        custom_path = _module_path(custom, "manifest.py")
        _require_callable(custom, "services", custom_path)
        _require_callable(custom, "mode", custom_path)
    return _compose_manifest(core, custom)


def _load_selected(ctx: DeployContext, filename: str, callable_name: str) -> tuple[ModuleType, ModuleType | None]:
    core = _framework_path()
    if not (core / "src/bonesinfra/__main__.py").is_file():
        raise FileNotFoundError(f"project-local BonesInfra framework does not exist: {core}")

    framework = _selected_framework(ctx)
    try:
        module = importlib.import_module(f"bonesinfra.frameworks.{framework}.{filename[:-3]}")
    except Exception as error:
        raise ImportError(f"failed to import project framework infrastructure for {framework}: {error}") from error
    _require_callable(module, callable_name, Path(module.__file__ or filename))
    custom = _load_local_entrypoint(_custom_path(), filename, callable_name, required=False)
    return module, custom


def _load_local_entrypoint(
    package_path: Path, filename: str, callable_name: str, *, required: bool
) -> ModuleType | None:
    path = package_path / filename
    if not path.is_file():
        if not required:
            return None
        raise FileNotFoundError(f"project infrastructure file does not exist: {path}")

    package_name = f"_bones_project_infra_{hashlib.sha256(str(package_path).encode()).hexdigest()[:16]}"
    init_path = path.parent / "__init__.py"
    if not init_path.is_file():
        raise FileNotFoundError(f"project infrastructure package file does not exist: {init_path}")

    _import_module(package_name, init_path, package_name, is_package=True)
    module = _import_module(f"{package_name}.{path.stem}", path, package_name)
    _require_callable(module, callable_name, path)
    return module


def _compose_runtime(core: ModuleType, custom: ModuleType | None) -> ModuleType:
    if custom is None:
        return core
    composed = ModuleType("bonesinfra.project.runtime")

    def deploy(ctx: Any) -> Any:
        core.deploy(ctx)
        return custom.deploy(ctx)

    composed.deploy = deploy
    return composed


def _compose_manifest(core: ModuleType, custom: ModuleType | None) -> ModuleType:
    if custom is None:
        return core
    composed = ModuleType("bonesinfra.project.manifest")

    def artifacts(ctx: Any) -> list[Any]:
        return _combined_entries(core, custom, "artifacts", ctx)

    def services(ctx: Any) -> list[Any]:
        return _combined_entries(core, custom, "services", ctx)

    def mode(ctx: Any) -> Any:
        return custom.mode(ctx) or core.mode(ctx)

    composed.artifacts = artifacts
    composed.services = services
    composed.mode = mode
    return composed


def _combined_entries(core: ModuleType, custom: ModuleType, name: str, ctx: Any) -> list[Any]:
    return [*getattr(core, name)(ctx), *getattr(custom, name)(ctx)]


def _selected_framework(ctx: DeployContext) -> str:
    selected = ctx.template or "custom"
    if selected not in FRAMEWORKS:
        raise ValueError(f"unknown framework infrastructure: {selected}")
    return selected


def _module_path(module: ModuleType, filename: str) -> Path:
    return Path(module.__file__) if module.__file__ else _framework_path() / filename


def _framework_path() -> Path:
    return Path.cwd() / "infra" / ".framework"


def _custom_path() -> Path:
    return Path.cwd() / "infra" / "custom"


def _import_module(name: str, path: Path, package_name: str, *, is_package: bool = False) -> ModuleType:
    locations = [str(path.parent)] if is_package else None
    spec = importlib.util.spec_from_file_location(name, path, submodule_search_locations=locations)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot create import spec for project infrastructure file: {path}")
    module = importlib.util.module_from_spec(spec)
    module.__package__ = package_name
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        raise ImportError(f"failed to import project infrastructure file {path}: {error}") from error
    return module


def _require_callable(module: ModuleType, name: str, path: Path) -> Any:
    value = getattr(module, name, None)
    if not callable(value):
        raise TypeError(f"project infrastructure file {path} must define callable {name}()")
    return value

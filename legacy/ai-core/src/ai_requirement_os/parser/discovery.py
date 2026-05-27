"""Project discovery for Vue + SpringBoot sample systems."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from pydantic import BaseModel, Field

from ai_requirement_os.parser.project_source import SourceProjectConfig


class FrontendPageSummary(BaseModel):
    route_hint: str
    name: str
    path: str
    api_modules: list[str] = Field(default_factory=list)
    has_table: bool = False
    has_dialog: bool = False
    has_form: bool = False


class BackendControllerSummary(BaseModel):
    name: str
    path: str
    request_mapping: str | None = None
    endpoint_count: int = 0


class ApiModuleSummary(BaseModel):
    name: str
    path: str
    method_count: int = 0


class ProjectDiscoverySummary(BaseModel):
    project_name: str
    frontend_path: str | None = None
    backend_path: str | None = None
    frontend_pages: list[FrontendPageSummary] = Field(default_factory=list)
    backend_controllers: list[BackendControllerSummary] = Field(default_factory=list)
    api_modules: list[ApiModuleSummary] = Field(default_factory=list)
    dto_files: list[str] = Field(default_factory=list)
    service_files: list[str] = Field(default_factory=list)
    mapper_files: list[str] = Field(default_factory=list)
    entry_page_suggestions: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _to_posix_paths(paths: Iterable[Path]) -> list[str]:
    return [path.as_posix() for path in sorted(paths)]


def _route_hint(view_path: Path, views_root: Path) -> str:
    relative = view_path.relative_to(views_root).with_suffix("")
    parts = list(relative.parts)
    if parts and parts[-1].lower() == "index":
        parts = parts[:-1]
    slug = "/".join(part.replace(" ", "-") for part in parts)
    return "/" + slug if slug else "/"


def _extract_api_imports(vue_source: str) -> list[str]:
    api_modules: list[str] = []
    for line in vue_source.splitlines():
        stripped = line.strip()
        if stripped.startswith("import ") and "@/api/" in stripped:
            start = stripped.find("@/api/")
            quoted = stripped[start:].split("'")
            if len(quoted) >= 2:
                api_modules.append(quoted[1])
                continue
            quoted = stripped[start:].split('"')
            if len(quoted) >= 2:
                api_modules.append(quoted[1])
    return sorted(set(api_modules))


def discover_frontend_pages(frontend_path: Path) -> list[FrontendPageSummary]:
    views_root = frontend_path / "src" / "views"
    if not views_root.exists():
        return []

    pages: list[FrontendPageSummary] = []
    for view_path in sorted(views_root.rglob("*.vue")):
        source = _read_text(view_path)
        has_form = (
            ("<el-form" in source)
            or ("<el-input" in source)
            or ("<el-select" in source)
        )
        pages.append(
            FrontendPageSummary(
                route_hint=_route_hint(view_path, views_root),
                name=view_path.stem,
                path=view_path.as_posix(),
                api_modules=_extract_api_imports(source),
                has_table="<el-table" in source,
                has_dialog="<el-dialog" in source,
                has_form=has_form,
            )
        )
    return pages


def _extract_request_mapping(controller_source: str) -> str | None:
    for line in controller_source.splitlines():
        stripped = line.strip()
        if stripped.startswith("@RequestMapping("):
            quote = '"' if '"' in stripped else "'"
            if quote in stripped:
                return stripped.split(quote)[1]
    return None


def _count_endpoints(controller_source: str) -> int:
    markers = ("@GetMapping", "@PostMapping", "@PutMapping", "@DeleteMapping", "@PatchMapping")
    return sum(1 for line in controller_source.splitlines() if line.strip().startswith(markers))


def discover_backend_controllers(backend_root: Path) -> list[BackendControllerSummary]:
    java_root = backend_root / "src" / "main" / "java"
    if not java_root.exists():
        return []

    controllers: list[BackendControllerSummary] = []
    for controller_path in sorted(java_root.rglob("*Controller.java")):
        source = _read_text(controller_path)
        controllers.append(
            BackendControllerSummary(
                name=controller_path.stem,
                path=controller_path.as_posix(),
                request_mapping=_extract_request_mapping(source),
                endpoint_count=_count_endpoints(source),
            )
        )
    return controllers


def discover_api_modules(frontend_path: Path) -> list[ApiModuleSummary]:
    api_root = frontend_path / "src" / "api"
    if not api_root.exists():
        return []

    modules: list[ApiModuleSummary] = []
    for api_path in sorted(api_root.rglob("*.js")):
        source = _read_text(api_path)
        modules.append(
            ApiModuleSummary(
                name=api_path.stem,
                path=api_path.as_posix(),
                method_count=source.count("method:"),
            )
        )
    return modules


def discover_project(config: SourceProjectConfig) -> ProjectDiscoverySummary:
    frontend_path = Path(config.frontend_path).expanduser() if config.frontend_path else None
    backend_path = Path(config.backend_path).expanduser() if config.backend_path else None

    frontend_pages = discover_frontend_pages(frontend_path) if frontend_path else []
    backend_controllers = discover_backend_controllers(backend_path) if backend_path else []
    api_modules = discover_api_modules(frontend_path) if frontend_path else []

    dto_files = (
        _to_posix_paths((backend_path / "src" / "main" / "java").rglob("*DTO.java"))
        if backend_path and (backend_path / "src" / "main" / "java").exists()
        else []
    )
    service_files = (
        _to_posix_paths((backend_path / "src" / "main" / "java").rglob("*Service.java"))
        if backend_path and (backend_path / "src" / "main" / "java").exists()
        else []
    )
    mapper_files = (
        _to_posix_paths((backend_path / "src" / "main" / "resources").rglob("*Mapper.xml"))
        if backend_path and (backend_path / "src" / "main" / "resources").exists()
        else []
    )

    notes: list[str] = []
    if any(page.has_table and page.has_dialog for page in frontend_pages):
        notes.append("Detected pages that match the CRUD MVP pattern (table + dialog).")
    if backend_controllers:
        notes.append("SpringBoot controllers are organized clearly enough for first-pass parsing.")
    if any("Detail" in page.name for page in frontend_pages):
        notes.append("Detail.vue is a strong first entry page for parser MVP.")

    return ProjectDiscoverySummary(
        project_name=config.project_name,
        frontend_path=frontend_path.as_posix() if frontend_path else None,
        backend_path=backend_path.as_posix() if backend_path else None,
        frontend_pages=frontend_pages,
        backend_controllers=backend_controllers,
        api_modules=api_modules,
        dto_files=dto_files,
        service_files=service_files,
        mapper_files=mapper_files,
        entry_page_suggestions=[
            page.path for page in frontend_pages if page.has_table and page.has_dialog
        ][:5],
        notes=notes,
    )

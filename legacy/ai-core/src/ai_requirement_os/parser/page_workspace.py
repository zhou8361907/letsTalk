"""Page-centric workspace assembly for requirement documentation and sandboxing."""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel, Field

from ai_requirement_os.agents.config import load_agent_config
from ai_requirement_os.parser.discovery import (
    FrontendPageSummary,
    ProjectDiscoverySummary,
    discover_project,
)
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.schema.runtime_schema import (
    RuntimeAction,
    RuntimeComponent,
    RuntimeField,
    RuntimePageSchema,
)


class RelatedFileRef(BaseModel):
    role: str
    path: str


class SearchFieldDoc(BaseModel):
    key: str
    label: str
    component: str


class TableColumnDoc(BaseModel):
    label: str
    prop: str | None = None


class DialogFieldDoc(BaseModel):
    label: str
    model: str | None = None
    component: str


class DialogDoc(BaseModel):
    title: str
    fields: list[DialogFieldDoc] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)


class FormDoc(BaseModel):
    title: str
    fields: list[DialogFieldDoc] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)


class ApiMethodDoc(BaseModel):
    name: str
    method: str
    path: str


class BackendEndpointDoc(BaseModel):
    method: str
    path: str
    handler: str


class PageDocumentation(BaseModel):
    page_name: str
    page_path: str
    purpose: str
    structures: list[str] = Field(default_factory=list)
    search_fields: list[SearchFieldDoc] = Field(default_factory=list)
    table_columns: list[TableColumnDoc] = Field(default_factory=list)
    page_actions: list[str] = Field(default_factory=list)
    row_actions: list[str] = Field(default_factory=list)
    forms: list[FormDoc] = Field(default_factory=list)
    dialogs: list[DialogDoc] = Field(default_factory=list)
    api_methods: list[ApiMethodDoc] = Field(default_factory=list)
    backend_endpoints: list[BackendEndpointDoc] = Field(default_factory=list)
    business_rules: list[str] = Field(default_factory=list)


class PageWorkspace(BaseModel):
    project_name: str
    selected_page: FrontendPageSummary
    sandbox_route: str
    sandbox_url: str
    related_files: list[RelatedFileRef] = Field(default_factory=list)
    documentation: PageDocumentation
    runtime_schema: RuntimePageSchema
    discovery: ProjectDiscoverySummary


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _extract_tag_component(line: str) -> str:
    match = re.search(r"<(el-[a-z-]+)", line)
    return match.group(1) if match else "unknown"


def _label_from_model_key(model_key: str) -> str:
    mapping = {
        "dateRange": "日期范围",
        "projectId": "项目",
        "accountId": "银行账户",
        "departmentId": "部门",
        "categoryId": "类别",
        "digest": "摘要关键字",
    }
    return mapping.get(model_key, model_key)


def _extract_search_fields(vue_source: str) -> list[SearchFieldDoc]:
    fields: list[SearchFieldDoc] = []
    for line in vue_source.splitlines():
        if "v-model=\"queryCondition." not in line:
            continue
        model_match = re.search(r'v-model="queryCondition\.([^"]+)"', line)
        if not model_match:
            continue
        key = model_match.group(1)
        placeholder_match = re.search(r'placeholder="([^"]+)"', line)
        label = placeholder_match.group(1) if placeholder_match else _label_from_model_key(key)
        fields.append(
            SearchFieldDoc(
                key=key,
                label=label,
                component=_extract_tag_component(line),
            )
        )
    return fields


def _extract_table_columns(vue_source: str) -> list[TableColumnDoc]:
    pattern = re.compile(r'<el-table-column([^>]+label="([^"]+)")([^>]*)>')
    columns: list[TableColumnDoc] = []
    for match in pattern.finditer(vue_source):
        attrs = "".join(group for group in match.groups() if group)
        if 'type="expand"' in attrs or 'type="selection"' in attrs:
            continue
        label = match.group(2)
        prop_match = re.search(r'prop="([^"]+)"', attrs)
        columns.append(
            TableColumnDoc(label=label, prop=prop_match.group(1) if prop_match else None)
        )
    return columns


def _extract_dialogs(vue_source: str) -> list[DialogDoc]:
    dialogs: list[DialogDoc] = []
    dialog_pattern = re.compile(r'<el-dialog[^>]*title="([^"]*)"[^>]*>(.*?)</el-dialog>', re.S)
    form_item_pattern = re.compile(
        r'<el-form-item[^>]*label="([^"]+)"[^>]*>(.*?)</el-form-item>',
        re.S,
    )
    for title, body in dialog_pattern.findall(vue_source):
        fields: list[DialogFieldDoc] = []
        for label, form_body in form_item_pattern.findall(body):
            model_match = re.search(r'v-model="([^"]+)"', form_body)
            fields.append(
                DialogFieldDoc(
                    label=label,
                    model=model_match.group(1) if model_match else None,
                    component=_extract_tag_component(form_body),
                )
            )
        actions = re.findall(r"<el-button[^>]*>([^<]+)</el-button>", body)
        dialogs.append(
            DialogDoc(
                title=title or "未命名弹窗",
                fields=fields,
                actions=[a.strip() for a in actions],
            )
        )
    return dialogs


def _extract_page_forms(vue_source: str) -> list[FormDoc]:
    """提取页面级普通表单。

    这里主要补足登录页、设置页这类“纯表单页”。
    它们没有搜索区、没有表格、也没有弹窗，但依然应该能生成交互沙箱。
    """
    sanitized_source = re.sub(r"<el-dialog[^>]*>.*?</el-dialog>", "", vue_source, flags=re.S)
    form_pattern = re.compile(r"<el-form[^>]*>(.*?)</el-form>", re.S)
    form_item_pattern = re.compile(
        r'<el-form-item[^>]*label="([^"]*)"[^>]*>(.*?)</el-form-item>',
        re.S,
    )
    forms: list[FormDoc] = []
    for body in form_pattern.findall(sanitized_source):
        fields: list[DialogFieldDoc] = []
        actions: list[str] = []
        for label, form_body in form_item_pattern.findall(body):
            button_labels = [
                item.strip()
                for item in re.findall(r"<el-button[^>]*>([^<]+)</el-button>", form_body)
            ]
            if button_labels and not re.search(r'v-model="([^"]+)"', form_body):
                actions.extend(button_labels)
                continue
            model_match = re.search(r'v-model="([^"]+)"', form_body)
            if model_match:
                fields.append(
                    DialogFieldDoc(
                        label=label or "未命名字段",
                        model=model_match.group(1),
                        component=_extract_tag_component(form_body),
                    )
                )
        if fields or actions:
            forms.append(
                FormDoc(
                    title="页面表单",
                    fields=fields,
                    actions=actions,
                )
            )
    return forms


def _extract_buttons(vue_source: str) -> tuple[list[str], list[str]]:
    operation_match = re.search(
        r'<el-table-column[^>]*label="操作"[^>]*>(.*?)</el-table-column>',
        vue_source,
        re.S,
    )
    page_actions: list[str] = []
    row_actions: list[str] = []
    if operation_match:
        block = operation_match.group(1)
        header_match = re.search(r'<template slot="header">(.*?)</template>', block, re.S)
        if header_match:
            header_buttons = re.findall(
                r"<el-button[^>]*>([^<]+)</el-button>",
                header_match.group(1),
            )
            page_actions = [
                label.strip()
                for label in header_buttons
            ]
        scope_match = re.search(r'<template slot-scope="scope">(.*?)</template>', block, re.S)
        if scope_match:
            scope_buttons = re.findall(
                r"<el-button[^>]*>([^<]+)</el-button>",
                scope_match.group(1),
            )
            row_actions = [
                label.strip()
                for label in scope_buttons
            ]
    return page_actions, row_actions


def _extract_imported_api_modules(vue_source: str) -> list[str]:
    matches = re.findall(r'import\s+\w+\s+from\s+["\']@/api/([^"\']+)["\']', vue_source)
    return sorted(set(matches))


def _resolve_related_backend_files(
    backend_root: Path,
    api_modules: list[str],
) -> list[RelatedFileRef]:
    related: list[RelatedFileRef] = []
    java_root = backend_root / "src" / "main" / "java"
    if not java_root.exists():
        return related

    seen_paths: set[str] = set()
    for api_module in api_modules:
        stem = Path(api_module).stem
        entity_hint = stem[:-3] if stem.endswith("Api") else stem
        entity_name = entity_hint[:1].upper() + entity_hint[1:]
        file_patterns = [
            ("controller", f"*{entity_name}Controller.java"),
            ("service", f"*{entity_name}Service.java"),
            ("dto", f"*{entity_name}*DTO.java"),
        ]
        for role, pattern in file_patterns:
            for path in sorted(java_root.rglob(pattern)):
                as_posix = path.as_posix()
                if as_posix not in seen_paths:
                    related.append(RelatedFileRef(role=role, path=as_posix))
                    seen_paths.add(as_posix)
    return related


def _resolve_related_frontend_files(
    frontend_root: Path,
    page_path: Path,
    api_modules: list[str],
) -> list[RelatedFileRef]:
    related = [RelatedFileRef(role="page", path=page_path.as_posix())]
    for api_module in api_modules:
        api_path = frontend_root / "src" / "api" / f"{api_module}.js"
        if api_path.exists():
            related.append(RelatedFileRef(role="api", path=api_path.as_posix()))
    return related


def _extract_api_methods(api_source: str) -> list[ApiMethodDoc]:
    methods: list[ApiMethodDoc] = []
    pattern = re.compile(
        (
            r"(\w+)\s*\([^)]*\)\s*\{\s*return axios\(\{"
            r"\s*url:\s*([^,\n]+),\s*method:\s*['\"](\w+)['\"]"
        ),
        re.S,
    )
    for name, raw_path, method in pattern.findall(api_source):
        path = raw_path.strip().rstrip(",")
        path = path.replace("`", "").replace("'", "").replace('"', "")
        methods.append(ApiMethodDoc(name=name, method=method.upper(), path=path))
    return methods


def _extract_backend_endpoints(controller_source: str) -> list[BackendEndpointDoc]:
    base_path = ""
    base_match = re.search(r'@RequestMapping\("([^"]+)"\)', controller_source)
    if base_match:
        base_path = base_match.group(1)

    endpoint_pattern = re.compile(
        r'@(GetMapping|PostMapping|PutMapping|DeleteMapping)\("([^"]*)"\)\s+public[^{]+\s+(\w+)\(',
        re.S,
    )
    endpoints: list[BackendEndpointDoc] = []
    for annotation, endpoint_path, handler in endpoint_pattern.findall(controller_source):
        method = annotation.replace("Mapping", "").upper()
        full_path = f"{base_path}{endpoint_path}" if endpoint_path else base_path
        endpoints.append(BackendEndpointDoc(method=method, path=full_path or "/", handler=handler))
    return endpoints


def _extract_business_rules(vue_source: str, controller_source: str) -> list[str]:
    rules: list[str] = []
    if "currentUserGroupId<='1'" in vue_source:
        rules.append("页面中的操作列和上传图片能力受 currentUserGroupId <= 1 控制。")
    if "this.$refs.addDetailForm.validate()" in vue_source:
        rules.append("新增记录前需要通过表单校验。")
    if "form.getDigest() == null" in controller_source:
        rules.append("摘要为空时由后端默认补为“无”。")
    if (
        "form.getEarning() == null" in controller_source
        or "form.getExpense() == null" in controller_source
    ):
        rules.append("收入和支出为空时由后端补零。")
    if "setBalance(form)" in controller_source:
        rules.append("结存不由前端直接维护，而由后端服务计算。")
    return rules


def _summarize_structures(page_summary: FrontendPageSummary, dialogs: list[DialogDoc]) -> list[str]:
    structures: list[str] = []
    if page_summary.has_form:
        structures.append("搜索区")
    if page_summary.has_table:
        structures.append("表格区")
    if "el-pagination" in _read_text(Path(page_summary.path)):
        structures.append("分页区")
    if page_summary.has_dialog:
        structures.append("弹窗区")
    if dialogs:
        structures.extend([f"弹窗：{dialog.title}" for dialog in dialogs])
    return structures


def _purpose_from_page_name(page_name: str) -> str:
    if page_name.lower() == "detail":
        return "用于查询、展示和维护收支明细记录，并承载新增、修改、删除与图片上传流程。"
    return f"用于承载 {page_name} 页面对应的业务查询与维护操作。"


def _build_sandbox_route(page_summary: FrontendPageSummary) -> str:
    route = page_summary.route_hint or f"/{page_summary.name.lower()}"
    if not route.startswith("/"):
        route = f"/{route}"
    segments = [segment for segment in route.split("/") if segment]
    normalized = [
        f"{segment[:1].lower()}{segment[1:]}" if segment else segment
        for segment in segments
    ]
    return "/" + "/".join(normalized) if normalized else "/"


def _build_sandbox_url(page_summary: FrontendPageSummary) -> str:
    sandbox_base_url = load_agent_config().sandbox.sandbox_base_url.rstrip("/")
    route = _build_sandbox_route(page_summary)
    return f"{sandbox_base_url}/#{route}"


def _build_runtime_schema(doc: PageDocumentation) -> RuntimePageSchema:
    components: list[RuntimeComponent] = []
    if doc.forms:
        for index, form in enumerate(doc.forms, start=1):
            components.append(
                RuntimeComponent(
                    key=f"form_{index}",
                    type="Form",
                    title=form.title,
                    fields=[
                        RuntimeField(
                            key=field.model or field.label,
                            label=field.label,
                            component=field.component,
                        )
                        for field in form.fields
                    ],
                    actions=[
                        RuntimeAction(key=action, label=action, action_type="custom", scope="page")
                        for action in form.actions
                    ],
                )
            )
    if doc.search_fields:
        components.append(
            RuntimeComponent(
                key="search_form",
                type="SearchForm",
                title="搜索条件",
                fields=[
                    RuntimeField(key=field.key, label=field.label, component=field.component)
                    for field in doc.search_fields
                ],
                actions=[
                    RuntimeAction(key=action, label=action, action_type="custom", scope="page")
                    for action in doc.page_actions
                ],
            )
        )
    if doc.table_columns:
        components.append(
            RuntimeComponent(
                key="table_main",
                type="Table",
                title="数据列表",
                columns=[
                    {
                        "key": column.prop or column.label,
                        "label": column.label,
                        "value_type": "text",
                    }
                    for column in doc.table_columns
                ],
                actions=[
                    RuntimeAction(key=action, label=action, action_type="custom", scope="row")
                    for action in doc.row_actions
                ],
            )
        )
    for index, dialog in enumerate(doc.dialogs, start=1):
        components.append(
            RuntimeComponent(
                key=f"dialog_{index}",
                type="Dialog",
                title=dialog.title,
                fields=[
                    RuntimeField(
                        key=field.model or field.label,
                        label=field.label,
                        component=field.component,
                    )
                    for field in dialog.fields
                ],
                actions=[
                    RuntimeAction(key=action, label=action, action_type="custom", scope="dialog")
                    for action in dialog.actions
                ],
            )
        )
    return RuntimePageSchema(
        page=Path(doc.page_path).stem,
        route=doc.page_path,
        domain="page-workspace",
        components=components,
        formulas=[],
    )


def build_page_workspace(config: SourceProjectConfig, page_path: str) -> PageWorkspace:
    discovery = discover_project(config)
    page_summary = next((page for page in discovery.frontend_pages if page.path == page_path), None)
    if page_summary is None:
        raise ValueError(f"Page not found: {page_path}")

    frontend_root = Path(config.frontend_path).expanduser() if config.frontend_path else None
    backend_root = Path(config.backend_path).expanduser() if config.backend_path else None
    if frontend_root is None or backend_root is None:
        raise ValueError("Both frontend_path and backend_path are required.")

    vue_source = _read_text(Path(page_path))
    imported_api_modules = _extract_imported_api_modules(vue_source)

    frontend_files = _resolve_related_frontend_files(
        frontend_root,
        Path(page_path),
        imported_api_modules,
    )
    backend_files = _resolve_related_backend_files(backend_root, imported_api_modules)
    related_files = frontend_files + backend_files

    api_methods: list[ApiMethodDoc] = []
    for api_module in imported_api_modules:
        api_path = frontend_root / "src" / "api" / f"{api_module}.js"
        if api_path.exists():
            api_methods.extend(_extract_api_methods(_read_text(api_path)))

    controller_paths = [Path(ref.path) for ref in backend_files if ref.role == "controller"]
    backend_endpoints: list[BackendEndpointDoc] = []
    controller_source = ""
    if controller_paths:
        controller_source = _read_text(controller_paths[0])
        backend_endpoints = _extract_backend_endpoints(controller_source)

    dialogs = _extract_dialogs(vue_source)
    forms = _extract_page_forms(vue_source)
    page_actions, row_actions = _extract_buttons(vue_source)
    documentation = PageDocumentation(
        page_name=page_summary.name,
        page_path=page_summary.path,
        purpose=_purpose_from_page_name(page_summary.name),
        structures=_summarize_structures(page_summary, dialogs),
        search_fields=_extract_search_fields(vue_source),
        table_columns=_extract_table_columns(vue_source),
        page_actions=page_actions,
        row_actions=row_actions,
        forms=forms,
        dialogs=dialogs,
        api_methods=api_methods,
        backend_endpoints=backend_endpoints,
        business_rules=_extract_business_rules(vue_source, controller_source),
    )
    return PageWorkspace(
        project_name=config.project_name,
        selected_page=page_summary,
        sandbox_route=_build_sandbox_route(page_summary),
        sandbox_url=_build_sandbox_url(page_summary),
        related_files=related_files,
        documentation=documentation,
        runtime_schema=_build_runtime_schema(documentation),
        discovery=discovery,
    )

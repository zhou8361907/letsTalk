"""Structured page data lineage models and Markdown rendering."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LineageField(BaseModel):
    label: str = ""
    frontend_field: str = ""
    backend_fields: list[str] = Field(default_factory=list)
    description: str = ""
    source_refs: list[str] = Field(default_factory=list)


class InitialFetchStep(BaseModel):
    order: int
    name: str = ""
    api: str = ""
    method: str = ""
    frontend_entry: str = ""
    backend_entry: str = ""
    summary: str = ""
    return_summary: str = ""
    source_refs: list[str] = Field(default_factory=list)


class BackendPointer(BaseModel):
    layer: str = ""
    class_name: str = ""
    method_name: str = ""
    method_signature: str = ""
    file_path: str = ""
    line_number_hint: int = 0
    note: str = ""


class RequestFlowStep(BaseModel):
    order: int
    api: str = ""
    method: str = ""
    payload_fields: list[str] = Field(default_factory=list)
    summary: str = ""
    return_summary: str = ""
    backend_pointers: list[BackendPointer] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class PageActionLineage(BaseModel):
    name: str = ""
    frontend_handler: str = ""
    summary: str = ""
    request_flow: list[RequestFlowStep] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class BackendOverview(BaseModel):
    controllers: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    tables: list[str] = Field(default_factory=list)


class PageInfo(BaseModel):
    page_name: str = ""
    page_path: str = ""
    module_name: str = ""
    summary: str = ""


class PageDataLineage(BaseModel):
    page_info: PageInfo = Field(default_factory=PageInfo)
    search_fields: list[LineageField] = Field(default_factory=list)
    display_fields: list[LineageField] = Field(default_factory=list)
    initial_fetches: list[InitialFetchStep] = Field(default_factory=list)
    actions: list[PageActionLineage] = Field(default_factory=list)
    backend_overview: BackendOverview = Field(default_factory=BackendOverview)
    notes: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    deep_logic_flags: dict[str, str] = Field(default_factory=dict)


def render_page_lineage_markdown(lineage: PageDataLineage) -> str:
    def _lines(values: list[str]) -> list[str]:
        return values if values else ["- -"]

    lines: list[str] = [
        f"# 页面数据解析报告：{lineage.page_info.page_name or '未命名页面'}",
        "",
        "## 1. 页面概览",
        f"- 页面路径：`{lineage.page_info.page_path or '-'}`",
        f"- 所属模块：{lineage.page_info.module_name or '-'}",
        f"- 页面说明：{lineage.page_info.summary or '-'}",
        "",
        "## 2. 查询条件字段",
        "| 页面展示名称 | 前端字段 | 后端字段 | 说明 |",
        "| :--- | :--- | :--- | :--- |",
    ]
    if lineage.search_fields:
        for field in lineage.search_fields:
            lines.append(
                f"| {field.label or '-'} | `{field.frontend_field or '-'}` | "
                f"`{' / '.join(field.backend_fields) if field.backend_fields else '-'}` | "
                f"{field.description or '-'} |"
            )
    else:
        lines.append("| - | - | - | - |")

    lines.extend(
        [
            "",
            "## 3. 展示字段",
            "| 页面展示名称 | 前端字段 | 后端字段 | 说明 |",
            "| :--- | :--- | :--- | :--- |",
        ]
    )
    if lineage.display_fields:
        for field in lineage.display_fields:
            lines.append(
                f"| {field.label or '-'} | `{field.frontend_field or '-'}` | "
                f"`{' / '.join(field.backend_fields) if field.backend_fields else '-'}` | "
                f"{field.description or '-'} |"
            )
    else:
        lines.append("| - | - | - | - |")

    lines.extend(["", "## 4. 页面初始化请求"])
    if lineage.initial_fetches:
        for item in sorted(lineage.initial_fetches, key=lambda step: step.order):
            lines.extend(
                [
                    f"### {item.order}. {item.name or '未命名请求'}",
                    f"- 请求接口：`{item.method or '-'} {item.api or '-'}`",
                    f"- 前端入口：{item.frontend_entry or '-'}",
                    f"- 后端入口：{item.backend_entry or '-'}",
                    f"- 接口作用：{item.summary or '-'}",
                    f"- 返回内容：{item.return_summary or '-'}",
                ]
            )
    else:
        lines.append("- -")

    lines.extend(["", "## 5. 页面操作"])
    if lineage.actions:
        for action in lineage.actions:
            lines.extend(
                [
                    f"### {action.name or '未命名操作'}",
                    f"- 前端方法：{action.frontend_handler or '-'}",
                    f"- 操作说明：{action.summary or '-'}",
                ]
            )
            if action.request_flow:
                lines.append("- 请求链路：")
                for step in sorted(action.request_flow, key=lambda item: item.order):
                    payload = " / ".join(step.payload_fields) if step.payload_fields else "-"
                    lines.extend(
                        [
                            f"  - {step.order}. `{step.method or '-'} {step.api or '-'}`",
                            f"    - 参数：{payload}",
                            f"    - 逻辑：{step.summary or '-'}",
                            f"    - 返回：{step.return_summary or '-'}",
                        ]
                    )
                    if step.backend_pointers:
                        pointer_text = " / ".join(
                            f"{pointer.layer}:{pointer.class_name}.{pointer.method_name}"
                            for pointer in step.backend_pointers
                        )
                        lines.append(f"    - 后端定位：{pointer_text}")
            else:
                lines.append("- 请求链路：-")
    else:
        lines.append("- -")

    lines.extend(
        [
            "",
            "## 6. 后端概览",
            f"- Controller：{' / '.join(lineage.backend_overview.controllers) if lineage.backend_overview.controllers else '-'}",
            f"- Service：{' / '.join(lineage.backend_overview.services) if lineage.backend_overview.services else '-'}",
            f"- 涉及数据表：{' / '.join(lineage.backend_overview.tables) if lineage.backend_overview.tables else '-'}",
            "",
            "## 7. 备注",
            *_lines([f"- {item}" for item in lineage.notes]),
        ]
    )
    lines.extend(["", "## 8. 深水区提示"])
    if lineage.deep_logic_flags:
        for key, value in lineage.deep_logic_flags.items():
            lines.append(f"- `{key}`: {value}")
    else:
        lines.append("- -")
    lines.extend(["", "## 9. 未确认项"])
    if lineage.unknowns:
        for item in lineage.unknowns:
            lines.append(f"- {item}")
    else:
        lines.append("- -")
    return "\n".join(lines)

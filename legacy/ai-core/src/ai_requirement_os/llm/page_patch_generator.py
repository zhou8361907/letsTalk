"""页面级沙箱 patch 生成器。

这一层专门把“产品语言”翻成“沙箱可执行 patch”，而不是改真实代码。
当前先服务于真实页面副本上的轻量 DOM patch。
"""

from __future__ import annotations

from textwrap import shorten

from pydantic import BaseModel, Field

from ai_requirement_os.llm.gateway import get_llm_by_role
from ai_requirement_os.llm.page_doc_generator import build_page_context_envelope
from ai_requirement_os.llm.prompts import (
    build_page_patch_user_prompt,
    page_patch_system_prompt,
)
from ai_requirement_os.parser.page_workspace import PageWorkspace


class SandboxPatchOperation(BaseModel):
    action: str
    target: str
    label: str | None = None
    key: str | None = None
    component: str | None = None
    placeholder: str | None = None
    value: str | None = None
    original_label: str | None = None
    note: str | None = None


class SandboxPatch(BaseModel):
    summary: str
    rationale: list[str] = Field(default_factory=list)
    operations: list[SandboxPatchOperation] = Field(default_factory=list)


class SandboxPatchResult(BaseModel):
    mode: str
    model: str
    warnings: list[str] = Field(default_factory=list)
    patch: SandboxPatch


def _append_toolbar_button_patch(
    operations: list[SandboxPatchOperation],
    user_request: str,
) -> bool:
    normalized = user_request.replace(" ", "")
    if "按钮" not in normalized:
        return False
    if "结存" in normalized and ("清除" in normalized or "清空" in normalized):
        if any(operation.action == "add_toolbar_button" for operation in operations):
            return True
        operations.append(
            SandboxPatchOperation(
                action="add_toolbar_button",
                target="toolbar",
                label="清除结存",
                key="clearBalance",
                original_label="添加记录",
                note="需先勾选表格数据，再点击按钮，将选中行的结存仅在沙箱展示层清零。",
            )
        )
        return True
    return False


def _normalize_patch_operations(
    operations: list[SandboxPatchOperation],
    user_request: str,
) -> list[SandboxPatchOperation]:
    normalized = user_request.replace(" ", "")
    is_clear_balance_button_request = (
        "按钮" in normalized
        and "结存" in normalized
        and ("清除" in normalized or "清空" in normalized)
    )
    if not is_clear_balance_button_request:
        return operations

    normalized_operations: list[SandboxPatchOperation] = []
    for operation in operations:
        is_misclassified_column_preview = (
            operation.action == "add_table_column"
            and ((operation.label and "清除结存" in operation.label) or "结存" in (operation.note or ""))
        )
        if is_misclassified_column_preview:
            continue
        normalized_operations.append(operation)
    return normalized_operations


def _fallback_patch(workspace: PageWorkspace, user_request: str) -> SandboxPatchResult:
    """在没有模型时给一个保守可用的兜底结果。"""
    operations: list[SandboxPatchOperation] = []
    warnings = ["当前未连上模型，已使用规则兜底生成基础 patch。"]

    if "搜索" in user_request and ("增加" in user_request or "新增" in user_request):
        operations.append(
            SandboxPatchOperation(
                action="add_search_field",
                target="search",
                label="新字段",
                key="newField",
                component="el-input",
                placeholder="请输入",
                note="兜底模式下未能精确抽取字段名，请手动调整。",
            )
        )
    if "表格" in user_request and ("列" in user_request or "字段" in user_request):
        operations.append(
            SandboxPatchOperation(
                action="add_table_column",
                target="table",
                label="新列",
                key="newColumn",
                note="兜底模式下仅添加演示列。",
            )
        )
    if "按钮" in user_request and ("改" in user_request or "重命名" in user_request):
        operations.append(
            SandboxPatchOperation(
                action="rename_button",
                target="button",
                original_label=(
                    "登录"
                    if workspace.documentation.page_name.lower() == "login"
                    else "添加记录"
                ),
                label="新的按钮文案",
            )
        )
    _append_toolbar_button_patch(operations, user_request)

    if not operations:
        operations.append(
            SandboxPatchOperation(
                action="annotate_rule",
                target="rule",
                label="需求待人工细化",
                note=user_request,
            )
        )
        warnings.append("当前需求还不够适合直接落成页面 patch，先记录为规则备注。")

    return SandboxPatchResult(
        mode="draft",
        model="none",
        warnings=warnings,
        patch=SandboxPatch(
            summary=f"{workspace.documentation.page_name} 页面需求已转成基础沙箱 patch。",
            rationale=[
                "当前阶段只修改沙箱副本，不改真实代码。",
                "patch 以页面表达层为中心，便于产品继续讨论。",
            ],
            operations=operations,
        ),
    )


def generate_page_patch_with_llm(
    workspace: PageWorkspace,
    *,
    user_request: str,
) -> SandboxPatchResult:
    """调用统一 LLM 入口，为当前页面生成结构化 patch。"""
    try:
        llm = get_llm_by_role("primary")
    except RuntimeError:
        return _fallback_patch(workspace, user_request)

    context = build_page_context_envelope(workspace)
    context_text = "\n\n".join(
        f"[{block.role}] {block.path}\n{block.content}"
        for block in context.blocks
    )
    human_prompt = build_page_patch_user_prompt(
        project_name=context.project_name,
        page_name=context.page_name,
        page_path=context.page_path,
        sandbox_route=workspace.sandbox_route,
        documentation=workspace.documentation,
        user_request=user_request,
        context_text=context_text,
    )
    structured_llm = llm.with_structured_output(SandboxPatchResult)
    result = structured_llm.invoke(
        [
            ("system", page_patch_system_prompt()),
            ("human", human_prompt),
        ]
    )
    result.mode = "llm"
    result.model = str(getattr(llm, "model_name", "deepseek-chat"))
    _append_toolbar_button_patch(result.patch.operations, user_request)
    result.patch.operations = _normalize_patch_operations(result.patch.operations, user_request)
    result.warnings = [
        *result.warnings,
        "patch 只面向当前页面沙箱副本，不直接落到生产代码。",
        f"提示词预览：{shorten(user_request, width=80, placeholder='...')}",
    ]
    return result

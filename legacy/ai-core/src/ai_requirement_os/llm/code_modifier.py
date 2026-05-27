"""LLM-driven code modification planner."""

from __future__ import annotations

from pathlib import Path
from textwrap import shorten
from uuid import uuid4

from ai_requirement_os.agents.code_tools import CodeEdit, CodeModificationPlan
from ai_requirement_os.llm.gateway import get_llm_by_role
from ai_requirement_os.llm.page_doc_generator import build_page_context_envelope
from ai_requirement_os.llm.prompts import (
    build_code_modification_user_prompt,
    code_modification_system_prompt,
)
from ai_requirement_os.parser.page_workspace import PageWorkspace


def _frontend_context_text(workspace: PageWorkspace) -> str:
    context = build_page_context_envelope(workspace)
    blocks = [
        f"[{block.role}] {block.path}\n{block.content}"
        for block in context.blocks
        if "/vue/" in block.path or "/src/" in block.path
    ]
    return "\n\n".join(blocks)


def _fallback_plan(workspace: PageWorkspace, user_request: str) -> CodeModificationPlan:
    page_path = Path(workspace.documentation.page_path)
    plan = CodeModificationPlan(
        plan_id=uuid4().hex,
        summary=f"{workspace.documentation.page_name} 页面代码修改计划草稿",
        rationale=["当前未连上模型，已使用保守规则生成代码计划。"],
        edits=[],
    )
    normalized = user_request.replace(" ", "")
    if page_path.name == "Detail.vue" and "报销" in normalized and ("筛选" in normalized or "搜索" in normalized):
        plan.summary = "在明细页搜索区增加报销状态筛选"
        plan.rationale.append("当前页面已有列表与查询条件，适合先用前端筛选开关验证交互。")
        plan.edits.extend(
            [
                CodeEdit(
                    file_path=page_path.as_posix(),
                    action="insert_after",
                    anchor_text="""      <el-col :span="3">\n        <el-input v-model="queryCondition.digest" placeholder="摘要关键字" @change="loadData" clearable></el-input>\n      </el-col>""",
                    new_content="""
      <el-col :span="3">
        <el-select v-model="queryCondition.reimbursement" placeholder="是否报销" @change="loadData" clearable>
          <el-option label="已报销" :value="true"></el-option>
          <el-option label="未报销" :value="false"></el-option>
        </el-select>
      </el-col>""",
                    description="在搜索区增加报销状态下拉框",
                ),
                CodeEdit(
                    file_path=page_path.as_posix(),
                    action="insert_after",
                    anchor_text="""        categoryId: null,\n        digest: null,""",
                    new_content="\n        reimbursement: null,",
                    description="在查询条件中增加 reimbursement 字段",
                ),
            ]
        )
    if not plan.edits:
        plan.rationale.append("需求无法通过保守规则稳定落地，请启用模型或细化需求。")
    return plan


def generate_code_modification_plan(
    workspace: PageWorkspace,
    *,
    user_request: str,
    frontend_root: str,
) -> CodeModificationPlan:
    try:
        llm = get_llm_by_role("primary")
    except RuntimeError:
        return _fallback_plan(workspace, user_request)

    context_text = _frontend_context_text(workspace)
    human_prompt = build_code_modification_user_prompt(
        project_name=workspace.project_name,
        page_name=workspace.documentation.page_name,
        page_path=workspace.documentation.page_path,
        frontend_root=frontend_root,
        documentation=workspace.documentation,
        user_request=user_request,
        context_text=context_text,
    )
    structured_llm = llm.with_structured_output(CodeModificationPlan)
    result = structured_llm.invoke(
        [
            ("system", code_modification_system_prompt()),
            ("human", human_prompt),
        ]
    )
    if not result.plan_id:
        result.plan_id = uuid4().hex
    result.status = "planned"
    if not result.rationale:
        result.rationale = [f"提示词预览：{shorten(user_request, width=120, placeholder='...')}"]
    return result

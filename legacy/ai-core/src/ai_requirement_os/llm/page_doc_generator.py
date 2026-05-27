"""页面级文档生成。

这一层负责：
1. 组装“当前页面最小上下文包”
2. 选择统一的 LLM gateway
3. 应用页面文档专用提示词

注意：
这里不应该直接散读环境变量，也不应该自己决定模型角色。
这些事情统一交给 `llm.gateway` 和 `agents.config`。
"""

from __future__ import annotations

from textwrap import shorten

from pydantic import BaseModel, Field

from ai_requirement_os.llm.gateway import get_llm_by_role
from ai_requirement_os.llm.prompts import build_page_doc_user_prompt, page_doc_system_prompt
from ai_requirement_os.parser.page_workspace import PageDocumentation, PageWorkspace


class PageContextBlock(BaseModel):
    role: str
    path: str
    content: str


class PageContextEnvelope(BaseModel):
    project_name: str
    page_name: str
    page_path: str
    notes: list[str] = Field(default_factory=list)
    blocks: list[PageContextBlock] = Field(default_factory=list)


class LLMPageDocResult(BaseModel):
    mode: str
    model: str
    warnings: list[str] = Field(default_factory=list)
    documentation: PageDocumentation


def _truncate(text: str, limit: int = 4000) -> str:
    """限制单文件注入提示词的长度，避免页面上下文失控。"""
    stripped = text.strip()
    if len(stripped) <= limit:
        return stripped
    return stripped[:limit]


def build_page_context_envelope(workspace: PageWorkspace) -> PageContextEnvelope:
    """把页面工作区转换成一个稳定、可审计的上下文包。"""
    blocks: list[PageContextBlock] = []
    for related in workspace.related_files:
        path = related.path
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                content = _truncate(handle.read())
        except OSError:
            content = ""
        blocks.append(PageContextBlock(role=related.role, path=path, content=content))
    return PageContextEnvelope(
        project_name=workspace.project_name,
        page_name=workspace.documentation.page_name,
        page_path=workspace.documentation.page_path,
        notes=[
            "Only use the supplied page-scoped files.",
            "Do not infer unrelated project capabilities.",
            "Return structured documentation for requirement analysis and sandboxing.",
        ],
        blocks=blocks,
    )


def _build_messages(context: PageContextEnvelope, draft_doc: PageDocumentation) -> tuple[str, str]:
    """生成页面文档任务的中文提示词。"""
    context_text = "\n\n".join(
        [
            f"[{block.role}] {block.path}\n{block.content}"
            for block in context.blocks
        ]
    )
    return (
        page_doc_system_prompt("primary"),
        build_page_doc_user_prompt(
            project_name=context.project_name,
            page_name=context.page_name,
            page_path=context.page_path,
            draft_doc=draft_doc,
            context_text=context_text,
        ),
    )


def generate_page_documentation_with_llm(workspace: PageWorkspace) -> LLMPageDocResult:
    """调用统一 LLM 入口，为当前页面生成增强版文档。"""
    try:
        llm = get_llm_by_role("primary")
    except RuntimeError as exc:
        return LLMPageDocResult(
            mode="draft",
            model="none",
            warnings=[str(exc)],
            documentation=workspace.documentation,
        )

    context = build_page_context_envelope(workspace)
    system_prompt, human_prompt = _build_messages(context, workspace.documentation)
    structured_llm = llm.with_structured_output(PageDocumentation)
    documentation = structured_llm.invoke(
        [
            ("system", system_prompt),
            ("human", human_prompt),
        ]
    )
    return LLMPageDocResult(
        mode="llm",
        model=str(getattr(llm, "model_name", "deepseek-chat")),
        warnings=[
            "LLM 只处理当前页面及其直接关联文件，不会扩展到整个仓库。",
            f"提示词预览：{shorten(human_prompt, width=180, placeholder='...')}",
        ],
        documentation=documentation,
    )

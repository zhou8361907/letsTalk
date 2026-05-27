"""集中管理 LLM 提示词模板。

这里故意用中文来写系统提示词，方便你后续直接修改。
后面如果要继续细分任务，比如 PageIR、Patch、Diff，也建议都放到这里。
"""

from __future__ import annotations

from typing import Literal

from ai_requirement_os.parser.page_workspace import PageDocumentation
PromptRole = Literal["primary", "planner", "review"]
PatchRole = Literal["patch"]


def page_doc_system_prompt(role: PromptRole) -> str:
    """返回页面文档任务的系统提示词。

    设计原则：
    1. 只允许模型处理“当前页面工作区”里的内容
    2. 不允许凭空发明接口、字段、按钮
    3. 输出必须服务于页面文档 / 页面 IR / 沙箱，而不是泛泛描述
    """
    base = (
        "你是一个面向企业 CRUD 系统的页面需求分析助手。\n"
        "你每次只处理一个具体页面，而不是整个项目。\n"
        "你只能使用当前提供的页面级上下文，包括 Vue 页面、直接关联的前端 API、"
        "后端 Controller、DTO、Service 等文件。\n"
        "你不能编造不存在的字段、接口、状态、按钮或业务流程。\n"
        "你的输出必须可用于页面级文档、PageIR 和沙箱生成。"
    )
    if role == "planner":
        return (
            base
            + "\n你的重点是识别页面的结构、交互分区、主要动作以及后续需要分析的上下文重点。"
        )
    if role == "review":
        return (
            base
            + "\n你的重点是审查草稿中的遗漏、命名不清、规则不完整和不够严谨的地方。"
        )
    return (
        base
        + "\n你的重点是把当前页面整理成清晰、规范、结构化的页面文档对象。"
    )


def build_page_doc_user_prompt(
    *,
    project_name: str,
    page_name: str,
    page_path: str,
    draft_doc: PageDocumentation,
    context_text: str,
) -> str:
    """构造页面文档任务的用户提示词。"""
    return (
        f"项目名称：{project_name}\n"
        f"页面名称：{page_name}\n"
        f"页面路径：{page_path}\n\n"
        "下面先给你一份基于规则抽取的页面文档草稿，请你在此基础上进行规范化补全：\n"
        f"{draft_doc.model_dump_json(indent=2)}\n\n"
        "下面是当前页面工作区允许使用的文件上下文：\n"
        f"{context_text}\n\n"
        "请直接返回改进后的 PageDocumentation 结构。\n"
        "要求：\n"
        "1. 保持字段结构稳定\n"
        "2. 优先修正文案、业务职责、规则表达\n"
        "3. 不要增加上下文中不存在的新能力\n"
        "4. 输出内容要适合后续页面沙箱和需求修改使用"
    )


def page_lineage_system_prompt() -> str:
    return (
        "你是一个精通 Vue、Spring Boot、MyBatis 的页面业务地图助手。\n"
        "你的任务是围绕单个页面，梳理字段、初始化请求、主要操作和后端落点。\n"
        "这不是一个追求秒级返回的草稿任务，而是一份高置信度的 Business Map。\n"
        "你必须优先关注数据字段、接口调用和返回，不要花篇幅描述样式和布局。\n"
        "你只能依据当前提供的页面级上下文输出，不要编造不存在的接口、字段、按钮或数据库表。\n"
        "display_fields 当前只关注主表格字段，不展开弹窗表单和详情区字段。\n"
        "actions 当前只保留关键业务操作，不收录过于简单的前端交互。\n"
        "actions.request_flow 里的 backend_pointers 要尽量提供 Controller / Service 的精确方法坐标。\n"
        "那些后续可以通过工具搜索快速补充的代码细节，不必在首版结果中过度展开。\n"
        "如果某条映射无法确认，可以留空、写 unknown，或者放进 unknowns。\n"
        "如果某段逻辑已经找到入口，但继续总结的幻觉风险变高，请把原因写进 deep_logic_flags，而不是硬编。\n"
        "你只能输出合法的结构化 JSON 对象，不能输出 Markdown 或任何额外说明。"
    )


def build_page_lineage_user_prompt(
    *,
    project_name: str,
    page_name: str,
    page_path: str,
    evidence_bundle_json: str,
) -> str:
    return (
        f"项目名称：{project_name}\n"
        f"页面名称：{page_name}\n"
        f"页面路径：{page_path}\n\n"
        "下面是当前页面的 Evidence Bundle。它已经做过方法级裁剪，请只基于这里的证据工作：\n"
        f"{evidence_bundle_json}\n\n"
        "请返回结构化 PageDataLineage，要求：\n"
        "1. search_fields 和 display_fields 尽量补全页面字段与后端字段的对应关系\n"
        "2. display_fields 当前只覆盖主表格字段\n"
        "3. initial_fetches 用有顺序的数组表示页面初始化请求\n"
        "4. actions 只保留关键业务操作，重点写前端传参、调用接口顺序、接口逻辑概览、返回概览\n"
        "5. request_flow 中的 backend_pointers 要优先保留真实 Controller / Service 方法坐标\n"
        "6. backend_overview 只保留对当前页面最重要的 controller、service、table\n"
        "7. 能被后续工具轻松搜索到的细碎实现信息，不必为了完整而过度展开\n"
        "8. 面向产品和研发快速理解页面，不要写过深的数据库推理\n"
        "9. 遇到复杂逻辑、深层调用链或无法可靠确认的部分，请写入 unknowns 或 deep_logic_flags\n"
        "10. source_refs 和 backend_pointers 中的 file_path 应优先使用真实绝对路径\n"
        "11. backend_pointers 必须以 class_name + method_name + method_signature 作为稳定定位锚点，line_number_hint 仅作提示\n"
        "12. 禁止输出 Markdown、解释性前后缀或额外文本，只返回合法的结构化对象"
    )


def page_patch_system_prompt() -> str:
    """返回页面 patch 任务的系统提示词。"""
    return (
        "你是一个页面级需求修改助手。\n"
        "你的任务不是改生产代码，而是把用户的自然语言需求转成页面沙箱补丁。\n"
        "你每次只处理一个具体页面，只能依据当前页面文档和关联上下文生成 patch。\n"
        "你不能编造不存在的后端能力，但可以为沙箱表达层生成演示性字段、列、按钮文案。\n"
        "你的输出必须是结构化 patch，便于前端沙箱实时应用。\n"
        "优先生成小步、可解释、可回放的操作。"
    )


def build_page_patch_user_prompt(
    *,
    project_name: str,
    page_name: str,
    page_path: str,
    sandbox_route: str,
    documentation: PageDocumentation,
    user_request: str,
    context_text: str,
) -> str:
    """构造页面 patch 任务的用户提示词。"""
    return (
        f"项目名称：{project_name}\n"
        f"页面名称：{page_name}\n"
        f"页面路径：{page_path}\n"
        f"沙箱路由：{sandbox_route}\n\n"
        "下面是当前页面的结构化页面文档，请优先基于它理解页面：\n"
        f"{documentation.model_dump_json(indent=2)}\n\n"
        "下面是当前页面允许使用的关联上下文：\n"
        f"{context_text}\n\n"
        f"用户当前需求：{user_request}\n\n"
        "请返回一个结构化 SandboxPatchResult，要求：\n"
        "1. 只生成当前页面能表达的 patch\n"
        "2. 操作尽量少而清晰\n"
        "3. action 仅可使用：add_search_field、add_table_column、"
        "rename_button、add_form_field、annotate_rule\n"
        "4. target 只能是：search、table、form、button、rule\n"
        "5. 中文总结要能直接给产品经理看懂\n"
        "6. 如果需求无法安全落到当前页面，也要通过 warnings 说明原因"
    )


def code_modification_system_prompt() -> str:
    """返回代码修改计划任务的系统提示词。"""
    return (
        "你是一个页面级代码修改助手。\n"
        "你的任务不是生成 SandboxPatch，也不是直接输出整份文件，而是生成一组稳定的代码编辑计划。\n"
        "你每次只处理一个具体页面，只能依据当前页面文档和关联上下文修改真实前端项目中的直接相关文件。\n"
        "你不能编造不存在的接口、组件、字段或后端能力。\n"
        "你输出的每个 edit 都必须能通过 anchor_text 在目标文件中唯一定位。\n"
        "新代码必须尽量贴合目标文件现有缩进、命名风格和框架习惯。\n"
        "如果需求不能稳定落地到当前上下文，应返回空 edits，并在 rationale 中说明原因。"
    )


def build_code_modification_user_prompt(
    *,
    project_name: str,
    page_name: str,
    page_path: str,
    frontend_root: str,
    documentation: PageDocumentation,
    user_request: str,
    context_text: str,
) -> str:
    """构造代码修改计划任务的用户提示词。"""
    return (
        f"项目名称：{project_name}\n"
        f"页面名称：{page_name}\n"
        f"页面路径：{page_path}\n"
        f"前端根目录：{frontend_root}\n\n"
        "下面是当前页面的结构化页面文档，请优先基于它理解页面：\n"
        f"{documentation.model_dump_json(indent=2)}\n\n"
        "下面是当前页面允许使用的关联上下文：\n"
        f"{context_text}\n\n"
        f"用户当前需求：{user_request}\n\n"
        "请返回一个结构化 CodeModificationPlan，要求：\n"
        "1. 只修改当前页面或其直接相关的前端文件\n"
        "2. edits 中每个 file_path 都必须是绝对路径\n"
        "3. action 仅可使用：insert_after、insert_before、replace、delete\n"
        "4. anchor_text 必须是目标文件中可唯一命中的连续文本\n"
        "5. 如果需求依赖不存在的后端能力，请优先做前端可演示版本，并在 rationale 中写清限制\n"
        "6. summary 必须是产品可直接读懂的中文\n"
        "7. 不要输出 Markdown，只返回结构化对象"
    )

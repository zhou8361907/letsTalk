"""Agent runtime package for page-centric requirement workflows.

这里避免在包初始化时直接导入 `runtime`，
否则会在 `llm.gateway -> agents.config -> agents.__init__ -> runtime -> code_agent -> llm.code_modifier -> llm.gateway`
这条链路里形成循环导入。
"""

from ai_requirement_os.agents.registry import build_default_agent_manifest

# 新增的模块（延迟导入以避免循环依赖）
# from .page_context import PageContext, PageSkill, PageInfo
# from .page_aware_agent import PageAwareAgent, StreamEvent, StreamEventType

__all__ = [
    "build_default_agent_manifest",
    # "PageContext",
    # "PageSkill", 
    # "PageInfo",
    # "PageAwareAgent",
    # "StreamEvent",
    # "StreamEventType",
]

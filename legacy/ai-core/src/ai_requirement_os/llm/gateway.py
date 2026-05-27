"""统一的 LLM 调用入口。

目标：
1. 所有模型都通过同一个入口取用
2. primary / planner / review 只是在配置和提示词上不同
3. provider 连接细节和业务调用细节分离
"""

from __future__ import annotations

from typing import Literal

from langchain_openai import ChatOpenAI

from ai_requirement_os.agents.config import AgentConfig, AgentModelConfig, load_agent_config
from ai_requirement_os.llm.providers import get_deepseek_llm

LLMRole = Literal["primary", "planner", "review"]


def get_model_config_by_role(config: AgentConfig, role: LLMRole) -> AgentModelConfig:
    """根据角色选择模型配置。

    后面如果你要让 planner / review 使用不同模型，这里就是统一开关点。
    """
    if role == "planner":
        return config.models.planner
    if role == "review":
        return config.models.review
    return config.models.primary


def get_llm_by_role(role: LLMRole, *, config: AgentConfig | None = None) -> ChatOpenAI:
    """返回指定角色对应的 LLM 客户端。

    当前统一走 DeepSeek OpenAI 兼容接口。
    即使后续 provider 扩展，也优先在这个入口里切换，而不是到处散写。
    """
    effective_config = config or load_agent_config()
    model_config = get_model_config_by_role(effective_config, role)

    if model_config.provider != "deepseek":
        raise RuntimeError(f"暂未支持的 provider: {model_config.provider}")

    return get_deepseek_llm(
        temperature=model_config.temperature,
        model=model_config.model,
        base_url=model_config.base_url,
    )

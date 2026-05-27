"""底层 provider 连接助手。

这里不处理任务角色、提示词、流程编排，只负责“如何连上模型服务”。
真正的业务入口请统一走 `llm.gateway`。
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI


def get_deepseek_llm(
    *,
    temperature: float = 0.2,
    model: str | None = None,
    base_url: str | None = None,
) -> ChatOpenAI:
    """创建 DeepSeek 的 LangChain 客户端。

    DeepSeek 提供 OpenAI 兼容接口，因此这里直接复用 `ChatOpenAI` 适配器。
    配置来源优先级：
    1. 显式传参
    2. `.env`
    3. 默认值
    """
    load_dotenv()

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError(
            "DEEPSEEK_API_KEY is missing. Copy .env.example -> .env and fill it."
        )

    resolved_model = model or os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    resolved_base_url = base_url or os.getenv(
        "DEEPSEEK_BASE_URL",
        "https://api.deepseek.com",
    )

    return ChatOpenAI(
        api_key=api_key,
        base_url=resolved_base_url,
        model=resolved_model,
        temperature=temperature,
    )

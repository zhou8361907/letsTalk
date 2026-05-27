"""LLM 配置工具"""

import os
from typing import Optional

from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from openai import RateLimitError, APIError

# 加载环境变量
load_dotenv()


def create_llm(
    model: Optional[str] = None,
    temperature: float = 0.0,
    max_tokens: int = 4000,
    max_retries: int = 3,
    **kwargs
) -> ChatOpenAI:
    """
    创建 LLM 实例，自动处理 DeepSeek 和 OpenAI 配置

    Args:
        model: 模型名称，默认从环境变量读取
        temperature: 温度参数
        max_tokens: 最大 token 数
        max_retries: 最大重试次数
        **kwargs: 其他参数

    Returns:
        ChatOpenAI 实例
    """
    # 优先使用 DeepSeek
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("DEEPSEEK_BASE_URL")
    model = model or os.getenv("DEEPSEEK_MODEL") or os.getenv("OPENAI_MODEL") or "deepseek-chat"

    llm_kwargs = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "max_retries": max_retries,  # OpenAI SDK 内置重试
        "timeout": 60.0,  # 60 秒超时
        **kwargs
    }

    if api_key:
        llm_kwargs["api_key"] = api_key

    if base_url:
        llm_kwargs["base_url"] = base_url

    return ChatOpenAI(**llm_kwargs)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((RateLimitError, APIError)),
    reraise=True,
)
def create_llm_with_retry(
    model: Optional[str] = None,
    temperature: float = 0.0,
    max_tokens: int = 4000,
    **kwargs
) -> ChatOpenAI:
    """
    创建 LLM 实例，带有外部重试机制（用于 503 等错误）

    Args:
        model: 模型名称
        temperature: 温度参数
        max_tokens: 最大 token 数
        **kwargs: 其他参数

    Returns:
        ChatOpenAI 实例
    """
    return create_llm(model, temperature, max_tokens, **kwargs)

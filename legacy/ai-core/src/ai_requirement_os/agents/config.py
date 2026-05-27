"""Agent 配置加载器。

约定：
1. `agent.toml` 负责运行时结构配置
2. `.env` 负责模型、密钥、默认路径等敏感或环境相关配置
3. 所有模型调用最终都应走统一的 LLM gateway
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore[no-redef]

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from ai_requirement_os.settings import PROJECT_ROOT


class AgentModelConfig(BaseModel):
    provider: str = "deepseek"
    model: str = "deepseek-chat"
    api_key_env: str = "DEEPSEEK_API_KEY"
    base_url: str = "https://api.deepseek.com"
    temperature: float = 0.0
    max_tokens: int = 8000


class AgentMemoryConfig(BaseModel):
    backend: str = "memory"
    persist_path: str = "./.agent/memory.json"
    enable_user_memory: bool = True
    enable_project_memory: bool = True
    enable_page_memory: bool = True


class AgentRuntimeConfig(BaseModel):
    max_turns: int = 16
    enable_background_tasks: bool = True
    enable_sub_agents: bool = True
    enable_message_normalization: bool = True
    enable_context_compression: bool = False


class AgentPathsConfig(BaseModel):
    frontend_root: str = ""
    backend_root: str = ""
    default_page: str = ""


class AgentSandboxConfig(BaseModel):
    renderer: str = "runtime_schema"
    floating_requirement_input: bool = True
    sandbox_base_url: str = "http://localhost:8080"


class AgentIdentityConfig(BaseModel):
    name: str = "page-requirement-agent"
    mode: str = "interactive"
    workspace_root: str = PROJECT_ROOT.as_posix()


class AgentModelsBundle(BaseModel):
    primary: AgentModelConfig = Field(default_factory=AgentModelConfig)
    review: AgentModelConfig = Field(default_factory=AgentModelConfig)
    planner: AgentModelConfig = Field(default_factory=AgentModelConfig)


class AgentConfig(BaseModel):
    agent: AgentIdentityConfig = Field(default_factory=AgentIdentityConfig)
    models: AgentModelsBundle = Field(default_factory=AgentModelsBundle)
    memory: AgentMemoryConfig = Field(default_factory=AgentMemoryConfig)
    runtime: AgentRuntimeConfig = Field(default_factory=AgentRuntimeConfig)
    tools: dict[str, list[str]] = Field(default_factory=lambda: {"enabled": []})
    sandbox: AgentSandboxConfig = Field(default_factory=AgentSandboxConfig)
    paths: AgentPathsConfig = Field(default_factory=AgentPathsConfig)


DEFAULT_AGENT_CONFIG_PATH = PROJECT_ROOT / "config" / "agent.toml"
DEFAULT_AGENT_EXAMPLE_PATH = PROJECT_ROOT / "config" / "agent.example.toml"


def load_agent_config(path: Path | None = None) -> AgentConfig:
    """读取 agent 配置，并将 .env 中的可变项覆盖进去。"""
    load_dotenv()
    config_path = path or DEFAULT_AGENT_CONFIG_PATH
    if not config_path.exists():
        return _apply_env_overrides(AgentConfig())
    raw = tomllib.loads(config_path.read_text(encoding="utf-8"))
    return _apply_env_overrides(AgentConfig(**raw))


def _apply_env_overrides(config: AgentConfig) -> AgentConfig:
    """用 .env 覆盖运行时中的模型和默认路径。

    这样做的目的是：
    - 让敏感信息不写进 agent.toml
    - 让切换模型和路径时不必改代码
    """
    config.models.primary.model = os.getenv("DEEPSEEK_MODEL", config.models.primary.model)
    config.models.primary.base_url = os.getenv(
        "DEEPSEEK_BASE_URL",
        config.models.primary.base_url,
    )
    config.models.review.model = os.getenv("DEEPSEEK_MODEL", config.models.review.model)
    config.models.review.base_url = os.getenv(
        "DEEPSEEK_BASE_URL",
        config.models.review.base_url,
    )
    config.models.planner.model = os.getenv("DEEPSEEK_MODEL", config.models.planner.model)
    config.models.planner.base_url = os.getenv(
        "DEEPSEEK_BASE_URL",
        config.models.planner.base_url,
    )
    config.paths.frontend_root = os.getenv("AIRO_FRONTEND_ROOT", config.paths.frontend_root)
    config.paths.backend_root = os.getenv("AIRO_BACKEND_ROOT", config.paths.backend_root)
    config.paths.default_page = os.getenv("AIRO_DEFAULT_PAGE", config.paths.default_page)
    config.sandbox.sandbox_base_url = os.getenv(
        "AIRO_SANDBOX_BASE_URL",
        config.sandbox.sandbox_base_url,
    )
    return config

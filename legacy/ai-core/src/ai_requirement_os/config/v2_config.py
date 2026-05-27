"""V2 系统配置"""

from pydantic import BaseModel, Field


class V2Config(BaseModel):
    """V2 系统配置"""

    # LLM 配置
    llm_model: str = Field(default="deepseek-chat", description="LLM 模型名称")
    llm_temperature: float = Field(default=0.0, description="LLM 温度参数")
    llm_max_tokens: int = Field(default=4000, description="LLM 最大 token 数")

    # Agent 配置
    max_iterations: int = Field(default=15, description="Agent 最大迭代次数")
    max_tool_calls: int = Field(default=20, description="最大工具调用次数")
    complexity_threshold: int = Field(default=60, description="复杂度阈值")
    max_trace_depth: int = Field(default=2, description="最大追踪深度")

    # 并发配置
    max_concurrent_tasks: int = Field(default=5, description="最大并发任务数")
    task_timeout: int = Field(default=30, description="任务超时时间（秒）")

    # 缓存配置
    enable_cache: bool = Field(default=True, description="是否启用缓存")
    cache_ttl: int = Field(default=3600, description="缓存过期时间（秒）")

    # 记忆配置
    enable_memory: bool = Field(default=True, description="是否启用记忆系统")
    vector_db_path: str = Field(default="./.memory/chroma", description="向量数据库路径")

    # 路径配置
    backend_path: str = Field(default="", description="后端代码路径")
    frontend_path: str = Field(default="", description="前端代码路径")

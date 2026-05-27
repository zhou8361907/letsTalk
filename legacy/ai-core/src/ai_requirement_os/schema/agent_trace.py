"""Agent 执行追踪数据模型。

用于记录和展示 Agent 分析页面的完整过程，包括：
- 每个步骤的思考过程
- 工具调用记录
- 读取的文件列表
- 执行时间统计
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolCallRecord(BaseModel):
    """单次工具调用记录"""

    tool_name: str = Field(description="工具名称")
    arguments: dict[str, Any] = Field(default_factory=dict, description="工具参数")
    result_summary: str = Field(default="", description="结果摘要")
    timestamp: datetime = Field(description="调用时间")
    duration_ms: int = Field(default=0, description="执行耗时（毫秒）")
    success: bool = Field(default=True, description="是否成功")
    error_message: str | None = Field(default=None, description="错误信息")


class AgentThinkingStep(BaseModel):
    """Agent 思考步骤"""

    step_number: int = Field(description="步骤编号")
    step_type: Literal["planning", "tool_call", "reasoning", "conclusion", "evidence"] = Field(
        description="步骤类型"
    )
    content: str = Field(description="步骤内容描述")
    tool_calls: list[ToolCallRecord] = Field(default_factory=list, description="该步骤中的工具调用")
    timestamp: datetime = Field(description="步骤开始时间")
    details: dict[str, Any] = Field(default_factory=dict, description="额外的详细信息")


class AgentAnalysisTrace(BaseModel):
    """完整的 Agent 分析追踪"""

    trace_id: str = Field(description="追踪 ID")
    project_name: str = Field(description="项目名称")
    page_path: str = Field(description="页面路径")
    started_at: datetime = Field(description="开始时间")
    completed_at: datetime | None = Field(default=None, description="完成时间")
    status: Literal["running", "completed", "failed"] = Field(
        default="running", description="执行状态"
    )

    # 分析步骤
    steps: list[AgentThinkingStep] = Field(default_factory=list, description="执行步骤列表")

    # 统计信息
    total_tool_calls: int = Field(default=0, description="总工具调用次数")
    files_read: list[str] = Field(default_factory=list, description="读取的文件列表")
    apis_traced: list[str] = Field(default_factory=list, description="追踪的 API 列表")
    total_duration_ms: int = Field(default=0, description="总耗时（毫秒）")

    # 最终产物
    final_result: dict[str, Any] | None = Field(default=None, description="最终分析结果")
    error: str | None = Field(default=None, description="错误信息")

    # 元数据
    model_name: str = Field(default="", description="使用的模型名称")
    mode: str = Field(default="", description="执行模式")


class StreamEvent(BaseModel):
    """流式输出事件"""

    event: Literal["start", "step", "tool_call", "complete", "error"] = Field(
        description="事件类型"
    )
    timestamp: datetime = Field(description="事件时间")
    content: str = Field(default="", description="事件内容")
    data: dict[str, Any] = Field(default_factory=dict, description="附加数据")

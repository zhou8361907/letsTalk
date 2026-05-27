"""Codex-like interactive harness with tool-use loop for page agents."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from ai_requirement_os.agents.control_plane import LoopState, MessageRecord, ToolCallRecord
from ai_requirement_os.agents.models import AgentSession
from ai_requirement_os.agents.tooling import ToolRegistry
from ai_requirement_os.parser.project_source import SourceProjectConfig


def now_utc() -> datetime:
    return datetime.now(UTC)


class AgentToolCall(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class AgentLoopDecision(BaseModel):
    reasoning: str = ""
    assistant_response: str = ""
    tool_calls: list[AgentToolCall] = Field(default_factory=list)
    done: bool = False


class AgentRunRequest(BaseModel):
    user_prompt: str
    config: SourceProjectConfig | None = None
    project_name: str | None = None
    page_path: str | None = None
    system_prompt: str | None = None
    max_turns: int | None = None


class ToolExecutionContext(BaseModel):
    session_id: str
    project_name: str | None = None
    page_path: str | None = None
    config: SourceProjectConfig | None = None


class AgentToolResult(BaseModel):
    tool_use_id: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    ok: bool = True
    result: Any = None
    error: str = ""


class AgentRunStep(BaseModel):
    turn: int
    reasoning: str = ""
    assistant_response: str = ""
    tool_calls: list[AgentToolCall] = Field(default_factory=list)
    tool_results: list[AgentToolResult] = Field(default_factory=list)
    done: bool = False


class AgentRunDebugInfo(BaseModel):
    system_prompt: str = ""
    user_prompt: str = ""
    runtime_context: dict[str, Any] = Field(default_factory=dict)


class AgentStreamEvent(BaseModel):
    event: str
    turn: int = 0
    message: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=now_utc)


class AgentRunResult(BaseModel):
    session: AgentSession
    state: LoopState
    steps: list[AgentRunStep] = Field(default_factory=list)
    final_answer: str = ""
    status: str = "completed"
    model: str = ""
    warnings: list[str] = Field(default_factory=list)
    debug: AgentRunDebugInfo = Field(default_factory=AgentRunDebugInfo)


def build_codex_style_system_prompt(tool_registry: ToolRegistry) -> str:
    tool_lines = []
    for spec in tool_registry.list_specs():
        tool_lines.append(
            f"- {spec.name}: {spec.description} | input_schema={json.dumps(spec.input_schema, ensure_ascii=False)}"
        )
    return (
        "你是 AI Requirement OS 里的页面智能体，工作方式要像一个稳健的 codex agent。\n"
        "你可以在一个循环里观察、思考、调用工具、读取结果、再继续推进。\n"
        "你的目标不是空谈，而是通过多步工具调用把任务做成。\n"
        "你必须遵守：\n"
        "1. 能通过工具确认的事实，不要凭空猜。\n"
        "2. 优先做最小但有效的下一步，不要一口气乱调用很多工具。\n"
        "3. 如果已经拿到足够证据，就直接完成，不要无休止探索。\n"
        "4. 除非用户明确要求执行代码修改，否则优先做分析、定位、规划和预览。\n"
        "5. 如果信息不足，就调用最合适的工具补证据。\n"
        "6. 你的输出必须是一个合法 JSON 对象，不能带 markdown 代码块、解释性前后缀或额外文本。\n"
        "7. JSON 结构必须严格是："
        '{"reasoning":"","assistant_response":"","tool_calls":[{"tool_name":"","arguments":{}}],"done":false}\n'
        "8. 涉及页面业务地图、接口链路、后端入口时，优先调用 get_page_lineage_evidence；"
        "只有在证据包不够时，再去读 page workspace 或原始文件。\n"
        "可用工具如下：\n"
        f"{chr(10).join(tool_lines)}"
    )


def serialize_message_content(content: Any, *, max_chars: int = 12000) -> str:
    if isinstance(content, str):
        text = content
    else:
        text = json.dumps(content, ensure_ascii=False, indent=2, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n..."


def build_loop_messages(state: LoopState) -> list[tuple[str, str]]:
    messages: list[tuple[str, str]] = []
    for message in state.messages:
        role = message.role
        content = serialize_message_content(message.content)
        if role == "tool":
            role = "user"
            content = f"[tool_result from {message.source or 'tool'}]\n{content}"
        messages.append((role, content))
    return messages


def record_tool_calls(state: LoopState, tool_calls: list[AgentToolCall]) -> None:
    state.pending_tool_calls = [
        ToolCallRecord(
            tool_use_id=f"tool_{uuid4().hex[:8]}",
            tool_name=tool_call.tool_name,
            input=tool_call.arguments,
        )
        for tool_call in tool_calls
    ]


def append_assistant_message(state: LoopState, decision: AgentLoopDecision) -> None:
    state.messages.append(
        MessageRecord(
            role="assistant",
            source="agent",
            content={
                "reasoning": decision.reasoning,
                "assistant_response": decision.assistant_response,
                "tool_calls": [tool_call.model_dump(mode="json") for tool_call in decision.tool_calls],
                "done": decision.done,
            },
        )
    )


def append_tool_message(state: LoopState, result: AgentToolResult) -> None:
    state.messages.append(
        MessageRecord(
            role="tool",
            source=result.tool_name,
            content=result.model_dump(mode="json"),
        )
    )

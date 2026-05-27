"""Explicit loop/control-plane structures for the agent runtime."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TransitionReason = Literal[
    "user_input",
    "tool_result",
    "background_notification",
    "sub_agent_result",
    "task_state_change",
    "completed",
]


class MessageRecord(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: Any
    source: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ToolCallRecord(BaseModel):
    tool_use_id: str
    tool_name: str
    input: dict[str, Any] = Field(default_factory=dict)


class NotificationRecord(BaseModel):
    notification_id: str
    kind: Literal["task", "background", "sub_agent", "memory"]
    title: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LoopState(BaseModel):
    session_id: str
    messages: list[MessageRecord] = Field(default_factory=list)
    turn_count: int = 1
    transition_reason: TransitionReason = "user_input"
    pending_tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    pending_notifications: list[NotificationRecord] = Field(default_factory=list)

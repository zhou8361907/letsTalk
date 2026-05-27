"""Core agent models and contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

MemoryScope = Literal["turn", "page", "project", "global"]
TaskStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
TaskKind = Literal[
    "read_code",
    "build_page_doc",
    "build_page_ir",
    "build_sandbox",
    "review_change",
    "apply_schema_patch",
    "sync_frontend",
    "plan_code_modification",
    "apply_code_modification",
    "revert_code_modification",
]
ToolKind = Literal["parser", "llm", "sandbox", "diff", "memory", "task", "sub_agent", "code", "file"]
AgentMode = Literal["interactive", "background", "sub_agent"]


class AgentTool(BaseModel):
    name: str
    kind: ToolKind
    description: str
    enabled: bool = True


class AgentMemoryEntry(BaseModel):
    scope: MemoryScope
    key: str
    value: str
    summary: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentTask(BaseModel):
    task_id: str
    title: str
    kind: TaskKind
    status: TaskStatus = "queued"
    page_path: str | None = None
    detail: str | None = None
    result_summary: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentCapability(BaseModel):
    key: str
    description: str
    current_state: Literal["active", "scaffolded", "planned"]


class AgentManifest(BaseModel):
    agent_key: str
    name: str
    purpose: str
    mode: AgentMode
    responsibilities: list[str] = Field(default_factory=list)
    capabilities: list[AgentCapability] = Field(default_factory=list)
    tools: list[AgentTool] = Field(default_factory=list)
    memory_scopes: list[MemoryScope] = Field(default_factory=list)
    extensibility_notes: list[str] = Field(default_factory=list)
    loop_contract: list[str] = Field(default_factory=list)


class AgentSession(BaseModel):
    session_id: str
    page_path: str | None = None
    project_name: str | None = None
    mode: AgentMode = "interactive"
    active_tasks: list[AgentTask] = Field(default_factory=list)
    memories: list[AgentMemoryEntry] = Field(default_factory=list)

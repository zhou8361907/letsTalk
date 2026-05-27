"""High-level composition root for the page agent runtime.

`AgentRuntime` should stay small. It wires together persistent dependencies and
delegates two complex areas to dedicated mixins:

- `AgentRuntimeToolsMixin`: the tool surface the agent can call
- `AgentRuntimeRunnerMixin`: the multi-turn planning/execution loop
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from ai_requirement_os.agents.code_agent import CodeAgent
from ai_requirement_os.agents.config import AgentConfig, load_agent_config
from ai_requirement_os.agents.control_plane import LoopState, MessageRecord
from ai_requirement_os.agents.memory import AgentMemoryStore
from ai_requirement_os.agents.models import AgentMemoryEntry, AgentSession, AgentTask
from ai_requirement_os.agents.registry import build_default_agent_manifest
from ai_requirement_os.agents.runtime_runner import AgentRuntimeRunnerMixin
from ai_requirement_os.agents.runtime_tools import AgentRuntimeToolsMixin
from ai_requirement_os.agents.tasks import AgentTaskQueue
from ai_requirement_os.agents.tooling import ToolRegistry


class AgentRuntime(AgentRuntimeToolsMixin, AgentRuntimeRunnerMixin):
    """Top-level runtime shell for agent-centric page analysis work."""

    def __init__(self) -> None:
        self.config: AgentConfig = load_agent_config()
        self.manifest = build_default_agent_manifest()
        self.memory = AgentMemoryStore()
        self.tasks = AgentTaskQueue()
        self.tools = ToolRegistry()
        self.code_agent = CodeAgent()
        self._register_default_tools()

    def start_session(
        self,
        project_name: str | None = None,
        page_path: str | None = None,
    ) -> AgentSession:
        """Create a fresh agent session snapshot for one interactive run."""
        return AgentSession(
            session_id=str(uuid4()),
            project_name=project_name,
            page_path=page_path,
            mode=self.manifest.mode,
            active_tasks=self.tasks.list_all(),
            memories=self.memory.list_scope("page") if page_path else [],
        )

    def init_loop_state(
        self,
        session_id: str,
        user_prompt: str,
        system_prompt: str | None = None,
    ) -> LoopState:
        """Build the initial message history that seeds the multi-turn loop."""
        messages: list[MessageRecord] = []
        if system_prompt:
            messages.append(MessageRecord(role="system", content=system_prompt, source="agent"))
        messages.append(MessageRecord(role="user", content=user_prompt, source="user"))
        return LoopState(session_id=session_id, messages=messages)

    def remember(
        self,
        scope: str,
        key: str,
        value: str,
        summary: str | None = None,
    ) -> AgentMemoryEntry:
        """Persist one memory fact so later turns or sessions can reuse it."""
        now = datetime.now(UTC)
        entry = AgentMemoryEntry(
            scope=scope,  # type: ignore[arg-type]
            key=key,
            value=value,
            summary=summary,
            created_at=now,
            updated_at=now,
        )
        return self.memory.upsert(entry)

    def queue_task(
        self,
        title: str,
        kind: str,
        page_path: str | None = None,
        detail: str | None = None,
    ) -> AgentTask:
        """Store a follow-up task the runtime can surface in later sessions."""
        now = datetime.now(UTC)
        task = AgentTask(
            task_id=str(uuid4()),
            title=title,
            kind=kind,  # type: ignore[arg-type]
            page_path=page_path,
            detail=detail,
            created_at=now,
            updated_at=now,
        )
        return self.tasks.push(task)

"""Task queue primitives for agent orchestration."""

from __future__ import annotations

from collections import deque
from datetime import UTC, datetime

from ai_requirement_os.agents.models import AgentTask


class AgentTaskQueue:
    """Minimal queue that supports future promotion to async/background workers."""

    def __init__(self) -> None:
        self._queue: deque[AgentTask] = deque()

    def push(self, task: AgentTask) -> AgentTask:
        self._queue.append(task)
        return task

    def pop(self) -> AgentTask | None:
        if not self._queue:
            return None
        task = self._queue.popleft()
        task.updated_at = datetime.now(UTC)
        return task

    def list_all(self) -> list[AgentTask]:
        return list(self._queue)

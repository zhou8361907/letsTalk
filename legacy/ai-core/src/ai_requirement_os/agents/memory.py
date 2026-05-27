"""Simple extensible memory store for the agent runtime."""

from __future__ import annotations

from collections import defaultdict

from ai_requirement_os.agents.models import AgentMemoryEntry, MemoryScope


class AgentMemoryStore:
    """In-memory store that can later be replaced with durable backends."""

    def __init__(self) -> None:
        self._items: dict[MemoryScope, dict[str, AgentMemoryEntry]] = defaultdict(dict)

    def upsert(self, entry: AgentMemoryEntry) -> AgentMemoryEntry:
        self._items[entry.scope][entry.key] = entry
        return entry

    def get(self, scope: MemoryScope, key: str) -> AgentMemoryEntry | None:
        return self._items.get(scope, {}).get(key)

    def list_scope(self, scope: MemoryScope) -> list[AgentMemoryEntry]:
        return list(self._items.get(scope, {}).values())

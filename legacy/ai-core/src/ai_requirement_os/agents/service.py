"""Application-facing helpers for agent runtime access."""

from functools import lru_cache

from ai_requirement_os.agents.runtime import AgentRuntime


@lru_cache(maxsize=1)
def get_agent_runtime() -> AgentRuntime:
    return AgentRuntime()

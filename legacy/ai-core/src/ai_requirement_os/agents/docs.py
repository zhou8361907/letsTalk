"""Lightweight architecture notes for the agent subsystem.

This file is intentionally code-adjacent instead of a detached wiki so future
refactors can keep the conceptual model near the implementation.
"""

AGENT_ARCHITECTURE_OVERVIEW = """
Agent subsystem layout:

1. runtime.py
   - composition root
   - owns long-lived dependencies
   - creates sessions, loop state, memory, and task snapshots

2. runtime_tools.py
   - default tool registrations
   - concrete tool handlers used by the main loop

3. runtime_runner.py
   - codex-style loop
   - LLM decision -> tool calls -> tool results -> completion events
   - powers both sync runs and SSE streaming runs

4. harness.py
   - pydantic models and prompt helpers shared by the runtime loop
"""

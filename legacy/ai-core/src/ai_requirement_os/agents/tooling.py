"""Tool registry abstractions for the agent control plane."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel


class ToolSpec(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


class ToolRegistry:
    """Minimal dispatch map aligned with a stable agent loop."""

    def __init__(self) -> None:
        self._specs: dict[str, ToolSpec] = {}
        self._handlers: dict[str, Callable[..., Any]] = {}

    def register(self, spec: ToolSpec, handler: Callable[..., Any]) -> None:
        self._specs[spec.name] = spec
        self._handlers[spec.name] = handler

    def get_handler(self, tool_name: str) -> Callable[..., Any] | None:
        return self._handlers.get(tool_name)

    def get_spec(self, tool_name: str) -> ToolSpec | None:
        return self._specs.get(tool_name)

    def list_specs(self) -> list[ToolSpec]:
        return list(self._specs.values())

    def invoke(self, tool_name: str, payload: dict[str, Any], *, context: Any | None = None) -> Any:
        handler = self._handlers[tool_name]
        try:
            return handler(context=context, **payload)
        except TypeError as exc:
            if "unexpected keyword argument 'context'" not in str(exc):
                raise
            return handler(**payload)

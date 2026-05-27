"""Tool registration and tool-handler implementations for the agent runtime.

This module keeps the runtime's tool surface in one place so later V1/V2 work
can evolve tools independently from the orchestration loop.
"""

from __future__ import annotations

import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from ai_requirement_os.agents.harness import ToolExecutionContext
from ai_requirement_os.agents.tooling import ToolSpec
from ai_requirement_os.llm.page_lineage_generator import build_page_lineage_evidence_bundle
from ai_requirement_os.parser.backend_trace import read_java_method
from ai_requirement_os.parser.page_analysis import get_or_create_page_analysis
from ai_requirement_os.parser.project_source import SourceProjectConfig


class AgentRuntimeToolsMixin:
    """Attach the default toolset used by the page-scoped agent loop.

    The main runtime owns shared dependencies such as `code_agent`, `memory`,
    `tools`, and `config`. This mixin only provides the default registrations
    and the concrete tool handlers.
    """

    def _register_default_tools(self) -> None:
        self.tools.register(
            ToolSpec(
                name="read_file",
                description="Read a UTF-8 text file from the target project.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "max_chars": {"type": "integer"},
                    },
                    "required": ["path"],
                },
            ),
            self._tool_read_file,
        )
        self.tools.register(
            ToolSpec(
                name="search_project_files",
                description="Search text in project files with ripgrep and return compact matches.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "root_path": {"type": "string"},
                        "max_results": {"type": "integer"},
                    },
                    "required": ["query"],
                },
            ),
            self._tool_search_project_files,
        )
        self.tools.register(
            ToolSpec(
                name="get_page_workspace",
                description="Load the page-scoped workspace assembled from frontend and backend context.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "page_path": {"type": "string"},
                        "refresh": {"type": "boolean"},
                    },
                },
            ),
            self._tool_get_page_workspace,
        )
        self.tools.register(
            ToolSpec(
                name="get_page_lineage_evidence",
                description="Build the pruned Evidence Bundle for the current page.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "page_path": {"type": "string"},
                        "refresh": {"type": "boolean"},
                    },
                },
            ),
            self._tool_get_page_lineage_evidence,
        )
        self.tools.register(
            ToolSpec(
                name="read_java_method",
                description="Read one Java method by class + method + signature instead of fixed line number.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string"},
                        "class_name": {"type": "string"},
                        "method_name": {"type": "string"},
                        "method_signature": {"type": "string"},
                    },
                    "required": ["file_path", "class_name", "method_name"],
                },
            ),
            self._tool_read_java_method,
        )
        self.tools.register(
            ToolSpec(
                name="remember_fact",
                description="Store a memory entry for later turns or later sessions.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "scope": {"type": "string"},
                        "key": {"type": "string"},
                        "value": {"type": "string"},
                        "summary": {"type": "string"},
                    },
                    "required": ["scope", "key", "value"],
                },
            ),
            self._tool_remember_fact,
        )
        self.tools.register(
            ToolSpec(
                name="plan_code_modification",
                description="Create a code modification plan for a page request.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "page_path": {"type": "string"},
                        "user_request": {"type": "string"},
                    },
                    "required": ["user_request"],
                },
            ),
            self._tool_plan_code_modification,
        )
        self.tools.register(
            ToolSpec(
                name="preview_code_modification",
                description="Preview a code modification plan as unified diff.",
                input_schema={"type": "object", "properties": {"plan_id": {"type": "string"}}, "required": ["plan_id"]},
            ),
            self.code_agent.preview,
        )
        self.tools.register(
            ToolSpec(
                name="apply_code_modification",
                description="Apply a reviewed code modification plan. Use only when the user explicitly asks to execute changes.",
                input_schema={
                    "type": "object",
                    "properties": {"plan_id": {"type": "string"}},
                    "required": ["plan_id"],
                },
            ),
            self._tool_apply_code_modification,
        )
        self.tools.register(
            ToolSpec(
                name="revert_code_modification",
                description="Revert an applied code modification plan with git revert. Use only when the user explicitly asks for rollback.",
                input_schema={
                    "type": "object",
                    "properties": {"plan_id": {"type": "string"}},
                    "required": ["plan_id"],
                },
            ),
            self._tool_revert_code_modification,
        )

    def _tool_read_file(
        self,
        *,
        path: str,
        max_chars: int = 6000,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        file_path = Path(path).expanduser().resolve()
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        return {
            "path": file_path.as_posix(),
            "content": content[:max_chars],
            "truncated": len(content) > max_chars,
        }

    def _tool_search_project_files(
        self,
        *,
        query: str,
        root_path: str | None = None,
        max_results: int = 20,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        root = root_path or (
            context.config.frontend_path if context and context.config and context.config.frontend_path else None
        ) or (
            context.config.backend_path if context and context.config and context.config.backend_path else None
        ) or self.config.agent.workspace_root
        result = subprocess.run(
            ["rg", "-n", "--no-heading", "--color", "never", query, root],
            text=True,
            capture_output=True,
        )
        lines = [line for line in result.stdout.splitlines() if line.strip()][:max_results]
        matches = []
        for line in lines:
            match = re.match(r"^(.*?):(\d+):(.*)$", line)
            if not match:
                continue
            matches.append(
                {
                    "path": match.group(1),
                    "line_number": int(match.group(2)),
                    "line_text": match.group(3).strip(),
                }
            )
        return {"root_path": root, "query": query, "matches": matches}

    def _resolve_config_and_page(
        self,
        context: ToolExecutionContext | None,
        page_path: str | None = None,
    ) -> tuple[SourceProjectConfig, str]:
        if context is None or context.config is None:
            raise ValueError("This tool requires SourceProjectConfig in the current agent run context.")
        effective_page = page_path or context.page_path
        if not effective_page:
            raise ValueError("This tool requires page_path.")
        return context.config, effective_page

    def _tool_get_page_workspace(
        self,
        *,
        page_path: str | None = None,
        refresh: bool = False,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        config, effective_page = self._resolve_config_and_page(context, page_path)
        workspace = get_or_create_page_analysis(config, effective_page, refresh=refresh).asset.workspace
        return workspace.model_dump(mode="json")

    def _tool_get_page_lineage_evidence(
        self,
        *,
        page_path: str | None = None,
        refresh: bool = False,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        config, effective_page = self._resolve_config_and_page(context, page_path)
        workspace = get_or_create_page_analysis(config, effective_page, refresh=refresh).asset.workspace
        bundle = build_page_lineage_evidence_bundle(workspace)
        return bundle.model_dump(mode="json")

    def _tool_read_java_method(
        self,
        *,
        file_path: str,
        class_name: str,
        method_name: str,
        method_signature: str = "",
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        method = read_java_method(
            file_path=file_path,
            class_name=class_name,
            method_name=method_name,
            method_signature=method_signature,
        )
        if method is None:
            raise ValueError("Java method not found with the provided semantic locator.")
        return {
            "class_name": method.class_name,
            "method_name": method.method_name,
            "method_signature": method.method_signature,
            "file_path": method.file_path,
            "line_number_hint": method.line_number_hint,
            "annotations": method.annotations,
            "method_text": method.method_text,
        }

    def _tool_remember_fact(
        self,
        *,
        scope: str,
        key: str,
        value: str,
        summary: str = "",
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        entry = self.remember(scope=scope, key=key, value=value, summary=summary or None)
        return entry.model_dump(mode="json")

    def _tool_plan_code_modification(
        self,
        *,
        user_request: str,
        page_path: str | None = None,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        config, effective_page = self._resolve_config_and_page(context, page_path)
        plan = self.code_agent.plan(config, effective_page, user_request)
        return plan.model_dump(mode="json")

    def _tool_apply_code_modification(
        self,
        *,
        plan_id: str,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        if context is None or context.config is None:
            raise ValueError("apply_code_modification requires SourceProjectConfig in run context.")
        result = self.code_agent.apply(plan_id, context.config)
        return result.model_dump(mode="json")

    def _tool_revert_code_modification(
        self,
        *,
        plan_id: str,
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        if context is None or context.config is None:
            raise ValueError("revert_code_modification requires SourceProjectConfig in run context.")
        result = self.code_agent.revert(plan_id, context.config)
        return result.model_dump(mode="json")

    def _normalize_tool_result(self, value: Any) -> Any:
        """Coerce tool outputs into JSON-safe values for prompts, logs, and SSE."""
        if isinstance(value, BaseModel):
            return value.model_dump(mode="json")
        if isinstance(value, dict):
            return {str(key): self._normalize_tool_result(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._normalize_tool_result(item) for item in value]
        if isinstance(value, tuple):
            return [self._normalize_tool_result(item) for item in value]
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

"""Execution loop for the page agent runtime.

The runtime object still owns long-lived dependencies and session state, but
the multi-turn LLM/tool loop lives here so it can evolve as a first-class
subsystem for V1 late-stage work and V2 agent-centric work.
"""

from __future__ import annotations

import logging
import re

from ai_requirement_os.agents.control_plane import LoopState, MessageRecord
from ai_requirement_os.agents.harness import (
    AgentLoopDecision,
    AgentRunDebugInfo,
    AgentRunRequest,
    AgentRunResult,
    AgentRunStep,
    AgentStreamEvent,
    AgentToolResult,
    ToolExecutionContext,
    append_assistant_message,
    append_tool_message,
    build_codex_style_system_prompt,
    build_loop_messages,
    record_tool_calls,
)
from ai_requirement_os.agents.models import AgentSession
from ai_requirement_os.llm.gateway import get_llm_by_role

logger = logging.getLogger(__name__)


class AgentRuntimeRunnerMixin:
    """Provide the codex-style planning/execution/tool loop for the runtime."""

    def _extract_json_object(self, text: str) -> str:
        fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
        if fenced_match:
            return fenced_match.group(1)
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return text[start : end + 1]
        raise ValueError("Model did not return a JSON object.")

    def _invoke_loop_decision(self, state: LoopState) -> AgentLoopDecision:
        llm = get_llm_by_role("primary", config=self.config)
        response = llm.invoke(build_loop_messages(state))
        content = response.content if isinstance(response.content, str) else str(response.content)
        json_text = self._extract_json_object(content)
        return AgentLoopDecision.model_validate_json(json_text)

    def _build_run_result(
        self,
        *,
        session: AgentSession,
        state: LoopState,
        steps: list[AgentRunStep],
        final_answer: str,
        status: str,
        model_name: str,
        warnings: list[str],
        system_prompt: str,
        user_prompt: str,
        runtime_context_payload: dict[str, object],
    ) -> AgentRunResult:
        # Refresh task/memory snapshots at the end so the UI sees the final state
        # of the runtime, not just the state from when the session started.
        session.active_tasks = self.tasks.list_all()
        session.memories = self.memory.list_scope("page") if session.page_path else []
        return AgentRunResult(
            session=session,
            state=state,
            steps=steps,
            final_answer=final_answer,
            status=status,
            model=model_name,
            warnings=warnings,
            debug=AgentRunDebugInfo(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                runtime_context=runtime_context_payload,
            ),
        )

    def stream_agent_run(self, request: AgentRunRequest):
        """Yield live execution events for the frontend trace panel and logs."""
        effective_project_name = request.project_name or (request.config.project_name if request.config else None)
        effective_page_path = request.page_path
        system_prompt = request.system_prompt or build_codex_style_system_prompt(self.tools)
        runtime_context_payload = {
            "project_name": effective_project_name,
            "page_path": effective_page_path,
            "frontend_path": request.config.frontend_path if request.config else "",
            "backend_path": request.config.backend_path if request.config else "",
            "note": "These runtime context fields are already confirmed and can be used directly.",
        }

        session = self.start_session(
            project_name=effective_project_name,
            page_path=effective_page_path,
        )
        state = self.init_loop_state(
            session.session_id,
            user_prompt=request.user_prompt,
            system_prompt=system_prompt,
        )
        state.messages.append(
            MessageRecord(
                role="user",
                source="runtime_context",
                content=runtime_context_payload,
            )
        )

        llm = get_llm_by_role("primary", config=self.config)
        model_name = str(getattr(llm, "model_name", self.config.models.primary.model))
        max_turns = request.max_turns or self.config.runtime.max_turns
        warnings: list[str] = []
        steps: list[AgentRunStep] = []
        tool_context = ToolExecutionContext(
            session_id=session.session_id,
            project_name=session.project_name,
            page_path=effective_page_path,
            config=request.config,
        )

        yield AgentStreamEvent(
            event="run_started",
            message="Agent run started.",
            payload={
                "session_id": session.session_id,
                "project_name": effective_project_name,
                "page_path": effective_page_path,
                "max_turns": max_turns,
                "model": model_name,
                "debug": {
                    "system_prompt": system_prompt,
                    "user_prompt": request.user_prompt,
                    "runtime_context": runtime_context_payload,
                },
            },
        )

        for turn in range(1, max_turns + 1):
            state.turn_count = turn
            yield AgentStreamEvent(
                event="turn_started",
                turn=turn,
                message=f"Turn {turn} started.",
            )

            decision = self._invoke_loop_decision(state)
            logger.info(
                "agent_turn_decision session=%s turn=%s done=%s tool_calls=%s reasoning=%s",
                session.session_id,
                turn,
                decision.done,
                [item.tool_name for item in decision.tool_calls],
                decision.reasoning,
            )
            yield AgentStreamEvent(
                event="decision",
                turn=turn,
                message="Model returned the next-step decision.",
                payload={
                    "reasoning": decision.reasoning,
                    "assistant_response": decision.assistant_response,
                    "tool_calls": [item.model_dump(mode="json") for item in decision.tool_calls],
                    "done": decision.done,
                },
            )

            # Keep one turn bounded so trace display and prompt growth remain
            # manageable during interactive workbench sessions.
            if len(decision.tool_calls) > 3:
                decision.tool_calls = decision.tool_calls[:3]
            record_tool_calls(state, decision.tool_calls)
            append_assistant_message(state, decision)

            step = AgentRunStep(
                turn=turn,
                reasoning=decision.reasoning,
                assistant_response=decision.assistant_response,
                tool_calls=decision.tool_calls,
                done=decision.done,
            )

            for pending_call in state.pending_tool_calls:
                yield AgentStreamEvent(
                    event="tool_call_started",
                    turn=turn,
                    message=f"Calling tool {pending_call.tool_name}.",
                    payload={
                        "tool_use_id": pending_call.tool_use_id,
                        "tool_name": pending_call.tool_name,
                        "arguments": pending_call.input,
                    },
                )
                try:
                    logger.info(
                        "agent_tool_call session=%s turn=%s tool=%s input=%s",
                        session.session_id,
                        turn,
                        pending_call.tool_name,
                        pending_call.input,
                    )
                    tool_output = self.tools.invoke(
                        pending_call.tool_name,
                        pending_call.input,
                        context=tool_context,
                    )
                    tool_result = AgentToolResult(
                        tool_use_id=pending_call.tool_use_id,
                        tool_name=pending_call.tool_name,
                        arguments=pending_call.input,
                        ok=True,
                        result=self._normalize_tool_result(tool_output),
                    )
                    logger.info(
                        "agent_tool_result session=%s turn=%s tool=%s ok=true",
                        session.session_id,
                        turn,
                        pending_call.tool_name,
                    )
                except Exception as exc:  # pragma: no cover - runtime surface
                    tool_result = AgentToolResult(
                        tool_use_id=pending_call.tool_use_id,
                        tool_name=pending_call.tool_name,
                        arguments=pending_call.input,
                        ok=False,
                        error=str(exc),
                    )
                    logger.exception(
                        "agent_tool_result session=%s turn=%s tool=%s ok=false",
                        session.session_id,
                        turn,
                        pending_call.tool_name,
                    )
                step.tool_results.append(tool_result)
                append_tool_message(state, tool_result)
                yield AgentStreamEvent(
                    event="tool_call_finished",
                    turn=turn,
                    message=f"Tool {tool_result.tool_name} finished.",
                    payload=tool_result.model_dump(mode="json"),
                )

            state.pending_tool_calls = []
            steps.append(step)
            yield AgentStreamEvent(
                event="turn_finished",
                turn=turn,
                message=f"Turn {turn} finished.",
                payload=step.model_dump(mode="json"),
            )

            if decision.done or (decision.assistant_response and not decision.tool_calls):
                result = self._build_run_result(
                    session=session,
                    state=state,
                    steps=steps,
                    final_answer=decision.assistant_response,
                    status="completed",
                    model_name=model_name,
                    warnings=warnings,
                    system_prompt=system_prompt,
                    user_prompt=request.user_prompt,
                    runtime_context_payload=runtime_context_payload,
                )
                yield AgentStreamEvent(
                    event="run_completed",
                    turn=turn,
                    message="Agent run completed.",
                    payload={"result": result.model_dump(mode="json")},
                )
                return

        warnings.append(f"Reached max_turns={max_turns} before the agent declared completion.")
        last_response = steps[-1].assistant_response if steps else ""
        state.messages.append(
            MessageRecord(
                role="assistant",
                source="agent",
                content={"warning": warnings[-1]},
            )
        )
        result = self._build_run_result(
            session=session,
            state=state,
            steps=steps,
            final_answer=last_response,
            status="max_turns",
            model_name=model_name,
            warnings=warnings,
            system_prompt=system_prompt,
            user_prompt=request.user_prompt,
            runtime_context_payload=runtime_context_payload,
        )
        yield AgentStreamEvent(
            event="run_completed",
            turn=max_turns,
            message="Agent run completed with max_turns.",
            payload={"result": result.model_dump(mode="json")},
        )

    def run_agent(self, request: AgentRunRequest) -> AgentRunResult:
        """Compatibility wrapper for non-streaming callers."""
        for event in self.stream_agent_run(request):
            if event.event == "run_completed":
                return AgentRunResult.model_validate(event.payload["result"])
        raise RuntimeError("Agent run finished without a completion event.")

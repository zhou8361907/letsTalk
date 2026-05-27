"""Agent capability and tool registry."""

from ai_requirement_os.agents.models import AgentCapability, AgentManifest, AgentTool


def build_default_agent_manifest() -> AgentManifest:
    return AgentManifest(
        agent_key="page_requirement_agent",
        name="Page Requirement Agent",
        purpose=(
            "Own the page-level lifecycle: read code, assemble context, "
            "produce documentation, generate sandbox schemas, converse with the user, "
            "propose changes, and orchestrate follow-up work."
        ),
        mode="interactive",
        responsibilities=[
            "Read only the current page and directly related source files.",
            "Generate page-level documentation and PageIR.",
            "Render and update sandbox-facing runtime schema.",
            "Track user requirement changes and convert them into structured patches.",
            "Coordinate future sub-agents and background tasks when the workflow expands.",
        ],
        capabilities=[
            AgentCapability(
                key="codex_style_harness",
                description="Run a multi-turn observe-think-tool-act loop over a stable tool registry.",
                current_state="active",
            ),
            AgentCapability(
                key="page_context_assembly",
                description="Collect the smallest grounded file set for one page workspace.",
                current_state="active",
            ),
            AgentCapability(
                key="semantic_method_reader",
                description="Read Java methods by class + method + signature instead of brittle line numbers.",
                current_state="active",
            ),
            AgentCapability(
                key="page_documentation",
                description="Produce deterministic and LLM-enhanced page documentation.",
                current_state="active",
            ),
            AgentCapability(
                key="sandbox_projection",
                description="Generate runtime schema and sandbox previews for a page.",
                current_state="active",
            ),
            AgentCapability(
                key="code_modification_planning",
                description="Turn natural language changes into file-level code edit plans.",
                current_state="active",
            ),
            AgentCapability(
                key="code_modification_apply",
                description="Apply reviewed code modification plans to the real frontend project.",
                current_state="active",
            ),
            AgentCapability(
                key="sub_agent_delegation",
                description="Delegate specialized work such as review, diff, and sync tasks.",
                current_state="scaffolded",
            ),
            AgentCapability(
                key="background_jobs",
                description=(
                    "Run long-lived analysis, refresh, and sync work "
                    "off the main interaction path."
                ),
                current_state="scaffolded",
            ),
            AgentCapability(
                key="durable_memory",
                description="Persist page and project memory across sessions.",
                current_state="scaffolded",
            ),
        ],
        tools=[
            AgentTool(
                name="codex_harness",
                kind="llm",
                description="Drive an iterative plan-tool-observe loop instead of one-shot prompting.",
            ),
            AgentTool(
                name="page_workspace_parser",
                kind="parser",
                description=(
                    "Assemble page-scoped context from Vue, API, Controller, DTO, "
                    "and Service files."
                ),
            ),
            AgentTool(
                name="page_doc_llm",
                kind="llm",
                description="Refine page documentation with structured LLM output.",
            ),
            AgentTool(
                name="runtime_schema_builder",
                kind="sandbox",
                description="Project page semantics into sandbox-ready runtime schema.",
            ),
            AgentTool(
                name="code_modifier",
                kind="code",
                description="Generate, preview, apply, and revert code modification plans.",
            ),
            AgentTool(
                name="file_inspector",
                kind="file",
                description="Read and search target frontend files for planning and verification.",
            ),
            AgentTool(
                name="semantic_method_reader",
                kind="file",
                description="Read backend Java methods via stable semantic locators.",
            ),
            AgentTool(
                name="memory_store",
                kind="memory",
                description="Store page, project, and global memory for future turns.",
            ),
            AgentTool(
                name="task_queue",
                kind="task",
                description="Schedule background or deferred agent work.",
            ),
        ],
        memory_scopes=["turn", "page", "project", "global"],
        extensibility_notes=[
            "The runtime is page-first today, but can fan out into sub-agents later.",
            "Task queue is currently in-memory and can be swapped for persistent workers.",
            "Memory store is currently in-memory and can be backed by JSON, SQLite, "
            "or vector memory.",
        ],
        loop_contract=[
            "The main loop owns messages, turn count, and transition reason.",
            "Tool results must be written back into message history before the next turn.",
            "Tools grow through registry + handler dispatch, not by mutating the loop body.",
            "Background work returns notifications into the next turn "
            "instead of forking the main loop.",
            "Sub-agents run isolated page-scoped tasks and return compact summaries "
            "to the parent agent.",
        ],
    )

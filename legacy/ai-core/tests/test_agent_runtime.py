from ai_requirement_os.agents import AgentRuntime, build_default_agent_manifest


def test_default_agent_manifest_has_core_capabilities() -> None:
    manifest = build_default_agent_manifest()

    assert manifest.agent_key == "page_requirement_agent"
    assert any(cap.key == "page_documentation" for cap in manifest.capabilities)
    assert any(cap.key == "code_modification_planning" for cap in manifest.capabilities)
    assert any(tool.kind == "memory" for tool in manifest.tools)
    assert any(tool.name == "code_modifier" for tool in manifest.tools)


def test_agent_runtime_can_store_memory_and_queue_tasks() -> None:
    runtime = AgentRuntime()

    memory = runtime.remember("page", "detail-purpose", "Detail page handles running account CRUD.")
    task = runtime.queue_task(
        title="Generate Detail page doc",
        kind="build_page_doc",
        page_path="/tmp/Detail.vue",
    )
    session = runtime.start_session(
        project_name="RunningAccount-master",
        page_path="/tmp/Detail.vue",
    )

    assert memory.key == "detail-purpose"
    assert task.kind == "build_page_doc"
    assert session.project_name == "RunningAccount-master"
    assert session.active_tasks
    assert runtime.tools.get_handler("plan_code_modification") is not None

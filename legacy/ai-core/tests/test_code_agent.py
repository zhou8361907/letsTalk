from pathlib import Path
from types import SimpleNamespace

from ai_requirement_os.agents.code_agent import CodeAgent
from ai_requirement_os.agents.code_tools import CodeEdit, CodeModificationPlan
from ai_requirement_os.parser.project_source import SourceProjectConfig


def _configure_store(monkeypatch, tmp_path: Path) -> Path:
    plan_root = tmp_path / ".agent" / "code_plans"
    index_path = plan_root / "index.json"
    monkeypatch.setattr("ai_requirement_os.agents.code_agent.CODE_PLAN_ROOT", plan_root)
    monkeypatch.setattr("ai_requirement_os.agents.code_agent.CODE_PLAN_INDEX", index_path)
    return plan_root


def _init_git_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    frontend = repo / "vue"
    frontend.mkdir(parents=True)
    detail = frontend / "src" / "views"
    detail.mkdir(parents=True)
    (detail / "Detail.vue").write_text(
        "<template>\n  <div>alpha</div>\n</template>\n",
        encoding="utf-8",
    )
    import subprocess

    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True)
    return frontend


def test_code_agent_plan_persists_and_restores(monkeypatch, tmp_path: Path) -> None:
    _configure_store(monkeypatch, tmp_path)
    frontend = _init_git_repo(tmp_path)
    plan = CodeModificationPlan(
        plan_id="plan-restore",
        summary="restore plan",
        edits=[
            CodeEdit(
                file_path=(frontend / "src" / "views" / "Detail.vue").as_posix(),
                action="insert_after",
                anchor_text="  <div>alpha</div>",
                new_content="\n  <span>beta</span>",
                description="insert beta",
            )
        ],
    )
    fake_analysis = SimpleNamespace(asset=SimpleNamespace(workspace=object()))
    monkeypatch.setattr("ai_requirement_os.agents.code_agent.get_or_create_page_analysis", lambda *args, **kwargs: fake_analysis)
    monkeypatch.setattr("ai_requirement_os.agents.code_agent.generate_code_modification_plan", lambda *args, **kwargs: plan)

    agent = CodeAgent()
    config = SourceProjectConfig(project_name="demo", frontend_path=frontend.as_posix(), backend_path=None)
    created = agent.plan(config, (frontend / "src" / "views" / "Detail.vue").as_posix(), "add beta")

    assert created.plan_id == "plan-restore"
    restored = CodeAgent()
    assert restored.list_plans()[0].plan_id == "plan-restore"


def test_code_agent_apply_and_revert(monkeypatch, tmp_path: Path) -> None:
    _configure_store(monkeypatch, tmp_path)
    frontend = _init_git_repo(tmp_path)
    detail_path = frontend / "src" / "views" / "Detail.vue"
    agent = CodeAgent()
    plan = CodeModificationPlan(
        plan_id="plan-apply",
        summary="Add beta span",
        edits=[
            CodeEdit(
                file_path=detail_path.as_posix(),
                action="insert_after",
                anchor_text="  <div>alpha</div>",
                new_content="\n  <span>beta</span>",
                description="insert beta",
            )
        ],
    )
    agent._persist_plan(plan)
    config = SourceProjectConfig(project_name="demo", frontend_path=frontend.as_posix(), backend_path=None)

    result = agent.apply("plan-apply", config)
    assert result.all_succeeded is True
    assert result.branch_name == "agent-feat/plan-app"
    assert "<span>beta</span>" in detail_path.read_text(encoding="utf-8")

    revert_result = agent.revert("plan-apply", config)
    assert revert_result.status == "reverted"
    assert detail_path.read_text(encoding="utf-8") == "<template>\n  <div>alpha</div>\n</template>\n"


def test_code_agent_reset_workspace_restores_failed_changes(monkeypatch, tmp_path: Path) -> None:
    _configure_store(monkeypatch, tmp_path)
    frontend = _init_git_repo(tmp_path)
    detail_path = frontend / "src" / "views" / "Detail.vue"
    agent = CodeAgent()
    plan = CodeModificationPlan(
        plan_id="plan-reset",
        summary="Break then reset",
        branch_name="agent-feat/plan-res",
        base_branch="master",
        status="failed",
        edits=[
            CodeEdit(
                file_path=detail_path.as_posix(),
                action="insert_after",
                anchor_text="  <div>alpha</div>",
                new_content="\n  <span>beta</span>",
                description="insert beta",
            )
        ],
    )
    agent._persist_plan(plan)
    detail_path.write_text("<template>\n  <div>broken</div>\n</template>\n", encoding="utf-8")
    config = SourceProjectConfig(project_name="demo", frontend_path=frontend.as_posix(), backend_path=None)

    result = agent.reset_workspace(config)

    assert result.target_branch == "master"
    assert result.cleared_plan_ids == ["plan-reset"]
    assert detail_path.read_text(encoding="utf-8") == "<template>\n  <div>alpha</div>\n</template>\n"
    assert agent.list_plans() == []

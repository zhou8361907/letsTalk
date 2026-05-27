from fastapi.testclient import TestClient

from ai_requirement_os.agents.code_tools import (
    CodeEdit,
    CodeModificationPlan,
    CodeModificationResult,
    CodePreviewResult,
    CodeWorkspaceResetResult,
    EditApplicationResult,
)
from ai_requirement_os.api.app import app


class FakeCodeAgent:
    def __init__(self) -> None:
        self.plan_obj = CodeModificationPlan(
            plan_id="plan-api",
            summary="API plan",
            edits=[
                CodeEdit(
                    file_path="/tmp/demo.vue",
                    action="insert_after",
                    anchor_text="anchor",
                    new_content="\nvalue",
                    description="demo",
                )
            ],
        )

    def plan(self, config, page_path, user_request):
        return self.plan_obj

    def preview(self, plan_id):
        return CodePreviewResult(
            plan_id=plan_id,
            summary=self.plan_obj.summary,
            files=["/tmp/demo.vue"],
            diff="@@",
            status="planned",
        )

    def apply(self, plan_id, config):
        return CodeModificationResult(
            plan_id=plan_id,
            summary=self.plan_obj.summary,
            results=[EditApplicationResult(file_path="/tmp/demo.vue", action="insert_after", success=True, message="ok")],
            all_succeeded=True,
            branch_name="agent-feat/plan-api",
            commit_sha="abc123",
            status="applied",
        )

    def revert(self, plan_id, config):
        return CodeModificationResult(
            plan_id=plan_id,
            summary="reverted",
            results=[EditApplicationResult(file_path="/tmp/demo.vue", action="insert_after", success=True, message="ok")],
            all_succeeded=True,
            branch_name="agent-feat/plan-api",
            commit_sha="abc123",
            revert_commit_sha="def456",
            status="reverted",
        )

    def list_plans(self):
        return [self.plan_obj]

    def reset_workspace(self, config):
        return CodeWorkspaceResetResult(
            summary="reset",
            restored_files=["/tmp/demo.vue"],
            cleared_plan_ids=["plan-api"],
            target_branch="test",
            current_branch="test",
        )


def test_agent_code_endpoints(monkeypatch) -> None:
    fake_runtime = type("FakeRuntime", (), {"code_agent": FakeCodeAgent()})()
    monkeypatch.setattr("ai_requirement_os.api.app.get_agent_runtime", lambda: fake_runtime)
    client = TestClient(app)
    payload = {
        "config": {
            "project_name": "demo",
            "frontend_path": "/tmp/frontend",
            "backend_path": "/tmp/backend",
            "entry_pages": [],
        },
        "page_path": "/tmp/frontend/src/views/Detail.vue",
        "user_request": "add filter",
    }

    plan_response = client.post("/api/agent/code-plan", json=payload)
    assert plan_response.status_code == 200
    assert plan_response.json()["plan_id"] == "plan-api"

    preview_response = client.get("/api/agent/code-preview/plan-api")
    assert preview_response.status_code == 200
    assert preview_response.json()["diff"] == "@@"

    apply_response = client.post("/api/agent/code-apply/plan-api", json=payload)
    assert apply_response.status_code == 200
    assert apply_response.json()["status"] == "applied"

    revert_response = client.post("/api/agent/code-revert/plan-api", json=payload)
    assert revert_response.status_code == 200
    assert revert_response.json()["status"] == "reverted"

    list_response = client.get("/api/agent/code-plans")
    assert list_response.status_code == 200
    assert list_response.json()[0]["summary"] == "API plan"

    reset_response = client.post("/api/agent/reset-workspace", json={"config": payload["config"]})
    assert reset_response.status_code == 200
    assert reset_response.json()["summary"] == "reset"

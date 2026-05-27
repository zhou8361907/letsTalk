"""Coordinator for code modification plans and git-backed apply/revert."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from uuid import uuid4

from ai_requirement_os.agents.code_tools import (
    CodeModificationPlan,
    CodeModificationResult,
    CodePreviewResult,
    CodeWorkspaceResetResult,
    EditApplicationResult,
    apply_plan,
    preview_plan,
)
from ai_requirement_os.llm.code_modifier import generate_code_modification_plan
from ai_requirement_os.parser.page_analysis import get_or_create_page_analysis
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.settings import PROJECT_ROOT

AGENT_ROOT = PROJECT_ROOT / ".agent"
CODE_PLAN_ROOT = AGENT_ROOT / "code_plans"
CODE_PLAN_INDEX = CODE_PLAN_ROOT / "index.json"


class GitHelper:
    def __init__(self, worktree: Path) -> None:
        self.worktree = worktree
        result = subprocess.run(
            ["git", "-C", self.worktree.as_posix(), "rev-parse", "--show-toplevel"],
            check=True,
            text=True,
            capture_output=True,
        )
        self.root = Path(result.stdout.strip()).resolve()

    def _run(self, *args: str) -> str:
        result = subprocess.run(
            ["git", "-C", self.root.as_posix(), *args],
            check=True,
            text=True,
            capture_output=True,
        )
        return result.stdout.strip()

    def current_branch(self) -> str:
        return self._run("rev-parse", "--abbrev-ref", "HEAD")

    def _relativize(self, paths: list[str]) -> list[str]:
        return [Path(path).resolve().relative_to(self.root).as_posix() for path in paths]

    def has_staged_changes(self) -> bool:
        return bool(self._run("diff", "--cached", "--name-only"))

    def has_conflicting_changes(self, paths: list[str]) -> bool:
        if not paths:
            return False
        rel_paths = self._relativize(paths)
        result = subprocess.run(
            [
                "git",
                "-C",
                self.root.as_posix(),
                "status",
                "--porcelain",
                "--untracked-files=no",
                "--",
                *rel_paths,
            ],
            check=True,
            text=True,
            capture_output=True,
        )
        return bool(result.stdout.strip())

    def checkout_new_branch(self, branch_name: str) -> None:
        self._run("checkout", "-b", branch_name)

    def checkout(self, branch_name: str) -> None:
        self._run("checkout", branch_name)

    def add_and_commit(self, message: str, paths: list[str]) -> str:
        self._run("add", "--", *self._relativize(paths))
        self._run("commit", "-m", message)
        return self._run("rev-parse", "HEAD")

    def revert_head(self) -> str:
        self._run("revert", "HEAD", "--no-edit")
        return self._run("rev-parse", "HEAD")

    def restore_paths_from_ref(self, ref: str, paths: list[str]) -> None:
        if not paths:
            return
        self._run("restore", "--source", ref, "--staged", "--worktree", "--", *self._relativize(paths))

    def restore_worktree(self, paths: list[str]) -> None:
        if not paths:
            return
        self._run("restore", "--staged", "--worktree", "--", *self._relativize(paths))

    def branch_exists(self, branch_name: str) -> bool:
        result = subprocess.run(
            ["git", "-C", self.root.as_posix(), "rev-parse", "--verify", branch_name],
            text=True,
            capture_output=True,
        )
        return result.returncode == 0


class CodeAgent:
    def __init__(self) -> None:
        self._plans: dict[str, CodeModificationPlan] = {}
        self._ensure_store()
        self._load_plans()

    def _ensure_store(self) -> None:
        CODE_PLAN_ROOT.mkdir(parents=True, exist_ok=True)
        if not CODE_PLAN_INDEX.exists():
            CODE_PLAN_INDEX.write_text("{}", encoding="utf-8")

    def _load_plans(self) -> None:
        try:
            index = json.loads(CODE_PLAN_INDEX.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            index = {}
        for plan_id in index:
            path = CODE_PLAN_ROOT / f"{plan_id}.json"
            if not path.exists():
                continue
            plan = CodeModificationPlan.model_validate_json(path.read_text(encoding="utf-8"))
            if plan.status != "reverted":
                self._plans[plan.plan_id] = plan

    def _persist_plan(self, plan: CodeModificationPlan) -> None:
        index = json.loads(CODE_PLAN_INDEX.read_text(encoding="utf-8"))
        index[plan.plan_id] = {
            "status": plan.status,
            "summary": plan.summary,
            "created_at": plan.created_at.isoformat(),
            "branch_name": plan.branch_name,
        }
        CODE_PLAN_INDEX.write_text(
            json.dumps(index, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (CODE_PLAN_ROOT / f"{plan.plan_id}.json").write_text(
            plan.model_dump_json(indent=2),
            encoding="utf-8",
        )
        self._plans[plan.plan_id] = plan

    def _delete_plan(self, plan_id: str) -> None:
        index = json.loads(CODE_PLAN_INDEX.read_text(encoding="utf-8"))
        index.pop(plan_id, None)
        CODE_PLAN_INDEX.write_text(
            json.dumps(index, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        plan_path = CODE_PLAN_ROOT / f"{plan_id}.json"
        if plan_path.exists():
            plan_path.unlink()
        self._plans.pop(plan_id, None)

    def _frontend_root(self, config: SourceProjectConfig) -> Path:
        if not config.frontend_path:
            raise ValueError("frontend_path is required for code modification")
        return Path(config.frontend_path).resolve()

    def _assert_paths_allowed(self, plan: CodeModificationPlan, frontend_root: Path) -> None:
        for edit in plan.edits:
            edit_path = Path(edit.file_path).resolve()
            if frontend_root not in edit_path.parents and edit_path != frontend_root:
                raise ValueError(f"Edit path is outside frontend root: {edit.file_path}")

    def plan(
        self,
        config: SourceProjectConfig,
        page_path: str,
        user_request: str,
    ) -> CodeModificationPlan:
        workspace = get_or_create_page_analysis(config, page_path, refresh=False).asset.workspace
        plan = generate_code_modification_plan(
            workspace,
            user_request=user_request,
            frontend_root=self._frontend_root(config).as_posix(),
        )
        if not plan.plan_id:
            plan.plan_id = uuid4().hex
        plan.status = "planned"
        self._assert_paths_allowed(plan, self._frontend_root(config))
        self._persist_plan(plan)
        return plan

    def preview(self, plan_id: str) -> CodePreviewResult:
        plan = self._plans[plan_id]
        return preview_plan(plan)

    def apply(self, plan_id: str, config: SourceProjectConfig) -> CodeModificationResult:
        plan = self._plans[plan_id]
        frontend_root = self._frontend_root(config)
        self._assert_paths_allowed(plan, frontend_root)
        git = GitHelper(frontend_root)
        touched_paths = [str(Path(edit.file_path).resolve()) for edit in plan.edits]
        if git.has_staged_changes():
            raise ValueError("Git staged changes detected. Please clear the index before apply.")
        if git.has_conflicting_changes(touched_paths):
            raise ValueError("Plan target files have local modifications. Please commit or revert them first.")
        if plan.branch_name:
            git.checkout(plan.branch_name)
        else:
            plan.base_branch = git.current_branch()
            plan.branch_name = f"agent-feat/{plan.plan_id[:8]}"
            git.checkout_new_branch(plan.branch_name)
        results = apply_plan(plan)
        all_succeeded = all(item.success for item in results) and len(results) == len(plan.edits)
        commit_sha = None
        if all_succeeded and touched_paths:
            commit_sha = git.add_and_commit(plan.summary, touched_paths)
            plan.commit_sha = commit_sha
            plan.status = "applied"
        else:
            plan.status = "failed"
        self._persist_plan(plan)
        return CodeModificationResult(
            plan_id=plan.plan_id,
            summary=plan.summary,
            results=results,
            all_succeeded=all_succeeded,
            branch_name=plan.branch_name,
            commit_sha=commit_sha,
            status=plan.status,
        )

    def revert(self, plan_id: str, config: SourceProjectConfig) -> CodeModificationResult:
        plan = self._plans[plan_id]
        if not plan.branch_name:
            raise ValueError("Plan has not been applied yet")
        git = GitHelper(self._frontend_root(config))
        git.checkout(plan.branch_name)
        revert_sha = git.revert_head()
        plan.revert_commit_sha = revert_sha
        plan.status = "reverted"
        result = CodeModificationResult(
            plan_id=plan.plan_id,
            summary=f"已回滚：{plan.summary}",
            results=[
                EditApplicationResult(
                    file_path=edit.file_path,
                    action=edit.action,
                    success=True,
                    message="Git revert completed",
                )
                for edit in plan.edits
            ],
            all_succeeded=True,
            branch_name=plan.branch_name,
            commit_sha=plan.commit_sha,
            revert_commit_sha=revert_sha,
            status=plan.status,
        )
        self._delete_plan(plan_id)
        return result

    def list_plans(self) -> list[CodeModificationPlan]:
        return sorted(self._plans.values(), key=lambda item: item.created_at, reverse=True)

    def reset_workspace(self, config: SourceProjectConfig) -> CodeWorkspaceResetResult:
        frontend_root = self._frontend_root(config)
        git = GitHelper(frontend_root)
        plans = self.list_plans()

        touched_paths: list[str] = []
        for plan in plans:
            for edit in plan.edits:
                file_path = str(Path(edit.file_path).resolve())
                if file_path not in touched_paths:
                    touched_paths.append(file_path)

        current_branch = git.current_branch()
        target_branch = next((plan.base_branch for plan in plans if plan.base_branch), None)
        if not target_branch and not current_branch.startswith("agent-feat/"):
            target_branch = current_branch

        if target_branch and target_branch != current_branch and git.branch_exists(target_branch):
            git.checkout(target_branch)
            current_branch = target_branch

        if touched_paths:
            if target_branch and git.branch_exists(target_branch):
                git.restore_paths_from_ref(target_branch, touched_paths)
            else:
                git.restore_worktree(touched_paths)

        cleared_plan_ids = [plan.plan_id for plan in plans]
        for plan_id in cleared_plan_ids:
            self._delete_plan(plan_id)

        return CodeWorkspaceResetResult(
            summary="已将 Agent 改动恢复到初始状态",
            restored_files=touched_paths,
            cleared_plan_ids=cleared_plan_ids,
            target_branch=target_branch,
            current_branch=current_branch,
        )

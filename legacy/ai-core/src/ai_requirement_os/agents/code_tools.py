"""Code modification models and file-edit helpers."""

from __future__ import annotations

import difflib
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

CodeEditAction = Literal["insert_after", "insert_before", "replace", "delete"]
CodePlanStatus = Literal["planned", "applied", "reverted", "failed"]


class CodeEdit(BaseModel):
    file_path: str
    action: CodeEditAction
    anchor_text: str
    new_content: str = ""
    description: str


class EditApplicationResult(BaseModel):
    file_path: str
    action: CodeEditAction
    success: bool
    message: str


class CodeModificationPlan(BaseModel):
    plan_id: str
    summary: str
    rationale: list[str] = Field(default_factory=list)
    edits: list[CodeEdit] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: CodePlanStatus = "planned"
    branch_name: str | None = None
    base_branch: str | None = None
    commit_sha: str | None = None
    revert_commit_sha: str | None = None


class CodePreviewResult(BaseModel):
    plan_id: str
    summary: str
    files: list[str] = Field(default_factory=list)
    diff: str
    status: CodePlanStatus


class CodeModificationResult(BaseModel):
    plan_id: str
    summary: str
    results: list[EditApplicationResult] = Field(default_factory=list)
    all_succeeded: bool
    branch_name: str | None = None
    commit_sha: str | None = None
    revert_commit_sha: str | None = None
    status: CodePlanStatus


class CodeWorkspaceResetResult(BaseModel):
    summary: str
    restored_files: list[str] = Field(default_factory=list)
    cleared_plan_ids: list[str] = Field(default_factory=list)
    target_branch: str | None = None
    current_branch: str | None = None


class AnchorValidationError(ValueError):
    """Raised when an edit anchor cannot be applied safely."""


def _read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write_file(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def validate_anchor(path: str | Path, anchor_text: str) -> int:
    """Return the anchor position when it matches exactly once."""
    file_path = Path(path)
    content = _read_file(file_path)
    first = content.find(anchor_text)
    if first < 0:
        raise AnchorValidationError(f"Anchor not found in {file_path}")
    second = content.find(anchor_text, first + len(anchor_text))
    if second >= 0:
        raise AnchorValidationError(f"Anchor is not unique in {file_path}")
    return first


def _apply_edit_to_text(content: str, edit: CodeEdit) -> str:
    offset = validate_anchor_text(content, edit.anchor_text)
    if edit.action == "insert_after":
        return content[: offset + len(edit.anchor_text)] + edit.new_content + content[offset + len(edit.anchor_text):]
    if edit.action == "insert_before":
        return content[:offset] + edit.new_content + content[offset:]
    if edit.action == "replace":
        return content[:offset] + edit.new_content + content[offset + len(edit.anchor_text):]
    if edit.action == "delete":
        return content[:offset] + content[offset + len(edit.anchor_text):]
    raise ValueError(f"Unsupported action: {edit.action}")


def validate_anchor_text(content: str, anchor_text: str) -> int:
    first = content.find(anchor_text)
    if first < 0:
        raise AnchorValidationError("Anchor not found in memory content")
    second = content.find(anchor_text, first + len(anchor_text))
    if second >= 0:
        raise AnchorValidationError("Anchor is not unique in memory content")
    return first


def preview_edit(edit: CodeEdit) -> str:
    path = Path(edit.file_path)
    original = _read_file(path)
    updated = _apply_edit_to_text(original, edit)
    diff = difflib.unified_diff(
        original.splitlines(),
        updated.splitlines(),
        fromfile=edit.file_path,
        tofile=edit.file_path,
        lineterm="",
    )
    return "\n".join(diff)


def preview_plan(plan: CodeModificationPlan) -> CodePreviewResult:
    touched_files: dict[str, tuple[str, str]] = {}
    for edit in plan.edits:
        path = Path(edit.file_path)
        original, current = touched_files.get(edit.file_path, (_read_file(path), _read_file(path)))
        touched_files[edit.file_path] = (original, _apply_edit_to_text(current, edit))

    diff_chunks: list[str] = []
    for file_path, (original, updated) in touched_files.items():
        diff_chunks.extend(
            difflib.unified_diff(
                original.splitlines(),
                updated.splitlines(),
                fromfile=file_path,
                tofile=file_path,
                lineterm="",
            )
        )
    return CodePreviewResult(
        plan_id=plan.plan_id,
        summary=plan.summary,
        files=list(touched_files.keys()),
        diff="\n".join(diff_chunks),
        status=plan.status,
    )


def apply_single_edit(edit: CodeEdit) -> EditApplicationResult:
    path = Path(edit.file_path)
    validate_anchor(path, edit.anchor_text)
    original = _read_file(path)
    updated = _apply_edit_to_text(original, edit)
    _write_file(path, updated)
    return EditApplicationResult(
        file_path=edit.file_path,
        action=edit.action,
        success=True,
        message=edit.description,
    )


def apply_plan(plan: CodeModificationPlan) -> list[EditApplicationResult]:
    results: list[EditApplicationResult] = []
    for edit in plan.edits:
        try:
            results.append(apply_single_edit(edit))
        except Exception as exc:  # noqa: BLE001
            results.append(
                EditApplicationResult(
                    file_path=edit.file_path,
                    action=edit.action,
                    success=False,
                    message=str(exc),
                )
            )
            break
    return results

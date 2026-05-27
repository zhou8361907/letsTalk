from pathlib import Path

import pytest

from ai_requirement_os.agents.code_tools import (
    AnchorValidationError,
    CodeEdit,
    CodeModificationPlan,
    apply_plan,
    preview_edit,
    preview_plan,
    validate_anchor,
)


def test_validate_anchor_requires_unique_match(tmp_path: Path) -> None:
    target = tmp_path / "Demo.vue"
    target.write_text("<div>alpha</div>\n<div>beta</div>\n", encoding="utf-8")

    assert validate_anchor(target, "alpha") >= 0

    with pytest.raises(AnchorValidationError):
        validate_anchor(target, "missing")

    target.write_text("<div>alpha</div>\n<div>alpha</div>\n", encoding="utf-8")
    with pytest.raises(AnchorValidationError):
        validate_anchor(target, "alpha")


def test_preview_and_apply_plan_support_edit_operations(tmp_path: Path) -> None:
    target = tmp_path / "Demo.vue"
    target.write_text("<template>\n  <div>alpha</div>\n</template>\n", encoding="utf-8")
    plan = CodeModificationPlan(
        plan_id="plan-demo",
        summary="demo",
        edits=[
            CodeEdit(
                file_path=target.as_posix(),
                action="insert_after",
                anchor_text="  <div>alpha</div>",
                new_content="\n  <span>beta</span>",
                description="insert span",
            ),
            CodeEdit(
                file_path=target.as_posix(),
                action="replace",
                anchor_text="<span>beta</span>",
                new_content="<span>gamma</span>",
                description="replace span",
            ),
            CodeEdit(
                file_path=target.as_posix(),
                action="delete",
                anchor_text="<div>alpha</div>",
                new_content="",
                description="delete alpha",
            ),
        ],
    )

    single_preview = preview_edit(plan.edits[0])
    assert "+  <span>beta</span>" in single_preview

    preview = preview_plan(plan)
    assert preview.plan_id == "plan-demo"
    assert "gamma" in preview.diff

    results = apply_plan(plan)
    assert all(item.success for item in results)
    assert target.read_text(encoding="utf-8") == "<template>\n  \n  <span>gamma</span>\n</template>\n"

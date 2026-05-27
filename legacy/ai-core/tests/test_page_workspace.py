from ai_requirement_os.parser.page_workspace import build_page_workspace
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.settings import DEFAULT_SAMPLE_BACKEND, DEFAULT_SAMPLE_FRONTEND


def test_build_page_workspace_for_detail_page() -> None:
    page_path = (DEFAULT_SAMPLE_FRONTEND / "src" / "views" / "Detail.vue").as_posix()
    workspace = build_page_workspace(
        SourceProjectConfig(
            project_name="RunningAccount-master",
            frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
            backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        ),
        page_path=page_path,
    )

    assert workspace.documentation.page_name == "Detail"
    assert any(field.label == "所有项目" for field in workspace.documentation.search_fields)
    assert any(column.label == "日期" for column in workspace.documentation.table_columns)
    assert any(dialog.title == "修改记录" for dialog in workspace.documentation.dialogs)
    assert any(
        ref.role == "controller" and ref.path.endswith("DetailController.java")
        for ref in workspace.related_files
    )
    assert workspace.runtime_schema.components
    assert workspace.sandbox_route == "/detail"
    assert workspace.sandbox_url.endswith("#/detail")


def test_build_page_workspace_for_login_page_creates_form_sandbox() -> None:
    page_path = (DEFAULT_SAMPLE_FRONTEND / "src" / "views" / "Login.vue").as_posix()
    workspace = build_page_workspace(
        SourceProjectConfig(
            project_name="RunningAccount-master",
            frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
            backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        ),
        page_path=page_path,
    )

    assert workspace.documentation.forms
    assert any(component.type == "Form" for component in workspace.runtime_schema.components)
    assert workspace.sandbox_url.endswith("#/login")

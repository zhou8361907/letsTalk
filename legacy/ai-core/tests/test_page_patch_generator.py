from ai_requirement_os.llm.page_patch_generator import generate_page_patch_with_llm
from ai_requirement_os.parser.page_workspace import build_page_workspace
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.settings import DEFAULT_SAMPLE_BACKEND, DEFAULT_SAMPLE_FRONTEND


def test_generate_page_patch_with_llm_falls_back_without_model(monkeypatch) -> None:
    monkeypatch.setattr(
        "ai_requirement_os.llm.page_patch_generator.get_llm_by_role",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("mocked unavailable")),
    )
    page_path = (DEFAULT_SAMPLE_FRONTEND / "src" / "views" / "Detail.vue").as_posix()
    workspace = build_page_workspace(
        SourceProjectConfig(
            project_name="RunningAccount-master",
            frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
            backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        ),
        page_path=page_path,
    )

    result = generate_page_patch_with_llm(
        workspace,
        user_request="在搜索区增加是否已报销，在表格增加操作人列。",
    )

    assert result.mode == "draft"
    assert result.patch.operations
    assert any(item.action == "add_search_field" for item in result.patch.operations)
    assert any(item.action == "add_table_column" for item in result.patch.operations)

from ai_requirement_os.llm.page_doc_generator import build_page_context_envelope
from ai_requirement_os.parser.page_workspace import build_page_workspace
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.settings import DEFAULT_SAMPLE_BACKEND, DEFAULT_SAMPLE_FRONTEND


def test_build_page_context_envelope_scopes_to_related_files() -> None:
    page_path = (DEFAULT_SAMPLE_FRONTEND / "src" / "views" / "Detail.vue").as_posix()
    workspace = build_page_workspace(
        SourceProjectConfig(
            project_name="RunningAccount-master",
            frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
            backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        ),
        page_path=page_path,
    )

    envelope = build_page_context_envelope(workspace)

    assert envelope.page_name == "Detail"
    assert envelope.blocks
    assert all(block.path for block in envelope.blocks)
    assert any(block.role == "page" for block in envelope.blocks)

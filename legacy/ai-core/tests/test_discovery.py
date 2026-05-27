from ai_requirement_os.parser.discovery import discover_project
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.settings import DEFAULT_SAMPLE_BACKEND, DEFAULT_SAMPLE_FRONTEND


def test_discover_project_finds_sample_pages_and_controllers() -> None:
    summary = discover_project(
        SourceProjectConfig(
            project_name="RunningAccount-master",
            frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
            backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        )
    )

    assert any(page.name == "Detail" for page in summary.frontend_pages)
    assert any(controller.name == "DetailController" for controller in summary.backend_controllers)
    assert any(module.name == "detailApi" for module in summary.api_modules)


def test_discover_project_suggests_crud_entry_pages() -> None:
    summary = discover_project(
        SourceProjectConfig(
            project_name="RunningAccount-master",
            frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
            backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        )
    )

    assert any(path.endswith("Detail.vue") for path in summary.entry_page_suggestions)

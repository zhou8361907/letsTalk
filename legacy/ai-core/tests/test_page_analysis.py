from ai_requirement_os.parser.page_analysis import get_or_create_page_analysis
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.settings import DEFAULT_SAMPLE_BACKEND, DEFAULT_SAMPLE_FRONTEND


def test_page_analysis_reuses_cached_asset_for_unchanged_page() -> None:
    page_path = (DEFAULT_SAMPLE_FRONTEND / "src" / "views" / "Detail.vue").as_posix()
    config = SourceProjectConfig(
        project_name="RunningAccount-master",
        frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
        backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
    )

    first = get_or_create_page_analysis(config, page_path, refresh=True)
    second = get_or_create_page_analysis(config, page_path, refresh=False)

    assert first.asset.asset_key == second.asset.asset_key
    assert second.source == "cache"

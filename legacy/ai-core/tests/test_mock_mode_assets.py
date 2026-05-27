from ai_requirement_os.settings import DEFAULT_SAMPLE_FRONTEND


def test_real_frontend_mock_mode_assets_are_wired() -> None:
    frontend_root = DEFAULT_SAMPLE_FRONTEND
    main_js = (frontend_root / "src" / "main.js").read_text(encoding="utf-8")
    axios_config = (frontend_root / "src" / "utils" / "axios.config.js").read_text(encoding="utf-8")
    sandbox_index = (frontend_root / "src" / "sandbox" / "index.js").read_text(encoding="utf-8")
    mock_adapter = (frontend_root / "src" / "sandbox" / "mockAdapter.js").read_text(encoding="utf-8")

    assert "isMockMode" in main_js
    assert "initMockMode" in axios_config
    assert "createMockAdapter" in sandbox_index
    assert "option/all" in mock_adapter

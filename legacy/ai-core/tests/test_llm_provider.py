from ai_requirement_os.llm.providers import get_deepseek_llm


def test_get_deepseek_llm_requires_api_key(monkeypatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")

    try:
        get_deepseek_llm()
    except RuntimeError as exc:
        assert "DEEPSEEK_API_KEY" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected RuntimeError when DEEPSEEK_API_KEY is missing")

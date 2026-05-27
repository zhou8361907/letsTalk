from ai_requirement_os.agents.config import (
    DEFAULT_AGENT_EXAMPLE_PATH,
    AgentConfig,
    load_agent_config,
)


def test_example_config_exists() -> None:
    assert DEFAULT_AGENT_EXAMPLE_PATH.exists()


def test_missing_agent_config_returns_defaults() -> None:
    config = load_agent_config(DEFAULT_AGENT_EXAMPLE_PATH.parent / "missing-agent.toml")

    assert isinstance(config, AgentConfig)
    assert config.models.primary.model == "deepseek-chat"

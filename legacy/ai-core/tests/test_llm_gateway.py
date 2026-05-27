from ai_requirement_os.agents.config import AgentConfig
from ai_requirement_os.llm.gateway import get_model_config_by_role


def test_get_model_config_by_role_uses_expected_bundle() -> None:
    config = AgentConfig()
    config.models.primary.model = "primary-model"
    config.models.planner.model = "planner-model"
    config.models.review.model = "review-model"

    assert get_model_config_by_role(config, "primary").model == "primary-model"
    assert get_model_config_by_role(config, "planner").model == "planner-model"
    assert get_model_config_by_role(config, "review").model == "review-model"

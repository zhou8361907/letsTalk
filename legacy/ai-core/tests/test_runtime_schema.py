from ai_requirement_os.ir_core.models import PageIR
from ai_requirement_os.schema.runtime_schema import build_runtime_schema


def test_build_runtime_schema_uses_component_names() -> None:
    schema = build_runtime_schema(PageIR.sample())

    assert schema.page == "trade_list"
    assert [component.type for component in schema.components] == [
        "SearchForm",
        "Table",
        "Dialog",
    ]


def test_sample_page_ir_contains_refund_action() -> None:
    page = PageIR.sample()
    table = next(container for container in page.containers if container.key == "trade_table")

    assert any(action.key == "refund" for action in table.actions)

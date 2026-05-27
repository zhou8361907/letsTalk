"""Convert business IR into a runtime schema consumable by the sandbox UI."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from ai_requirement_os.ir_core.models import ActionIR, ContainerIR, FieldIR, PageIR

RuntimeComponentType = Literal["SearchForm", "Table", "Dialog", "Drawer", "Tabs", "Form"]


class RuntimeField(BaseModel):
    key: str
    label: str
    component: str
    required: bool = False
    visible_when: str | None = None
    disabled_when: str | None = None
    options_api: str | None = None
    placeholder: str | None = None


class RuntimeAction(BaseModel):
    key: str
    label: str
    action_type: str
    scope: str
    visible_when: str | None = None
    disabled_when: str | None = None
    api_name: str | None = None


class RuntimeColumn(BaseModel):
    key: str
    label: str
    value_type: str


class RuntimeComponent(BaseModel):
    key: str
    type: RuntimeComponentType
    title: str | None = None
    fields: list[RuntimeField] = Field(default_factory=list)
    columns: list[RuntimeColumn] = Field(default_factory=list)
    actions: list[RuntimeAction] = Field(default_factory=list)


class RuntimePageSchema(BaseModel):
    page: str
    route: str
    domain: str
    components: list[RuntimeComponent]
    formulas: list[dict[str, str]] = Field(default_factory=list)


COMPONENT_TYPE_MAP: dict[str, RuntimeComponentType] = {
    "search_form": "SearchForm",
    "table": "Table",
    "dialog": "Dialog",
    "drawer": "Drawer",
    "tabs": "Tabs",
    "form": "Form",
}


def _map_field(field: FieldIR) -> RuntimeField:
    return RuntimeField(
        key=field.key,
        label=field.label,
        component=field.component,
        required=field.required,
        visible_when=field.visible_when.expression if field.visible_when else None,
        disabled_when=field.disabled_when.expression if field.disabled_when else None,
        options_api=field.options_api,
        placeholder=field.placeholder,
    )


def _map_action(action: ActionIR) -> RuntimeAction:
    return RuntimeAction(
        key=action.key,
        label=action.label,
        action_type=action.action_type,
        scope=action.scope,
        visible_when=action.visible_when.expression if action.visible_when else None,
        disabled_when=action.disabled_when.expression if action.disabled_when else None,
        api_name=action.api_name,
    )


def _map_component(container: ContainerIR) -> RuntimeComponent:
    return RuntimeComponent(
        key=container.key,
        type=COMPONENT_TYPE_MAP[container.type],
        title=container.title,
        fields=[_map_field(field) for field in container.fields],
        columns=[
            RuntimeColumn(key=column.key, label=column.label, value_type=column.value_type)
            for column in container.columns
        ],
        actions=[_map_action(action) for action in container.actions],
    )


def build_runtime_schema(page_ir: PageIR) -> RuntimePageSchema:
    """Translate PageIR into a sandbox-oriented runtime schema."""
    return RuntimePageSchema(
        page=page_ir.page_key,
        route=page_ir.route,
        domain=page_ir.domain,
        components=[_map_component(container) for container in page_ir.containers],
        formulas=[formula.model_dump() for formula in page_ir.formulas],
    )

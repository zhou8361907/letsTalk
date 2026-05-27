"""Core IR models for CRUD-oriented business pages."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

FieldComponentType = Literal["input", "select", "date", "number", "textarea"]
ContainerType = Literal["search_form", "table", "dialog", "drawer", "tabs", "form"]
ActionType = Literal["create", "edit", "delete", "submit", "custom", "api_call"]


class Condition(BaseModel):
    """A simple MVP condition expression."""

    expression: str = Field(description="Expression evaluated in sandbox context.")


class Formula(BaseModel):
    """A simple MVP formula definition."""

    target: str = Field(description="Destination field path.")
    expression: str = Field(description="Source expression.")


class FieldIR(BaseModel):
    """Business field definition used by forms, search areas, or dialogs."""

    key: str
    label: str
    component: FieldComponentType
    required: bool = False
    visible_when: Condition | None = None
    disabled_when: Condition | None = None
    options_api: str | None = None
    placeholder: str | None = None


class ColumnIR(BaseModel):
    """Table column definition."""

    key: str
    label: str
    value_type: Literal["text", "tag", "date", "money", "enum"] = "text"


class ActionIR(BaseModel):
    """Page or row action."""

    key: str
    label: str
    action_type: ActionType
    scope: Literal["page", "row", "dialog"] = "page"
    visible_when: Condition | None = None
    disabled_when: Condition | None = None
    api_name: str | None = None


class ApiIR(BaseModel):
    """External or internal API dependency."""

    name: str
    method: Literal["GET", "POST", "PUT", "DELETE"]
    path: str
    purpose: str


class StateTransitionIR(BaseModel):
    """Minimal business state transition representation."""

    from_status: str
    to_status: str
    trigger_action: str


class ContainerIR(BaseModel):
    """Reusable visual container for CRUD pages."""

    key: str
    type: ContainerType
    title: str | None = None
    fields: list[FieldIR] = Field(default_factory=list)
    columns: list[ColumnIR] = Field(default_factory=list)
    actions: list[ActionIR] = Field(default_factory=list)


class PageIR(BaseModel):
    """Top-level page semantic model."""

    page_key: str
    page_name: str
    route: str
    domain: str
    entities: list[str]
    containers: list[ContainerIR]
    apis: list[ApiIR] = Field(default_factory=list)
    formulas: list[Formula] = Field(default_factory=list)
    state_transitions: list[StateTransitionIR] = Field(default_factory=list)

    @classmethod
    def sample(cls) -> PageIR:
        """Sample CRUD page used to anchor the MVP."""
        return cls(
            page_key="trade_list",
            page_name="Trade List",
            route="/trade/list",
            domain="payment",
            entities=["trade", "refund"],
            containers=[
                ContainerIR(
                    key="trade_search",
                    type="search_form",
                    title="Search",
                    fields=[
                        FieldIR(
                            key="tradeNo",
                            label="Trade No",
                            component="input",
                            placeholder="Enter trade number",
                        ),
                        FieldIR(
                            key="status",
                            label="Status",
                            component="select",
                            options_api="getTradeStatusOptions",
                        ),
                    ],
                    actions=[
                        ActionIR(key="query", label="Query", action_type="custom"),
                        ActionIR(key="reset", label="Reset", action_type="custom"),
                    ],
                ),
                ContainerIR(
                    key="trade_table",
                    type="table",
                    title="Trade Records",
                    columns=[
                        ColumnIR(key="tradeNo", label="Trade No"),
                        ColumnIR(key="amount", label="Amount", value_type="money"),
                        ColumnIR(key="status", label="Status", value_type="enum"),
                    ],
                    actions=[
                        ActionIR(key="create", label="New", action_type="create", scope="page"),
                        ActionIR(
                            key="refund",
                            label="Refund",
                            action_type="api_call",
                            scope="row",
                            visible_when=Condition(expression="status == 'FAIL'"),
                            api_name="refundTrade",
                        ),
                    ],
                ),
                ContainerIR(
                    key="trade_dialog",
                    type="dialog",
                    title="Trade Form",
                    fields=[
                        FieldIR(key="price", label="Price", component="number", required=True),
                        FieldIR(key="count", label="Count", component="number", required=True),
                        FieldIR(
                            key="amount",
                            label="Amount",
                            component="number",
                            disabled_when=Condition(expression="true"),
                        ),
                    ],
                    actions=[
                        ActionIR(key="submit", label="Submit", action_type="submit", scope="dialog")
                    ],
                ),
            ],
            apis=[
                ApiIR(
                    name="getTradeList",
                    method="GET",
                    path="/api/trade/list",
                    purpose="Query trade records",
                ),
                ApiIR(
                    name="refundTrade",
                    method="POST",
                    path="/api/trade/refund",
                    purpose="Refund failed trades",
                ),
            ],
            formulas=[
                Formula(target="trade_dialog.amount", expression="price * count"),
            ],
            state_transitions=[
                StateTransitionIR(
                    from_status="FAIL",
                    to_status="REFUNDING",
                    trigger_action="refund",
                )
            ],
        )

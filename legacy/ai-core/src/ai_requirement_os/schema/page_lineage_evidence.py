"""Evidence bundle models for agent-first page lineage generation."""

from __future__ import annotations

from pydantic import BaseModel, Field

from ai_requirement_os.schema.page_lineage import BackendPointer, LineageField, PageInfo


class EvidenceSnippet(BaseModel):
    role: str = ""
    path: str = ""
    locator: str = ""
    content: str = ""


class BackendTraceEvidence(BaseModel):
    backend_entry: str = ""
    backend_pointers: list[BackendPointer] = Field(default_factory=list)
    snippets: list[EvidenceSnippet] = Field(default_factory=list)
    unknown_reason: str = ""
    deep_logic_flag: str = ""


class InitialFetchEvidence(BaseModel):
    order: int
    name: str = ""
    api: str = ""
    method: str = ""
    frontend_entry: str = ""
    frontend_snippets: list[EvidenceSnippet] = Field(default_factory=list)
    api_snippets: list[EvidenceSnippet] = Field(default_factory=list)
    backend_trace: BackendTraceEvidence = Field(default_factory=BackendTraceEvidence)


class RequestFlowEvidence(BaseModel):
    order: int
    api_method_name: str = ""
    api: str = ""
    method: str = ""
    frontend_handler: str = ""
    frontend_snippets: list[EvidenceSnippet] = Field(default_factory=list)
    api_snippets: list[EvidenceSnippet] = Field(default_factory=list)
    backend_trace: BackendTraceEvidence = Field(default_factory=BackendTraceEvidence)


class ActionEvidence(BaseModel):
    name: str = ""
    frontend_handler: str = ""
    summary: str = ""
    request_flow: list[RequestFlowEvidence] = Field(default_factory=list)


class PageLineageEvidenceBundle(BaseModel):
    project_name: str
    page_info: PageInfo
    search_fields: list[LineageField] = Field(default_factory=list)
    display_fields: list[LineageField] = Field(default_factory=list)
    initial_fetches: list[InitialFetchEvidence] = Field(default_factory=list)
    actions: list[ActionEvidence] = Field(default_factory=list)
    backend_overview: dict[str, list[str]] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    deep_logic_flags: dict[str, str] = Field(default_factory=dict)

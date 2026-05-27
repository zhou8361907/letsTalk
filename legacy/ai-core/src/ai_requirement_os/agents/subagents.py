"""Sub-agent profiles and future delegation hooks."""

from pydantic import BaseModel


class SubAgentProfile(BaseModel):
    key: str
    role: str
    responsibility: str
    isolated_context: bool = True


DEFAULT_SUB_AGENTS = [
    SubAgentProfile(
        key="page_doc_agent",
        role="documenter",
        responsibility="Focus on page-level requirement documentation and summaries.",
    ),
    SubAgentProfile(
        key="sandbox_agent",
        role="sandbox-builder",
        responsibility="Focus on runtime schema and sandbox-facing UI projection.",
    ),
    SubAgentProfile(
        key="review_agent",
        role="reviewer",
        responsibility="Review proposed page patches, rules, and impact summaries.",
    ),
]

"""Source repository configuration models."""

from pydantic import BaseModel, Field


class SourceProjectConfig(BaseModel):
    """Path configuration for one target business system."""

    project_name: str
    frontend_path: str | None = Field(default=None, description="Absolute path to the Vue repo.")
    backend_path: str | None = Field(
        default=None, description="Absolute path to the SpringBoot repo."
    )
    entry_pages: list[str] = Field(default_factory=list)

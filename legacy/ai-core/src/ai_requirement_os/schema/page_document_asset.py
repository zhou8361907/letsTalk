"""页面文档资产模型。

这层的目标不是替代 `page_analysis`，而是把“页面解析后的产物”正式落盘，
并且让这些产物能稳定地挂在具体页面上，供 V1 后续和 V2 agent 能力复用。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

PageDocumentStatus = Literal["missing", "current", "stale"]
PageArtifactKind = Literal["documentation", "lineage"]


class PageDocumentIdentity(BaseModel):
    """稳定标识一个页面。

    - `project_name + page_path` 是真实业务定位
    - `page_key` 是内部稳定主键，便于目录命名和后续索引
    """

    project_name: str
    page_path: str
    page_key: str
    page_name: str = ""


class PageDocumentFingerprint(BaseModel):
    """记录参与页面文档判断的源码指纹。"""

    path: str
    sha256: str


class PageDocumentSourceSnapshot(BaseModel):
    """页面源码快照。

    `source_hash` 不是单文件 hash，而是当前页面关联文件指纹的汇总 hash。
    只要关联文件集合或任意文件内容变了，`source_hash` 就会变化。
    """

    source_hash: str
    fingerprint_count: int = 0
    fingerprints: list[PageDocumentFingerprint] = Field(default_factory=list)
    generated_from_analysis_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PageDocumentArtifact(BaseModel):
    """一个可持久化的页面产物。

    这里统一用 `json_payload + markdown + meta` 结构承载，不把上层 LLM 返回模型
    直接硬耦合进存储层，后面迁移 provider / prompt / schema 时更稳。
    """

    kind: PageArtifactKind
    mode: str = ""
    model: str = ""
    warnings: list[str] = Field(default_factory=list)
    json_payload: dict[str, Any] = Field(default_factory=dict)
    markdown: str = ""
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PageDocumentAsset(BaseModel):
    """一个页面在某个源码版本下的文档资产快照。"""

    asset_id: str
    version: int = 1
    identity: PageDocumentIdentity
    source: PageDocumentSourceSnapshot
    documentation: PageDocumentArtifact | None = None
    lineage: PageDocumentArtifact | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PageDocumentIndexEntry(BaseModel):
    """索引层只保存快速定位所需的信息。"""

    project_name: str
    page_path: str
    page_key: str
    page_name: str = ""
    latest_version: int
    latest_asset_path: str
    latest_source_hash: str
    available_artifacts: list[PageArtifactKind] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PageDocumentBindingSummary(BaseModel):
    """返回给 API / 前端的页面挂接摘要。

    它的职责是回答：
    - 这个页面有没有文档资产
    - 当前资产是不是对应最新源码
    - 当前资产里有哪些产物
    """

    status: PageDocumentStatus = "missing"
    project_name: str
    page_path: str
    page_key: str
    page_name: str = ""
    latest_version: int | None = None
    latest_source_hash: str = ""
    current_source_hash: str = ""
    available_artifacts: list[PageArtifactKind] = Field(default_factory=list)
    updated_at: datetime | None = None

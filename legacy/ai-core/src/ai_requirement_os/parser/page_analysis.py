"""页面分析资产管理。

目标：
1. 把“页面 -> 关联文件 -> 文档 -> 沙箱 schema”串成可复用资产
2. 默认避免重复分析
3. 当源码变更时允许识别并刷新
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field

from ai_requirement_os.llm.page_doc_generator import (
    LLMPageDocResult,
    generate_page_documentation_with_llm,
)
from ai_requirement_os.llm.page_patch_generator import SandboxPatchResult
from ai_requirement_os.parser.page_document_store import (
    get_page_document_binding_summary,
    save_page_documentation_asset,
)
from ai_requirement_os.parser.page_workspace import (
    PageWorkspace,
    build_page_workspace,
)
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.schema.page_document_asset import PageDocumentBindingSummary
from ai_requirement_os.settings import PROJECT_ROOT

ANALYSIS_STORE_PATH = PROJECT_ROOT / ".agent" / "page_analysis.json"


class FileFingerprint(BaseModel):
    path: str
    sha256: str


class PageAnalysisAsset(BaseModel):
    asset_key: str
    project_name: str
    page_path: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    fingerprints: list[FileFingerprint] = Field(default_factory=list)
    workspace: PageWorkspace
    llm_doc_result: LLMPageDocResult | None = None
    patch_history: list[PagePatchRecord] = Field(default_factory=list)


class PagePatchRecord(BaseModel):
    record_id: str = Field(default_factory=lambda: uuid4().hex)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    user_request: str
    patch_result: SandboxPatchResult


class PageAnalysisResult(BaseModel):
    source: str
    is_stale: bool
    asset: PageAnalysisAsset
    document_asset: PageDocumentBindingSummary | None = None


def _read_store() -> dict[str, dict]:
    if not ANALYSIS_STORE_PATH.exists():
        return {}
    return json.loads(ANALYSIS_STORE_PATH.read_text(encoding="utf-8"))


def _write_store(data: dict[str, dict]) -> None:
    ANALYSIS_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    ANALYSIS_STORE_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _asset_key(project_name: str, page_path: str) -> str:
    return f"{project_name}::{page_path}"


def _fingerprint_file(path: str) -> FileFingerprint:
    file_path = Path(path)
    content = file_path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    return FileFingerprint(path=path, sha256=digest)


def _fingerprint_workspace(workspace: PageWorkspace) -> list[FileFingerprint]:
    fingerprints: list[FileFingerprint] = []
    for related in workspace.related_files:
        path = Path(related.path)
        if path.exists() and path.is_file():
            fingerprints.append(_fingerprint_file(related.path))
    return fingerprints


def _is_same_fingerprint(left: list[FileFingerprint], right: list[FileFingerprint]) -> bool:
    left_map = {item.path: item.sha256 for item in left}
    right_map = {item.path: item.sha256 for item in right}
    return left_map == right_map


def save_page_analysis_asset(asset: PageAnalysisAsset) -> None:
    store = _read_store()
    store[asset.asset_key] = asset.model_dump(mode="json")
    _write_store(store)


def load_page_analysis_asset(project_name: str, page_path: str) -> PageAnalysisAsset | None:
    store = _read_store()
    raw = store.get(_asset_key(project_name, page_path))
    if not raw:
        return None
    workspace = raw.get("workspace", {})
    selected_page = workspace.get("selected_page", {})
    route_hint = selected_page.get("route_hint") or "/"
    if "sandbox_route" not in workspace:
        segments = [segment for segment in route_hint.split("/") if segment]
        normalized = [
            f"{segment[:1].lower()}{segment[1:]}" if segment else segment
            for segment in segments
        ]
        workspace["sandbox_route"] = "/" + "/".join(normalized) if normalized else "/"
    from ai_requirement_os.agents.config import load_agent_config

    sandbox_base_url = load_agent_config().sandbox.sandbox_base_url.rstrip("/")
    workspace["sandbox_url"] = f"{sandbox_base_url}/#{workspace['sandbox_route']}"
    raw["workspace"] = workspace
    raw_patch_history = raw.get("patch_history", [])
    normalized_patch_history: list[dict] = []
    for item in raw_patch_history:
        if "patch_result" in item:
            normalized_patch_history.append(item)
            continue
        normalized_patch_history.append(
            {
                "user_request": "历史记录迁移：未保留原始需求文本",
                "patch_result": item,
            }
        )
    raw["patch_history"] = normalized_patch_history
    return PageAnalysisAsset.model_validate(raw)


def get_or_create_page_analysis(
    config: SourceProjectConfig,
    page_path: str,
    *,
    refresh: bool = False,
) -> PageAnalysisResult:
    """返回页面分析资产。

    规则：
    - `refresh=False` 时优先复用缓存
    - 只要关联文件指纹一致，就直接返回缓存
    - 若指纹变化，则标记为 stale，并自动更新 deterministic workspace
    """
    fresh_workspace = build_page_workspace(config, page_path)
    fresh_fingerprints = _fingerprint_workspace(fresh_workspace)
    asset_key = _asset_key(config.project_name, page_path)
    cached_asset = load_page_analysis_asset(config.project_name, page_path)

    if cached_asset and not refresh:
        same = _is_same_fingerprint(cached_asset.fingerprints, fresh_fingerprints)
        if same:
            return PageAnalysisResult(
                source="cache",
                is_stale=False,
                asset=cached_asset,
                document_asset=get_page_document_binding_summary(
                    project_name=config.project_name,
                    page_path=page_path,
                    page_name=fresh_workspace.documentation.page_name,
                    fingerprints=fresh_fingerprints,
                ),
            )

    asset = PageAnalysisAsset(
        asset_key=asset_key,
        project_name=config.project_name,
        page_path=page_path,
        fingerprints=fresh_fingerprints,
        workspace=fresh_workspace,
        llm_doc_result=(
            cached_asset.llm_doc_result
            if cached_asset and _is_same_fingerprint(cached_asset.fingerprints, fresh_fingerprints)
            else None
        ),
        patch_history=(
            cached_asset.patch_history
            if cached_asset and _is_same_fingerprint(cached_asset.fingerprints, fresh_fingerprints)
            else []
        ),
    )
    save_page_analysis_asset(asset)
    return PageAnalysisResult(
        source="refresh" if refresh else ("stale_refresh" if cached_asset else "fresh"),
        is_stale=bool(
            cached_asset
            and not _is_same_fingerprint(cached_asset.fingerprints, fresh_fingerprints)
        ),
        asset=asset,
        document_asset=get_page_document_binding_summary(
            project_name=config.project_name,
            page_path=page_path,
            page_name=fresh_workspace.documentation.page_name,
            fingerprints=fresh_fingerprints,
        ),
    )


def get_or_create_llm_page_doc(
    config: SourceProjectConfig,
    page_path: str,
    *,
    refresh: bool = False,
) -> PageAnalysisResult:
    """返回带 LLM 文档的页面分析资产。"""
    result = get_or_create_page_analysis(config, page_path, refresh=refresh)
    asset = result.asset

    if asset.llm_doc_result and not refresh and not result.is_stale:
        return PageAnalysisResult(
            source="cache",
            is_stale=False,
            asset=asset,
            document_asset=result.document_asset,
        )

    llm_result = generate_page_documentation_with_llm(asset.workspace)
    asset.llm_doc_result = llm_result
    asset.workspace.documentation = llm_result.documentation
    save_page_analysis_asset(asset)
    save_page_documentation_asset(
        project_name=config.project_name,
        page_path=page_path,
        page_name=asset.workspace.documentation.page_name,
        fingerprints=asset.fingerprints,
        result=llm_result,
    )
    return PageAnalysisResult(
        source="refresh" if refresh else "fresh_llm",
        is_stale=False,
        asset=asset,
        document_asset=get_page_document_binding_summary(
            project_name=config.project_name,
            page_path=page_path,
            page_name=asset.workspace.documentation.page_name,
            fingerprints=asset.fingerprints,
        ),
    )

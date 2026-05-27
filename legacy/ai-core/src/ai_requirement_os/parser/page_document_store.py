"""页面文档资产落盘与索引管理。

设计原则：
1. 先用文件系统落盘，简单、可审计、便于调试
2. 索引和实体分离，便于后续迁移数据库
3. 尽量对损坏的索引/资产文件容错，不因为一条脏数据拖垮整个工作台
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from ai_requirement_os.llm.page_doc_generator import LLMPageDocResult
from ai_requirement_os.llm.page_lineage_generator import LLMPageLineageResult
from ai_requirement_os.parser.page_workspace import PageDocumentation
from ai_requirement_os.schema.page_document_asset import (
    PageArtifactKind,
    PageDocumentArtifact,
    PageDocumentAsset,
    PageDocumentBindingSummary,
    PageDocumentFingerprint,
    PageDocumentIdentity,
    PageDocumentIndexEntry,
    PageDocumentSourceSnapshot,
)
from ai_requirement_os.settings import PROJECT_ROOT

PAGE_DOCUMENT_ROOT = PROJECT_ROOT / ".agent" / "page_documents"
PAGE_DOCUMENT_INDEX_PATH = PAGE_DOCUMENT_ROOT / "index.json"


def _safe_read_json(path: Path) -> dict[str, Any]:
    """尽量稳地读取 JSON。

    如果文件不存在、为空或内容损坏，统一退回空 dict。
    这样一来本地资产即使有单次写坏，也不会影响主流程继续工作。
    """

    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _safe_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip())
    normalized = normalized.strip("-_")
    return normalized or "page"


def build_page_document_identity(
    project_name: str,
    page_path: str,
    *,
    page_name: str = "",
) -> PageDocumentIdentity:
    """基于项目和页面路径生成稳定页面主键。"""

    page_stem = Path(page_path).stem or "page"
    digest = hashlib.sha1(f"{project_name}::{page_path}".encode("utf-8")).hexdigest()[:12]
    page_key = f"{_slugify(page_stem)}-{digest}"
    return PageDocumentIdentity(
        project_name=project_name,
        page_path=page_path,
        page_key=page_key,
        page_name=page_name,
    )


def _normalize_fingerprints(fingerprints: list[Any]) -> list[PageDocumentFingerprint]:
    normalized: list[PageDocumentFingerprint] = []
    for item in fingerprints:
        path = getattr(item, "path", None)
        sha256 = getattr(item, "sha256", None)
        if not path or not sha256:
            continue
        normalized.append(PageDocumentFingerprint(path=str(path), sha256=str(sha256)))
    normalized.sort(key=lambda item: item.path)
    return normalized


def build_source_snapshot(fingerprints: list[Any]) -> PageDocumentSourceSnapshot:
    """把分析阶段的文件指纹汇总成页面级源码快照。"""

    normalized = _normalize_fingerprints(fingerprints)
    digest_input = "\n".join(f"{item.path}:{item.sha256}" for item in normalized)
    source_hash = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()
    return PageDocumentSourceSnapshot(
        source_hash=source_hash,
        fingerprint_count=len(normalized),
        fingerprints=normalized,
    )


def _project_dir(project_name: str) -> Path:
    return PAGE_DOCUMENT_ROOT / _slugify(project_name)


def _page_dir(identity: PageDocumentIdentity) -> Path:
    return _project_dir(identity.project_name) / identity.page_key


def _version_file(identity: PageDocumentIdentity, version: int) -> Path:
    return _page_dir(identity) / f"v{version:04d}.json"


def _latest_file(identity: PageDocumentIdentity) -> Path:
    return _page_dir(identity) / "latest.json"


def _render_documentation_markdown(documentation: PageDocumentation) -> str:
    """给页面文档也补一份轻量 Markdown，便于直接预览或导出。"""

    lines = [
        f"# 页面说明：{documentation.page_name or '未命名页面'}",
        "",
        f"- 页面路径：`{documentation.page_path or '-'}`",
        f"- 页面用途：{documentation.purpose or '-'}",
        "",
        "## 页面结构",
    ]
    if documentation.structures:
        lines.extend(f"- {item}" for item in documentation.structures)
    else:
        lines.append("- -")

    lines.extend(["", "## 搜索字段"])
    if documentation.search_fields:
        for field in documentation.search_fields:
            lines.append(f"- {field.label} (`{field.key}` / {field.component})")
    else:
        lines.append("- -")

    lines.extend(["", "## 表格字段"])
    if documentation.table_columns:
        for column in documentation.table_columns:
            lines.append(f"- {column.label} (`{column.prop or '-'}`)")
    else:
        lines.append("- -")

    lines.extend(["", "## 页面动作"])
    if documentation.page_actions:
        lines.extend(f"- {item}" for item in documentation.page_actions)
    else:
        lines.append("- -")

    lines.extend(["", "## 行级动作"])
    if documentation.row_actions:
        lines.extend(f"- {item}" for item in documentation.row_actions)
    else:
        lines.append("- -")
    return "\n".join(lines)


def _load_index_map() -> dict[str, dict[str, Any]]:
    raw = _safe_read_json(PAGE_DOCUMENT_INDEX_PATH)
    return raw if isinstance(raw, dict) else {}


def _write_index_map(index_map: dict[str, dict[str, Any]]) -> None:
    _safe_write_json(PAGE_DOCUMENT_INDEX_PATH, index_map)


def _index_key(project_name: str, page_path: str) -> str:
    return f"{project_name}::{page_path}"


def _load_asset_from_file(path: Path) -> PageDocumentAsset | None:
    raw = _safe_read_json(path)
    if not raw:
        return None
    try:
        return PageDocumentAsset.model_validate(raw)
    except Exception:
        return None


def load_latest_page_document_asset(project_name: str, page_path: str) -> PageDocumentAsset | None:
    """读取某页面的最新文档资产。"""

    index_map = _load_index_map()
    raw = index_map.get(_index_key(project_name, page_path))
    if not raw:
        return None
    try:
        entry = PageDocumentIndexEntry.model_validate(raw)
    except Exception:
        return None
    return _load_asset_from_file(Path(entry.latest_asset_path))


def _persist_asset(asset: PageDocumentAsset) -> None:
    version_path = _version_file(asset.identity, asset.version)
    latest_path = _latest_file(asset.identity)
    payload = asset.model_dump(mode="json")
    _safe_write_json(version_path, payload)
    _safe_write_json(latest_path, payload)

    available_artifacts: list[PageArtifactKind] = []
    if asset.documentation is not None:
        available_artifacts.append("documentation")
    if asset.lineage is not None:
        available_artifacts.append("lineage")

    index_map = _load_index_map()
    index_map[_index_key(asset.identity.project_name, asset.identity.page_path)] = PageDocumentIndexEntry(
        project_name=asset.identity.project_name,
        page_path=asset.identity.page_path,
        page_key=asset.identity.page_key,
        page_name=asset.identity.page_name,
        latest_version=asset.version,
        latest_asset_path=latest_path.as_posix(),
        latest_source_hash=asset.source.source_hash,
        available_artifacts=available_artifacts,
        updated_at=asset.updated_at,
    ).model_dump(mode="json")
    _write_index_map(index_map)


def _merge_or_create_asset(
    *,
    identity: PageDocumentIdentity,
    source: PageDocumentSourceSnapshot,
) -> PageDocumentAsset:
    """尽量复用相同源码快照下的最新资产，否则递增版本号。"""

    current = load_latest_page_document_asset(identity.project_name, identity.page_path)
    now = datetime.now(UTC)
    if current and current.source.source_hash == source.source_hash:
        current.identity = identity
        current.source = source
        current.updated_at = now
        return current

    next_version = (current.version + 1) if current else 1
    return PageDocumentAsset(
        asset_id=uuid4().hex,
        version=next_version,
        identity=identity,
        source=source,
        created_at=now,
        updated_at=now,
    )


def save_page_documentation_asset(
    *,
    project_name: str,
    page_path: str,
    page_name: str,
    fingerprints: list[Any],
    result: LLMPageDocResult,
) -> PageDocumentAsset:
    """把页面说明文档保存为正式资产。"""

    identity = build_page_document_identity(project_name, page_path, page_name=page_name)
    source = build_source_snapshot(fingerprints)
    asset = _merge_or_create_asset(identity=identity, source=source)
    asset.documentation = PageDocumentArtifact(
        kind="documentation",
        mode=result.mode,
        model=result.model,
        warnings=result.warnings,
        json_payload=result.documentation.model_dump(mode="json"),
        markdown=_render_documentation_markdown(result.documentation),
    )
    asset.updated_at = datetime.now(UTC)
    _persist_asset(asset)
    return asset


def save_page_lineage_asset(
    *,
    project_name: str,
    page_path: str,
    page_name: str,
    fingerprints: list[Any],
    result: LLMPageLineageResult,
) -> PageDocumentAsset:
    """把页面数据解析结果保存为正式资产。"""

    identity = build_page_document_identity(project_name, page_path, page_name=page_name)
    source = build_source_snapshot(fingerprints)
    asset = _merge_or_create_asset(identity=identity, source=source)
    asset.lineage = PageDocumentArtifact(
        kind="lineage",
        mode=result.mode,
        model=result.model,
        warnings=result.warnings,
        json_payload=result.lineage.model_dump(mode="json"),
        markdown=result.markdown,
    )
    asset.updated_at = datetime.now(UTC)
    _persist_asset(asset)
    return asset


def get_page_document_binding_summary(
    *,
    project_name: str,
    page_path: str,
    page_name: str,
    fingerprints: list[Any],
) -> PageDocumentBindingSummary:
    """给页面分析 / 页面列表返回一个可直接消费的挂接摘要。"""

    identity = build_page_document_identity(project_name, page_path, page_name=page_name)
    current_source = build_source_snapshot(fingerprints)
    latest_asset = load_latest_page_document_asset(project_name, page_path)
    if latest_asset is None:
        return PageDocumentBindingSummary(
            status="missing",
            project_name=project_name,
            page_path=page_path,
            page_key=identity.page_key,
            page_name=page_name,
            current_source_hash=current_source.source_hash,
        )

    available_artifacts: list[PageArtifactKind] = []
    if latest_asset.documentation is not None:
        available_artifacts.append("documentation")
    if latest_asset.lineage is not None:
        available_artifacts.append("lineage")

    return PageDocumentBindingSummary(
        status="current" if latest_asset.source.source_hash == current_source.source_hash else "stale",
        project_name=project_name,
        page_path=page_path,
        page_key=identity.page_key,
        page_name=page_name,
        latest_version=latest_asset.version,
        latest_source_hash=latest_asset.source.source_hash,
        current_source_hash=current_source.source_hash,
        available_artifacts=available_artifacts,
        updated_at=latest_asset.updated_at,
    )

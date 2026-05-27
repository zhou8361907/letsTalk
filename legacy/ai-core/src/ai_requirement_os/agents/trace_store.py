"""Agent 执行追踪的持久化存储。

追踪数据存储在 .agent/traces/ 目录下，按 trace_id 组织。
同时维护一个索引文件，便于按页面查询历史追踪。
"""

from __future__ import annotations

import json
from pathlib import Path

from ai_requirement_os.schema.agent_trace import AgentAnalysisTrace
from ai_requirement_os.settings import PROJECT_ROOT

TRACE_STORE_PATH = PROJECT_ROOT / ".agent" / "traces"
TRACE_INDEX_PATH = TRACE_STORE_PATH / "index.json"


def _ensure_trace_dir() -> None:
    """确保追踪目录存在"""
    TRACE_STORE_PATH.mkdir(parents=True, exist_ok=True)


def _load_index() -> dict[str, list[str]]:
    """加载追踪索引

    返回格式: {
        "project_name::page_path": ["trace_id1", "trace_id2", ...]
    }
    """
    if not TRACE_INDEX_PATH.exists():
        return {}
    try:
        return json.loads(TRACE_INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_index(index: dict[str, list[str]]) -> None:
    """保存追踪索引"""
    _ensure_trace_dir()
    TRACE_INDEX_PATH.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _index_key(project_name: str, page_path: str) -> str:
    """生成索引键"""
    return f"{project_name}::{page_path}"


def save_agent_trace(trace: AgentAnalysisTrace) -> None:
    """保存 Agent 执行追踪"""
    _ensure_trace_dir()

    # 保存追踪文件
    trace_file = TRACE_STORE_PATH / f"{trace.trace_id}.json"
    trace_file.write_text(
        trace.model_dump_json(indent=2),
        encoding="utf-8",
    )

    # 更新索引
    index = _load_index()
    key = _index_key(trace.project_name, trace.page_path)
    if key not in index:
        index[key] = []
    if trace.trace_id not in index[key]:
        index[key].append(trace.trace_id)
    _save_index(index)


def load_agent_trace(trace_id: str) -> AgentAnalysisTrace | None:
    """加载 Agent 执行追踪"""
    trace_file = TRACE_STORE_PATH / f"{trace_id}.json"

    if not trace_file.exists():
        return None

    try:
        data = json.loads(trace_file.read_text(encoding="utf-8"))
        return AgentAnalysisTrace.model_validate(data)
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def list_traces_for_page(project_name: str, page_path: str, limit: int = 10) -> list[AgentAnalysisTrace]:
    """列出某个页面的所有分析追踪（按时间倒序）"""
    index = _load_index()
    key = _index_key(project_name, page_path)
    trace_ids = index.get(key, [])

    traces: list[AgentAnalysisTrace] = []
    for trace_id in trace_ids:
        trace = load_agent_trace(trace_id)
        if trace:
            traces.append(trace)

    # 按开始时间倒序排序
    traces.sort(key=lambda t: t.started_at, reverse=True)
    return traces[:limit]


def delete_agent_trace(trace_id: str) -> bool:
    """删除 Agent 执行追踪"""
    trace_file = TRACE_STORE_PATH / f"{trace_id}.json"

    if not trace_file.exists():
        return False

    # 从索引中移除
    trace = load_agent_trace(trace_id)
    if trace:
        index = _load_index()
        key = _index_key(trace.project_name, trace.page_path)
        if key in index and trace_id in index[key]:
            index[key].remove(trace_id)
            if not index[key]:
                del index[key]
            _save_index(index)

    # 删除文件
    try:
        trace_file.unlink()
        return True
    except OSError:
        return False

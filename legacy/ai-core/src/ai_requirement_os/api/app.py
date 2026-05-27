import logging
import os
import sys
import json
from datetime import datetime

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ai_requirement_os.agents.code_tools import (
    CodeModificationPlan,
    CodeModificationResult,
    CodePreviewResult,
    CodeWorkspaceResetResult,
)
from ai_requirement_os.agents.harness import AgentRunRequest, AgentRunResult
from ai_requirement_os.agents.models import AgentManifest, AgentSession, AgentTask
from ai_requirement_os.agents.service import get_agent_runtime
from ai_requirement_os.ir_core.models import PageIR
from ai_requirement_os.llm.page_doc_generator import (
    LLMPageDocResult,
    generate_page_documentation_with_llm,
)
from ai_requirement_os.llm.page_lineage_generator import (
    LLMPageLineageResult,
    build_page_lineage_evidence_bundle,
    generate_page_lineage_with_llm,
    generate_page_lineage_with_trace,
)
from ai_requirement_os.llm.page_patch_generator import generate_page_patch_with_llm
from ai_requirement_os.parser.discovery import ProjectDiscoverySummary, discover_project
from ai_requirement_os.parser.page_analysis import (
    PageAnalysisResult,
    PagePatchRecord,
    get_or_create_llm_page_doc,
    get_or_create_page_analysis,
    save_page_analysis_asset,
)
from ai_requirement_os.parser.page_document_store import (
    load_latest_page_document_asset,
    save_page_lineage_asset,
)
from ai_requirement_os.parser.page_workspace import PageWorkspace
from ai_requirement_os.parser.project_source import SourceProjectConfig
from ai_requirement_os.schema.page_document_asset import PageDocumentAsset
from ai_requirement_os.schema.runtime_schema import RuntimePageSchema, build_runtime_schema
from ai_requirement_os.schema.page_lineage_evidence import PageLineageEvidenceBundle
from ai_requirement_os.schema.agent_trace import AgentAnalysisTrace, StreamEvent
from ai_requirement_os.agents.trace_store import (
    save_agent_trace,
    load_agent_trace,
    list_traces_for_page,
)
from ai_requirement_os.settings import (
    APP_NAME,
    APP_VERSION,
    DEFAULT_SAMPLE_BACKEND,
    DEFAULT_SAMPLE_FRONTEND,
    DEFAULT_SAMPLE_PROJECT,
    PACKAGE_ROOT,
)


def _configure_application_logging() -> None:
    level_name = os.getenv("AIRO_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    has_stdout_handler = any(
        isinstance(handler, logging.StreamHandler) and getattr(handler, "stream", None) is sys.stdout
        for handler in root_logger.handlers
    )
    if not has_stdout_handler:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
    logging.getLogger("ai_requirement_os").setLevel(level)


_configure_application_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title=APP_NAME, version=APP_VERSION)

WEB_ROOT = PACKAGE_ROOT / "web"
ASSETS_ROOT = WEB_ROOT / "assets"

app.mount("/assets", StaticFiles(directory=ASSETS_ROOT), name="assets")


class PagePatchRequest(BaseModel):
    config: SourceProjectConfig
    page_path: str
    user_request: str
    refresh: bool = False


class PagePatchHistoryRequest(BaseModel):
    config: SourceProjectConfig
    page_path: str


class PagePatchDeleteRequest(PagePatchHistoryRequest):
    record_id: str


class CodePlanRequest(BaseModel):
    config: SourceProjectConfig
    page_path: str
    user_request: str


class WorkspaceResetRequest(BaseModel):
    config: SourceProjectConfig


@app.get("/")
def root() -> RedirectResponse:
    """Redirect to the workbench entry page."""
    return RedirectResponse(url="/workbench")


@app.get("/workbench")
def workbench() -> FileResponse:
    """Serve the first-pass analysis workbench UI."""
    return FileResponse(WEB_ROOT / "workbench.html")


@app.get("/health")
def health() -> dict[str, str]:
    """Simple health endpoint."""
    logger.info("health_check")
    return {"status": "ok"}


@app.get("/example/page-ir", response_model=PageIR)
def example_page_ir() -> PageIR:
    """Return a representative MVP page IR."""
    return PageIR.sample()


@app.get("/example/runtime-schema", response_model=RuntimePageSchema)
def example_runtime_schema() -> RuntimePageSchema:
    """Return the runtime schema derived from the sample IR."""
    return build_runtime_schema(PageIR.sample())


@app.get("/api/sample-project", response_model=SourceProjectConfig)
def sample_project() -> SourceProjectConfig:
    """Return the default sample project config."""
    return SourceProjectConfig(
        project_name=DEFAULT_SAMPLE_PROJECT.name,
        frontend_path=DEFAULT_SAMPLE_FRONTEND.as_posix(),
        backend_path=DEFAULT_SAMPLE_BACKEND.as_posix(),
        entry_pages=[],
    )


@app.post("/api/analyze/discovery", response_model=ProjectDiscoverySummary)
def analyze_discovery(config: SourceProjectConfig) -> ProjectDiscoverySummary:
    """Discover project structure before deeper IR parsing."""
    logger.info(
        "analyze_discovery project=%s frontend=%s backend=%s",
        config.project_name,
        config.frontend_path,
        config.backend_path,
    )
    return discover_project(config)


@app.post("/api/page-workspace", response_model=PageWorkspace)
def page_workspace(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> PageWorkspace:
    """Assemble a page-centric requirement workspace for one concrete page."""
    logger.info("page_workspace page=%s refresh=%s", page_path, refresh)
    try:
        return get_or_create_page_analysis(
            config,
            page_path,
            refresh=refresh,
        ).asset.workspace
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/llm/page-documentation", response_model=LLMPageDocResult)
def llm_page_documentation(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> LLMPageDocResult:
    """Use the LLM to refine page documentation from a page-scoped context package."""
    logger.info("llm_page_documentation page=%s refresh=%s", page_path, refresh)
    try:
        return get_or_create_llm_page_doc(
            config,
            page_path,
            refresh=refresh,
        ).asset.llm_doc_result or generate_page_documentation_with_llm(
            get_or_create_page_analysis(config, page_path).asset.workspace
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _build_page_lineage_response(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> LLMPageLineageResult:
    try:
        analysis_result = get_or_create_page_analysis(
            config,
            page_path,
            refresh=refresh,
        )
        workspace = analysis_result.asset.workspace
        lineage_result = generate_page_lineage_with_llm(workspace)
        # 页面数据解析报告是后续 agent 很重要的页面资产，因此这里在生成成功后
        # 立即落盘，避免只在响应里短暂存在。
        save_page_lineage_asset(
            project_name=config.project_name,
            page_path=page_path,
            page_name=workspace.documentation.page_name,
            fingerprints=analysis_result.asset.fingerprints,
            result=lineage_result,
        )
        return lineage_result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _build_page_lineage_with_trace(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> tuple[LLMPageLineageResult, AgentAnalysisTrace]:
    """生成页面血缘分析，同时记录追踪"""
    try:
        analysis_result = get_or_create_page_analysis(
            config,
            page_path,
            refresh=refresh,
        )
        workspace = analysis_result.asset.workspace
        lineage_result, trace = generate_page_lineage_with_trace(workspace)
        
        # 保存追踪
        save_agent_trace(trace)
        
        # 保存血缘资产
        save_page_lineage_asset(
            project_name=config.project_name,
            page_path=page_path,
            page_name=workspace.documentation.page_name,
            fingerprints=analysis_result.asset.fingerprints,
            result=lineage_result,
        )
        
        return lineage_result, trace
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/page-documents/latest", response_model=PageDocumentAsset | None)
def latest_page_document(
    project_name: str,
    page_path: str,
) -> PageDocumentAsset | None:
    """读取某个页面当前挂接的最新文档资产。"""
    return load_latest_page_document_asset(project_name, page_path)


@app.post("/api/page-lineage", response_model=LLMPageLineageResult)
def page_lineage(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> LLMPageLineageResult:
    """Generate the V1 page lineage JSON and derived Markdown report."""
    logger.info("page_lineage page=%s refresh=%s", page_path, refresh)
    return _build_page_lineage_response(config, page_path, refresh)


@app.post("/api/page-lineage/evidence", response_model=PageLineageEvidenceBundle)
def page_lineage_evidence(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> PageLineageEvidenceBundle:
    """Return the pruned Evidence Bundle used by the agent-first page lineage pipeline."""
    logger.info("page_lineage_evidence page=%s refresh=%s", page_path, refresh)
    try:
        workspace = get_or_create_page_analysis(
            config,
            page_path,
            refresh=refresh,
        ).asset.workspace
        return build_page_lineage_evidence_bundle(workspace)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/llm/page-lineage", response_model=LLMPageLineageResult, deprecated=True)
def llm_page_lineage(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> LLMPageLineageResult:
    """Deprecated compatibility wrapper for the older lineage endpoint."""
    return _build_page_lineage_response(config, page_path, refresh)


@app.post("/api/page-analysis", response_model=PageAnalysisResult)
def page_analysis(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> PageAnalysisResult:
    """Return the linked analysis asset for one page."""
    logger.info("page_analysis page=%s refresh=%s", page_path, refresh)
    try:
        return get_or_create_page_analysis(config, page_path, refresh=refresh)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class CacheStatusResponse(BaseModel):
    """缓存状态响应"""
    cached: bool
    is_stale: bool = False
    updated_at: datetime | None = None
    has_llm_doc: bool = False
    has_lineage: bool = False
    message: str


@app.get("/api/page-analysis/cached", response_model=CacheStatusResponse)
def check_cached_analysis(
    project_name: str,
    page_path: str,
    frontend_path: str,
    backend_path: str,
) -> CacheStatusResponse:
    """检查是否有缓存的分析结果"""
    logger.info("check_cached_analysis project=%s page=%s", project_name, page_path)
    
    try:
        # 加载缓存的资产
        asset = load_page_analysis_asset(project_name, page_path)
        
        if not asset:
            return CacheStatusResponse(
                cached=False,
                message="没有缓存的分析结果"
            )
        
        # 构建配置
        config = SourceProjectConfig(
            project_name=project_name,
            frontend_path=frontend_path,
            backend_path=backend_path,
            entry_pages=[],
        )
        
        # 检查是否过期（对比文件指纹）
        from ai_requirement_os.parser.page_workspace import build_page_workspace
        from ai_requirement_os.parser.page_analysis import (
            _fingerprint_workspace,
            _is_same_fingerprint,
        )
        
        fresh_workspace = build_page_workspace(config, page_path)
        fresh_fingerprints = _fingerprint_workspace(fresh_workspace)
        is_stale = not _is_same_fingerprint(asset.fingerprints, fresh_fingerprints)
        
        # 检查是否有文档资产
        document_asset = load_latest_page_document_asset(project_name, page_path)
        has_lineage = False
        if document_asset and document_asset.lineage:
            has_lineage = True
        
        message = "缓存有效"
        if is_stale:
            message = "缓存已过期，源码已变化"
        
        return CacheStatusResponse(
            cached=True,
            is_stale=is_stale,
            updated_at=asset.updated_at,
            has_llm_doc=asset.llm_doc_result is not None,
            has_lineage=has_lineage,
            message=message
        )
        
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("check_cached_analysis_error")
        return CacheStatusResponse(
            cached=False,
            message=f"检查缓存失败: {str(exc)}"
        )


@app.post("/api/llm/page-patch", response_model=PagePatchRecord, deprecated=True)
def llm_page_patch(payload: PagePatchRequest, response: Response) -> PagePatchRecord:
    """将自然语言页面需求转成沙箱 patch，并写回页面分析资产。"""
    response.headers["X-Deprecated"] = "Use /api/agent/code-plan instead"
    try:
        result = get_or_create_page_analysis(
            payload.config,
            payload.page_path,
            refresh=payload.refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    patch_result = generate_page_patch_with_llm(
        result.asset.workspace,
        user_request=payload.user_request,
    )
    patch_record = PagePatchRecord(
        user_request=payload.user_request,
        patch_result=patch_result,
    )
    result.asset.patch_history.append(patch_record)
    save_page_analysis_asset(result.asset)
    return patch_record


@app.post("/api/page-patches/delete", response_model=PageAnalysisResult)
def delete_page_patch(payload: PagePatchDeleteRequest) -> PageAnalysisResult:
    """删除单条页面 patch 记录。"""
    try:
        result = get_or_create_page_analysis(
            payload.config,
            payload.page_path,
            refresh=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result.asset.patch_history = [
        record
        for record in result.asset.patch_history
        if record.record_id != payload.record_id
    ]
    save_page_analysis_asset(result.asset)
    return result


@app.post("/api/page-patches/clear", response_model=PageAnalysisResult)
def clear_page_patches(payload: PagePatchHistoryRequest) -> PageAnalysisResult:
    """清空当前页面的 patch 记录。"""
    try:
        result = get_or_create_page_analysis(
            payload.config,
            payload.page_path,
            refresh=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result.asset.patch_history = []
    save_page_analysis_asset(result.asset)
    return result


@app.get("/api/agent/manifest", response_model=AgentManifest)
def agent_manifest() -> AgentManifest:
    """Expose the dedicated agent runtime manifest."""
    return get_agent_runtime().manifest


@app.post("/api/agent/session", response_model=AgentSession)
def create_agent_session(
    project_name: str | None = None,
    page_path: str | None = None,
) -> AgentSession:
    """Create a page-centric agent session shell."""
    logger.info("create_agent_session project=%s page=%s", project_name, page_path)
    return get_agent_runtime().start_session(project_name=project_name, page_path=page_path)


@app.post("/api/agent/tasks", response_model=AgentTask)
def create_agent_task(
    title: str,
    kind: str,
    page_path: str | None = None,
    detail: str | None = None,
) -> AgentTask:
    """Queue a future agent task."""
    logger.info("create_agent_task title=%s kind=%s page=%s", title, kind, page_path)
    return get_agent_runtime().queue_task(
        title=title,
        kind=kind,
        page_path=page_path,
        detail=detail,
    )


@app.post("/api/agent/run", response_model=AgentRunResult)
def run_agent(payload: AgentRunRequest) -> AgentRunResult:
    """Run the codex-style agent harness with iterative tool use."""
    logger.info(
        "run_agent page=%s project=%s max_turns=%s prompt=%s",
        payload.page_path,
        payload.project_name or (payload.config.project_name if payload.config else ""),
        payload.max_turns,
        payload.user_prompt,
    )
    try:
        return get_agent_runtime().run_agent(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/agent/run/stream")
def stream_agent_run(payload: AgentRunRequest) -> StreamingResponse:
    def event_stream():
        try:
            for event in get_agent_runtime().stream_agent_run(payload):
                yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        except ValueError as exc:
            error_event = {
                "event": "run_error",
                "turn": 0,
                "message": str(exc),
                "payload": {"detail": str(exc)},
            }
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/agent/code-plan", response_model=CodeModificationPlan)
def create_code_plan(payload: CodePlanRequest) -> CodeModificationPlan:
    try:
        return get_agent_runtime().code_agent.plan(
            payload.config,
            payload.page_path,
            payload.user_request,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/agent/code-preview/{plan_id}", response_model=CodePreviewResult)
def preview_code_plan(plan_id: str) -> CodePreviewResult:
    try:
        return get_agent_runtime().code_agent.preview(plan_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Plan not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/agent/code-apply/{plan_id}", response_model=CodeModificationResult)
def apply_code_plan(plan_id: str, payload: CodePlanRequest) -> CodeModificationResult:
    try:
        return get_agent_runtime().code_agent.apply(plan_id, payload.config)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Plan not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/agent/code-revert/{plan_id}", response_model=CodeModificationResult)
def revert_code_plan(plan_id: str, payload: CodePlanRequest) -> CodeModificationResult:
    try:
        return get_agent_runtime().code_agent.revert(plan_id, payload.config)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Plan not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/agent/code-plans", response_model=list[CodeModificationPlan])
def list_code_plans() -> list[CodeModificationPlan]:
    return get_agent_runtime().code_agent.list_plans()


@app.post("/api/agent/reset-workspace", response_model=CodeWorkspaceResetResult)
def reset_agent_workspace(payload: WorkspaceResetRequest) -> CodeWorkspaceResetResult:
    try:
        return get_agent_runtime().code_agent.reset_workspace(payload.config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ============================================================================
# Agent 追踪相关端点
# ============================================================================


class PageLineageWithTraceResult(BaseModel):
    """带追踪的页面血缘分析结果"""
    result: LLMPageLineageResult
    trace: AgentAnalysisTrace


@app.post("/api/page-lineage/traced", response_model=PageLineageWithTraceResult)
def page_lineage_with_trace(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> PageLineageWithTraceResult:
    """生成页面血缘分析，同时返回完整的 Agent 执行追踪"""
    logger.info("page_lineage_with_trace page=%s refresh=%s", page_path, refresh)
    
    lineage_result, trace = _build_page_lineage_with_trace(config, page_path, refresh)
    
    return PageLineageWithTraceResult(
        result=lineage_result,
        trace=trace,
    )


@app.get("/api/agent-traces/{trace_id}", response_model=AgentAnalysisTrace)
def get_agent_trace_by_id(trace_id: str) -> AgentAnalysisTrace:
    """获取指定的 Agent 执行追踪"""
    logger.info("get_agent_trace trace_id=%s", trace_id)
    
    trace = load_agent_trace(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    return trace


@app.get("/api/agent-traces", response_model=list[AgentAnalysisTrace])
def list_agent_traces(
    project_name: str,
    page_path: str,
    limit: int = 10,
) -> list[AgentAnalysisTrace]:
    """列出某个页面的历史追踪记录"""
    logger.info("list_agent_traces project=%s page=%s limit=%d", project_name, page_path, limit)
    
    return list_traces_for_page(project_name, page_path, limit)


@app.post("/api/page-lineage/stream")
def stream_page_lineage_analysis(
    config: SourceProjectConfig,
    page_path: str,
    refresh: bool = False,
) -> StreamingResponse:
    """流式返回页面血缘分析过程（SSE）- 美化版"""
    logger.info("stream_page_lineage page=%s refresh=%s", page_path, refresh)
    
    def event_stream():
        from ai_requirement_os.ui.v1_stream_output import V1StreamFormatter, create_api_table_data
        
        formatter = V1StreamFormatter()
        
        try:
            # 1. 开始分析
            event = formatter.start_event(page_path)
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 2. 加载工作区
            analysis_result = get_or_create_page_analysis(config, page_path, refresh=refresh)
            workspace = analysis_result.asset.workspace
            
            # 提取 API 信息
            apis = []
            for related in workspace.related_files:
                if hasattr(related, 'api_calls'):
                    for api_call in related.api_calls:
                        apis.append({
                            "method": api_call.get("method", "UNKNOWN"),
                            "url": api_call.get("url", ""),
                            "trigger": api_call.get("trigger", "unknown")
                        })
            
            event = formatter.workspace_loaded_event(
                page_file=workspace.selected_page.file_name,
                api_count=len(apis),
                related_files=len(workspace.related_files)
            )
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 3. 构建证据包
            evidence_bundle = build_page_lineage_evidence_bundle(workspace)
            
            event = formatter.evidence_bundle_event(
                initial_fetches=len(evidence_bundle.initial_fetches),
                actions=len(evidence_bundle.actions)
            )
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 4. 显示 API 列表（如果有）
            if apis:
                event = formatter.api_list_event(apis)
                yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
                
                # 发送表格数据
                table_data = create_api_table_data(apis)
                event = formatter.table_event(
                    title=table_data["title"],
                    headers=table_data["headers"],
                    rows=table_data["rows"]
                )
                yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 5. LLM 分析
            event = formatter.llm_analysis_start_event()
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            lineage_result, trace = generate_page_lineage_with_trace(workspace)
            
            event = formatter.llm_analysis_complete_event()
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 6. 保存追踪
            save_agent_trace(trace)
            
            # 7. 保存血缘资产
            save_page_lineage_asset(
                project_name=config.project_name,
                page_path=page_path,
                page_name=workspace.documentation.page_name,
                fingerprints=analysis_result.asset.fingerprints,
                result=lineage_result,
            )
            
            # 8. 生成报告
            event = formatter.report_generation_event()
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 9. 保存结果
            event = formatter.save_result_event(".agent/page_analysis.json")
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
            # 10. 完成
            event = formatter.complete_event(
                message="分析完成！",
                result_data={
                    'trace_id': trace.trace_id,
                    'lineage': lineage_result.model_dump(mode='json'),
                    'apis_count': len(apis),
                    'initial_fetches': len(evidence_bundle.initial_fetches),
                    'actions': len(evidence_bundle.actions)
                }
            )
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
            
        except ValueError as exc:
            event = formatter.error_event(str(exc), details="ValueError")
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("stream_page_lineage_error")
            event = formatter.error_event(f"分析失败: {str(exc)}", details=str(type(exc).__name__))
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

"""Agent-first page lineage generation over a pruned evidence bundle."""

from __future__ import annotations

import logging
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from textwrap import shorten
from uuid import uuid4

from pydantic import BaseModel, Field

from ai_requirement_os.llm.gateway import get_llm_by_role
from ai_requirement_os.llm.prompts import (
    build_page_lineage_user_prompt,
    page_lineage_system_prompt,
)
from ai_requirement_os.schema.agent_trace import AgentAnalysisTrace, AgentThinkingStep
from ai_requirement_os.parser.backend_trace import trace_backend_flow
from ai_requirement_os.parser.page_workspace import PageWorkspace
from ai_requirement_os.schema.page_lineage import (
    BackendOverview,
    BackendPointer,
    InitialFetchStep,
    LineageField,
    PageActionLineage,
    PageDataLineage,
    PageInfo,
    RequestFlowStep,
    render_page_lineage_markdown,
)
from ai_requirement_os.schema.page_lineage_evidence import (
    ActionEvidence,
    BackendTraceEvidence,
    EvidenceSnippet,
    InitialFetchEvidence,
    PageLineageEvidenceBundle,
    RequestFlowEvidence,
)

logger = logging.getLogger(__name__)


class LLMPageLineageDebugInfo(BaseModel):
    system_prompt: str = ""
    user_prompt: str = ""
    evidence_bundle_json: str = ""


class LLMPageLineageResult(BaseModel):
    mode: str
    model: str
    warnings: list[str] = Field(default_factory=list)
    lineage: PageDataLineage
    markdown: str
    debug: LLMPageLineageDebugInfo = Field(default_factory=LLMPageLineageDebugInfo)
    trace_id: str | None = Field(default=None, description="关联的追踪 ID")


def _read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8", errors="ignore")


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _module_name(page_path: str) -> str:
    if "/src/views/" in page_path:
        return page_path.split("/src/views/")[0].split("/")[-1]
    if "/src/" in page_path:
        return page_path.split("/src/")[0].split("/")[-1]
    return Path(page_path).parent.name


def _extract_created_handlers(vue_source: str) -> list[str]:
    match = re.search(r"created\(\)\s*\{(.*?)\n\s*\},", vue_source, re.S)
    if not match:
        return []
    return re.findall(r"this\.(\w+)\(", match.group(1))


def _extract_method_blocks(vue_source: str) -> dict[str, str]:
    methods_anchor = vue_source.find("methods:")
    if methods_anchor < 0:
        return {}
    start = vue_source.find("{", methods_anchor)
    if start < 0:
        return {}
    depth = 0
    end = start
    for index in range(start, len(vue_source)):
        char = vue_source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index
                break
    methods_body = vue_source[start + 1 : end]
    pattern = re.compile(r"^\s*(\w+)\s*\([^)]*\)\s*\{", re.M)
    blocks: dict[str, str] = {}
    for match in pattern.finditer(methods_body):
        name = match.group(1)
        body_start = match.end() - 1
        depth = 0
        body_end = body_start
        for index in range(body_start, len(methods_body)):
            char = methods_body[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    body_end = index
                    break
        blocks[name] = methods_body[match.start() : body_end + 1].strip()
    return blocks


def _extract_api_calls(method_block: str) -> list[tuple[str, str]]:
    return re.findall(r"(\w+Api)\.(\w+)\(", method_block)


def _extract_button_handlers(vue_source: str) -> list[tuple[str, str]]:
    pairs = re.findall(
        r'<el-button[^>]*@click(?:\.stop)?="([^"]+)"[^>]*>([^<]+)</el-button>',
        vue_source,
    )
    results: list[tuple[str, str]] = []
    for expression, label in pairs:
        expression = expression.strip()
        label = label.strip()
        if "=" in expression:
            continue
        handler = expression.split("(")[0].strip()
        if handler:
            results.append((label, handler))
    return results


def _is_key_action(label: str, handler: str) -> bool:
    trivial_labels = {"取消", "返回", "关闭", "上一步", "重置"}
    trivial_handlers = {"loadData", "handleCurrentPageChange", "handlePageSizeChange"}
    return label not in trivial_labels and handler not in trivial_handlers


def _find_api_method_path(method_name: str, workspace: PageWorkspace) -> tuple[str, str]:
    for item in workspace.documentation.api_methods:
        if item.name == method_name:
            return item.method, item.path
    return "-", "-"


def _find_api_method_file(workspace: PageWorkspace, method_name: str) -> str:
    for related in workspace.related_files:
        if related.role != "api":
            continue
        source = _read_text(related.path)
        if re.search(rf"\b{re.escape(method_name)}\s*\(", source):
            return related.path
    return ""


def _truncate_snippet(text: str, limit: int = 1600) -> str:
    stripped = text.strip()
    if len(stripped) <= limit:
        return stripped
    return stripped[:limit].rstrip() + "\n..."


def _build_snippet(role: str, path: str, locator: str, content: str) -> EvidenceSnippet:
    return EvidenceSnippet(
        role=role,
        path=path,
        locator=locator,
        content=_truncate_snippet(content),
    )


def _extract_js_method_snippet(path: str, method_name: str) -> str:
    if not path:
        return ""
    source = _read_text(path)
    pattern = re.compile(rf"^\s*{re.escape(method_name)}\s*\([^)]*\)\s*\{{", re.M)
    match = pattern.search(source)
    if not match:
        return ""
    body_start = match.end() - 1
    depth = 0
    body_end = body_start
    for index in range(body_start, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                body_end = index
                break
    return source[match.start() : body_end + 1].strip()


def _build_backend_trace_evidence(
    workspace: PageWorkspace,
    http_method: str,
    api_path: str,
    flow_key: str,
    deep_logic_flags: dict[str, str],
) -> BackendTraceEvidence:
    backend_root = workspace.discovery.backend_path
    if not backend_root or http_method == "-" or api_path == "-":
        return BackendTraceEvidence()

    trace = trace_backend_flow(backend_root, http_method, api_path)
    pointers: list[BackendPointer] = []
    snippets: list[EvidenceSnippet] = []
    backend_entry = ""

    if trace.controller:
        backend_entry = f"{trace.controller.class_name}.{trace.controller.method_name}"
        pointers.append(
            BackendPointer(
                layer="controller",
                class_name=trace.controller.class_name,
                method_name=trace.controller.method_name,
                method_signature=trace.controller.method_signature,
                file_path=trace.controller.file_path,
                line_number_hint=trace.controller.line_number_hint,
                note=f"{trace.controller.http_method} {trace.controller.route_path}",
            )
        )
        snippets.append(
            _build_snippet(
                "controller_method",
                trace.controller.file_path,
                f"{trace.controller.class_name}.{trace.controller.method_name}",
                trace.controller.method_text,
            )
        )

    for service_method in trace.service_methods:
        pointers.append(
            BackendPointer(
                layer="service",
                class_name=service_method.class_name,
                method_name=service_method.method_name,
                method_signature=service_method.method_signature,
                file_path=service_method.file_path,
                line_number_hint=service_method.line_number_hint,
                note="由 Controller 一跳追踪得到",
            )
        )
        snippets.append(
            _build_snippet(
                "service_method",
                service_method.file_path,
                f"{service_method.class_name}.{service_method.method_name}",
                service_method.method_text,
            )
        )

    if trace.unknown_reason:
        deep_logic_flags.setdefault(flow_key, trace.unknown_reason)
    if trace.deep_logic_reason:
        deep_logic_flags[flow_key] = trace.deep_logic_reason

    return BackendTraceEvidence(
        backend_entry=backend_entry,
        backend_pointers=pointers,
        snippets=snippets,
        unknown_reason=trace.unknown_reason or "",
        deep_logic_flag=trace.deep_logic_reason or "",
    )


def _build_initial_fetch_evidence(
    workspace: PageWorkspace,
    vue_source: str,
    deep_logic_flags: dict[str, str],
) -> list[InitialFetchEvidence]:
    method_blocks = _extract_method_blocks(vue_source)
    page_path = workspace.documentation.page_path
    fetches: list[InitialFetchEvidence] = []
    order = 1
    for handler in _extract_created_handlers(vue_source):
        handler_block = method_blocks.get(handler, "")
        frontend_snippets = (
            [_build_snippet("vue_method", page_path, handler, handler_block)]
            if handler_block
            else []
        )
        api_calls = _extract_api_calls(handler_block)
        if not api_calls:
            fetches.append(
                InitialFetchEvidence(
                    order=order,
                    name=handler,
                    frontend_entry=handler,
                    frontend_snippets=frontend_snippets,
                )
            )
            order += 1
            continue

        for _, api_method_name in api_calls:
            http_method, api_path = _find_api_method_path(api_method_name, workspace)
            api_file_path = _find_api_method_file(workspace, api_method_name)
            api_snippets = (
                [
                    _build_snippet(
                        "api_method",
                        api_file_path,
                        api_method_name,
                        _extract_js_method_snippet(api_file_path, api_method_name),
                    )
                ]
                if api_file_path
                else []
            )
            backend_trace = _build_backend_trace_evidence(
                workspace,
                http_method,
                api_path,
                f"initial_fetch:{handler}:{api_method_name}",
                deep_logic_flags,
            )
            fetches.append(
                InitialFetchEvidence(
                    order=order,
                    name=handler,
                    api=api_path,
                    method=http_method,
                    frontend_entry=handler,
                    frontend_snippets=frontend_snippets,
                    api_snippets=api_snippets,
                    backend_trace=backend_trace,
                )
            )
            order += 1
    return fetches


def _build_action_evidence(
    workspace: PageWorkspace,
    vue_source: str,
    deep_logic_flags: dict[str, str],
) -> list[ActionEvidence]:
    method_blocks = _extract_method_blocks(vue_source)
    page_path = workspace.documentation.page_path
    actions: list[ActionEvidence] = []
    seen: set[tuple[str, str]] = set()
    for label, handler in _extract_button_handlers(vue_source):
        if not _is_key_action(label, handler):
            continue
        key = (label, handler)
        if key in seen:
            continue
        seen.add(key)

        handler_block = method_blocks.get(handler, "")
        if not handler_block:
            continue
        api_calls = _extract_api_calls(handler_block)
        if not api_calls:
            continue

        request_flow: list[RequestFlowEvidence] = []
        for order, (_, api_method_name) in enumerate(api_calls, start=1):
            http_method, api_path = _find_api_method_path(api_method_name, workspace)
            api_file_path = _find_api_method_file(workspace, api_method_name)
            api_snippets = (
                [
                    _build_snippet(
                        "api_method",
                        api_file_path,
                        api_method_name,
                        _extract_js_method_snippet(api_file_path, api_method_name),
                    )
                ]
                if api_file_path
                else []
            )
            backend_trace = _build_backend_trace_evidence(
                workspace,
                http_method,
                api_path,
                f"action:{handler}:{api_method_name}",
                deep_logic_flags,
            )
            request_flow.append(
                RequestFlowEvidence(
                    order=order,
                    api_method_name=api_method_name,
                    api=api_path,
                    method=http_method,
                    frontend_handler=handler,
                    frontend_snippets=[
                        _build_snippet("vue_method", page_path, handler, handler_block)
                    ],
                    api_snippets=api_snippets,
                    backend_trace=backend_trace,
                )
            )
        actions.append(
            ActionEvidence(
                name=label,
                frontend_handler=handler,
                summary=f"触发前端方法 {handler}，并执行相关接口调用。",
                request_flow=request_flow,
            )
        )
    return actions


def build_page_lineage_evidence_bundle(workspace: PageWorkspace) -> PageLineageEvidenceBundle:
    doc = workspace.documentation
    vue_source = _read_text(doc.page_path)
    deep_logic_flags: dict[str, str] = {}

    page_info = PageInfo(
        page_name=doc.page_name,
        page_path=doc.page_path,
        module_name=_module_name(doc.page_path),
        summary=doc.purpose,
    )
    search_fields = [
        LineageField(
            label=field.label,
            frontend_field=field.key,
            description=f"查询组件：{field.component}",
            source_refs=[doc.page_path],
        )
        for field in doc.search_fields
    ]
    display_fields = [
        LineageField(
            label=field.label,
            frontend_field=field.prop or "",
            description="页面表格展示字段",
            source_refs=[doc.page_path],
        )
        for field in doc.table_columns
        if field.label != "操作"
    ]
    initial_fetches = _build_initial_fetch_evidence(workspace, vue_source, deep_logic_flags)
    actions = _build_action_evidence(workspace, vue_source, deep_logic_flags)

    backend_controllers = sorted(
        {
            pointer.class_name
            for action in actions
            for step in action.request_flow
            for pointer in step.backend_trace.backend_pointers
            if pointer.layer == "controller"
        }
    )
    backend_services = sorted(
        {
            pointer.class_name
            for action in actions
            for step in action.request_flow
            for pointer in step.backend_trace.backend_pointers
            if pointer.layer == "service"
        }
    )
    unknowns: list[str] = []
    for fetch in initial_fetches:
        if fetch.api and fetch.api != "-" and not fetch.backend_trace.backend_entry:
            unknowns.append(f"initial_fetch:{fetch.name} 尚未定位到后端入口")
    for action in actions:
        for step in action.request_flow:
            if step.api and step.api != "-" and not step.backend_trace.backend_pointers:
                unknowns.append(
                    f"action:{action.frontend_handler}:{step.method} {step.api} 尚未定位到 backend_pointers"
                )

    return PageLineageEvidenceBundle(
        project_name=workspace.project_name,
        page_info=page_info,
        search_fields=search_fields,
        display_fields=display_fields,
        initial_fetches=initial_fetches,
        actions=actions,
        backend_overview={
            "controllers": backend_controllers,
            "services": backend_services,
            "tables": [],
        },
        notes=[
            "Evidence Bundle 只保留命中方法级上下文，避免整文件注入导致的中间遗忘。",
            "backend_pointers 以 file_path + class_name + method_name + method_signature 为稳定定位锚点。",
        ],
        unknowns=_dedupe_preserve_order(unknowns),
        deep_logic_flags=deep_logic_flags,
    )


def build_fallback_page_lineage(bundle: PageLineageEvidenceBundle) -> PageDataLineage:
    lineage = PageDataLineage(
        page_info=bundle.page_info,
        search_fields=bundle.search_fields,
        display_fields=bundle.display_fields,
        initial_fetches=[
            InitialFetchStep(
                order=item.order,
                name=item.name,
                api=item.api,
                method=item.method,
                frontend_entry=item.frontend_entry,
                backend_entry=item.backend_trace.backend_entry,
                summary=f"页面初始化时通过 {item.frontend_entry or item.name} 拉取数据",
                return_summary=(
                    f"已定位到 {item.backend_trace.backend_entry}"
                    if item.backend_trace.backend_entry
                    else "待结合后端返回结构补充"
                ),
                source_refs=_dedupe_preserve_order(
                    [bundle.page_info.page_path]
                    + [pointer.file_path for pointer in item.backend_trace.backend_pointers]
                ),
            )
            for item in bundle.initial_fetches
        ],
        actions=[
            PageActionLineage(
                name=action.name,
                frontend_handler=action.frontend_handler,
                summary=action.summary,
                request_flow=[
                    RequestFlowStep(
                        order=step.order,
                        api=step.api,
                        method=step.method,
                        payload_fields=[],
                        summary=f"{action.frontend_handler} 中调用 {step.api_method_name}",
                        return_summary=(
                            f"已定位到 {step.backend_trace.backend_entry}"
                            if step.backend_trace.backend_entry
                            else "待结合后端返回结构补充"
                        ),
                        backend_pointers=step.backend_trace.backend_pointers,
                        source_refs=_dedupe_preserve_order(
                            [bundle.page_info.page_path]
                            + [pointer.file_path for pointer in step.backend_trace.backend_pointers]
                        ),
                    )
                    for step in action.request_flow
                ],
                source_refs=[bundle.page_info.page_path],
            )
            for action in bundle.actions
        ],
        backend_overview=BackendOverview(
            controllers=bundle.backend_overview.get("controllers", []),
            services=bundle.backend_overview.get("services", []),
            tables=bundle.backend_overview.get("tables", []),
        ),
        notes=bundle.notes
        + ["当前为 fallback 结果；正式模式应优先使用 agent 基于 Evidence Bundle 输出 JSON。"],
        unknowns=bundle.unknowns,
        deep_logic_flags=bundle.deep_logic_flags,
    )
    return lineage


def generate_page_lineage_with_llm(workspace: PageWorkspace) -> LLMPageLineageResult:
    evidence_bundle = build_page_lineage_evidence_bundle(workspace)
    fallback = build_fallback_page_lineage(evidence_bundle)
    try:
        llm = get_llm_by_role("primary")
    except RuntimeError as exc:
        return LLMPageLineageResult(
            mode="fallback",
            model="none",
            warnings=[str(exc)],
            lineage=fallback,
            markdown=render_page_lineage_markdown(fallback),
        )

    evidence_bundle_json = evidence_bundle.model_dump_json(indent=2)
    system_prompt = page_lineage_system_prompt()
    human_prompt = build_page_lineage_user_prompt(
        project_name=evidence_bundle.project_name,
        page_name=evidence_bundle.page_info.page_name,
        page_path=evidence_bundle.page_info.page_path,
        evidence_bundle_json=evidence_bundle_json,
    )
    logger.info(
        "page_lineage_llm_request model=%s page=%s prompt_preview=%s",
        str(getattr(llm, "model_name", "deepseek-chat")),
        evidence_bundle.page_info.page_path,
        shorten(human_prompt, width=220, placeholder="..."),
    )
    structured_llm = llm.with_structured_output(PageDataLineage)
    lineage = structured_llm.invoke(
        [
            ("system", system_prompt),
            ("human", human_prompt),
        ]
    )
    markdown = render_page_lineage_markdown(lineage)
    return LLMPageLineageResult(
        mode="agent",
        model=str(getattr(llm, "model_name", "deepseek-chat")),
        warnings=[
            "Lineage 结果由 agent 基于方法级 Evidence Bundle 直接生成。",
            f"提示词预览：{shorten(human_prompt, width=180, placeholder='...')}",
        ],
        lineage=lineage,
        markdown=markdown,
        debug=LLMPageLineageDebugInfo(
            system_prompt=system_prompt,
            user_prompt=human_prompt,
            evidence_bundle_json=evidence_bundle_json,
        ),
    )


def generate_page_lineage_with_trace(workspace: PageWorkspace) -> tuple[LLMPageLineageResult, AgentAnalysisTrace]:
    """生成页面血缘分析，同时记录完整的执行追踪"""
    
    # 创建追踪对象
    trace = AgentAnalysisTrace(
        trace_id=uuid4().hex,
        project_name=workspace.project_name,
        page_path=workspace.documentation.page_path,
        started_at=datetime.now(UTC),
        status="running",
    )
    
    start_time = time.time()
    
    try:
        # 步骤 1: 构建证据包
        step_start = time.time()
        trace.steps.append(AgentThinkingStep(
            step_number=1,
            step_type="planning",
            content="开始构建页面证据包（Evidence Bundle）",
            timestamp=datetime.now(UTC),
        ))
        
        evidence_bundle = build_page_lineage_evidence_bundle(workspace)
        
        step_duration = int((time.time() - step_start) * 1000)
        trace.steps.append(AgentThinkingStep(
            step_number=2,
            step_type="evidence",
            content=f"证据包构建完成：发现 {len(evidence_bundle.initial_fetches)} 个初始请求、{len(evidence_bundle.actions)} 个操作",
            timestamp=datetime.now(UTC),
            details={
                "duration_ms": step_duration,
                "initial_fetches": len(evidence_bundle.initial_fetches),
                "actions": len(evidence_bundle.actions),
                "search_fields": len(evidence_bundle.search_fields),
                "display_fields": len(evidence_bundle.display_fields),
            }
        ))
        
        # 记录读取的文件
        trace.files_read = [workspace.documentation.page_path]
        for related in workspace.related_files:
            if related.path not in trace.files_read:
                trace.files_read.append(related.path)
        
        # 记录追踪的 API
        for action in evidence_bundle.actions:
            for step in action.request_flow:
                if step.api and step.api not in trace.apis_traced:
                    trace.apis_traced.append(step.api)
        
        # 步骤 3: 检查 LLM 可用性
        trace.steps.append(AgentThinkingStep(
            step_number=3,
            step_type="planning",
            content="准备调用 LLM 生成结构化分析",
            timestamp=datetime.now(UTC),
        ))
        
        try:
            llm = get_llm_by_role("primary")
            model_name = str(getattr(llm, "model_name", "deepseek-chat"))
            trace.model_name = model_name
            trace.mode = "agent"
        except RuntimeError as exc:
            # Fallback 模式
            trace.steps.append(AgentThinkingStep(
                step_number=4,
                step_type="conclusion",
                content=f"LLM 不可用，使用 fallback 模式：{exc}",
                timestamp=datetime.now(UTC),
            ))
            
            fallback = build_fallback_page_lineage(evidence_bundle)
            markdown = render_page_lineage_markdown(fallback)
            
            trace.status = "completed"
            trace.completed_at = datetime.now(UTC)
            trace.total_duration_ms = int((time.time() - start_time) * 1000)
            trace.final_result = fallback.model_dump(mode="json")
            trace.mode = "fallback"
            
            result = LLMPageLineageResult(
                mode="fallback",
                model="none",
                warnings=[str(exc)],
                lineage=fallback,
                markdown=markdown,
                trace_id=trace.trace_id,
            )
            
            return result, trace
        
        # 步骤 4: 准备提示词
        evidence_bundle_json = evidence_bundle.model_dump_json(indent=2)
        system_prompt = page_lineage_system_prompt()
        human_prompt = build_page_lineage_user_prompt(
            project_name=evidence_bundle.project_name,
            page_name=evidence_bundle.page_info.page_name,
            page_path=evidence_bundle.page_info.page_path,
            evidence_bundle_json=evidence_bundle_json,
        )
        
        trace.steps.append(AgentThinkingStep(
            step_number=4,
            step_type="reasoning",
            content=f"调用 {model_name} 分析证据包（提示词长度：{len(human_prompt)} 字符）",
            timestamp=datetime.now(UTC),
            details={
                "model": model_name,
                "prompt_length": len(human_prompt),
                "evidence_bundle_size": len(evidence_bundle_json),
            }
        ))
        
        # 步骤 5: LLM 推理
        llm_start = time.time()
        structured_llm = llm.with_structured_output(PageDataLineage)
        lineage = structured_llm.invoke(
            [
                ("system", system_prompt),
                ("human", human_prompt),
            ]
        )
        llm_duration = int((time.time() - llm_start) * 1000)
        
        trace.steps.append(AgentThinkingStep(
            step_number=5,
            step_type="reasoning",
            content=f"LLM 分析完成（耗时 {llm_duration}ms）",
            timestamp=datetime.now(UTC),
            details={
                "duration_ms": llm_duration,
                "result_fields": len(lineage.search_fields) + len(lineage.display_fields),
                "result_actions": len(lineage.actions),
            }
        ))
        
        # 步骤 6: 生成 Markdown
        trace.steps.append(AgentThinkingStep(
            step_number=6,
            step_type="conclusion",
            content="生成 Markdown 报告",
            timestamp=datetime.now(UTC),
        ))
        
        markdown = render_page_lineage_markdown(lineage)
        
        # 完成
        trace.status = "completed"
        trace.completed_at = datetime.now(UTC)
        trace.total_duration_ms = int((time.time() - start_time) * 1000)
        trace.final_result = lineage.model_dump(mode="json")
        
        logger.info(
            "page_lineage_trace_complete trace_id=%s duration=%dms steps=%d",
            trace.trace_id,
            trace.total_duration_ms,
            len(trace.steps),
        )
        
        result = LLMPageLineageResult(
            mode="agent",
            model=model_name,
            warnings=[
                "Lineage 结果由 agent 基于方法级 Evidence Bundle 直接生成。",
                f"提示词预览：{shorten(human_prompt, width=180, placeholder='...')}",
            ],
            lineage=lineage,
            markdown=markdown,
            debug=LLMPageLineageDebugInfo(
                system_prompt=system_prompt,
                user_prompt=human_prompt,
                evidence_bundle_json=evidence_bundle_json,
            ),
            trace_id=trace.trace_id,
        )
        
        return result, trace
        
    except Exception as e:
        trace.status = "failed"
        trace.completed_at = datetime.now(UTC)
        trace.total_duration_ms = int((time.time() - start_time) * 1000)
        trace.error = str(e)
        
        logger.error(
            "page_lineage_trace_failed trace_id=%s error=%s",
            trace.trace_id,
            str(e),
        )
        
        raise


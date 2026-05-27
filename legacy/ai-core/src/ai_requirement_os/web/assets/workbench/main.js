import { runAgent } from "./agent-panel.js";
import {
  clearDebugEntries,
  logPageLineageDebug,
  renderDebugLog,
} from "./debug-panel.js";
import {
  clearContent,
  els,
  escapeHtml,
  prettyJson,
  projectConfig,
  renderCards,
  renderChips,
  renderList,
  setStatus,
  state,
} from "./shared.js";

function renderPageList(pages) {
  if (!pages.length) {
    clearContent(els.pageList, "未发现页面");
    return;
  }
  els.pageList.classList.remove("empty-state");
  els.pageList.innerHTML = pages.map(page => `
    <button class="page-item ${page.path === state.selectedPagePath ? "active" : ""}" data-path="${page.path}" type="button">
      <strong>${escapeHtml(page.name)}</strong>
      <span>${escapeHtml(page.route_hint)}</span>
      <span>${escapeHtml(page.path)}</span>
    </button>
  `).join("");
  els.pageList.querySelectorAll(".page-item").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedPagePath = button.dataset.path;
      renderPageList(pages);
      openWorkspace().catch(console.error);
    });
  });
}

function renderRelatedFiles(files) {
  if (!files.length) {
    clearContent(els.relatedFiles, "暂无关联文件");
    return;
  }
  els.relatedFiles.classList.remove("empty-state");
  els.relatedFiles.innerHTML = files.map(file => `
    <div class="file-item">
      <strong>${escapeHtml(file.role)}</strong>
      <span>${escapeHtml(file.path)}</span>
    </div>
  `).join("");
}

function renderArtifactPreviews() {
  if (!state.currentLineageResult?.lineage) {
    els.structuredJson.classList.add("empty-state");
    els.structuredJson.textContent = "加载页面工作区后，点击“生成 JSON / 报告”。";
    els.markdownReport.classList.add("empty-state");
    els.markdownReport.textContent = "加载页面工作区后，点击“生成 JSON / 报告”。";
    return;
  }
  els.structuredJson.classList.remove("empty-state");
  els.structuredJson.textContent = JSON.stringify(state.currentLineageResult.lineage, null, 2);
  els.markdownReport.classList.remove("empty-state");
  els.markdownReport.textContent = state.currentLineageResult.markdown || "";
}

function renderDiscussion() {
  if (!state.currentWorkspace?.documentation) {
    clearContent(els.conversationThread, "先加载页面工作区，Agent 才能基于真实页面上下文参与讨论。");
    return;
  }
  const messages = [
    {
      role: "agent",
      title: "Agent",
      body: state.currentCodePlan
        ? `我已经为“${state.currentCodePlan.summary}”生成了真实代码计划。先看 diff，再决定是否应用到真实前端项目。`
        : `我已经读取 ${state.currentWorkspace.documentation.page_name} 页的结构和相关文件，可以直接帮你规划真实代码改动。`,
      meta: state.currentCodePlan?.status || "等待需求",
    },
  ];
  if (state.currentCodePlan) {
    messages.unshift({
      role: "user",
      title: "你",
      body: els.floatingDemandInput.value.trim() || state.currentCodePlan.summary,
      meta: new Date(state.currentCodePlan.created_at).toLocaleString("zh-CN"),
    });
  }
  els.conversationThread.classList.remove("empty-state");
  els.conversationThread.innerHTML = messages.map(message => `
    <article class="chat-message ${message.role}">
      <div class="chat-message-header">
        <strong>${escapeHtml(message.title)}</strong>
        <span>${escapeHtml(message.meta || "")}</span>
      </div>
      <p>${escapeHtml(message.body)}</p>
    </article>
  `).join("");
}

function renderSandboxIframe(workspace) {
  if (!workspace?.sandbox_url) {
    clearContent(els.sandboxPreview, "未配置页面预览地址");
    els.sandboxPreview.classList.toggle("is-collapsed", !state.sandboxExpanded);
    return;
  }
  const previewUrl = workspace.sandbox_url;
  els.sandboxPreview.classList.remove("empty-state");
  els.sandboxPreview.classList.toggle("is-collapsed", !state.sandboxExpanded);
  els.sandboxPreview.innerHTML = `
    <div class="sandbox-canvas real-sandbox">
      <div class="sandbox-shell-bar">
        <div class="sandbox-shell-title">
          <span class="sandbox-dot"></span>
          <strong>${escapeHtml(workspace.documentation.page_name)} 实时预览</strong>
        </div>
        <div class="sandbox-shell-badges">
          <span class="mini-tag">${escapeHtml(workspace.sandbox_route)}</span>
          <span class="mini-tag">real frontend</span>
        </div>
      </div>
      <div class="sandbox-preview-tip">请先在真实前端项目里运行 <code>VUE_APP_MOCK=true npm run dev</code>。</div>
      <iframe id="sandbox-iframe" class="sandbox-iframe" src="${escapeHtml(previewUrl)}" title="${escapeHtml(workspace.documentation.page_name)} preview"></iframe>
    </div>
  `;
}

function syncSandboxVisibility() {
  els.sandboxPreview.classList.toggle("is-collapsed", !state.sandboxExpanded);
  els.toggleSandboxButton.textContent = state.sandboxExpanded ? "折叠" : "展开";
  els.toggleSandboxButton.setAttribute("aria-expanded", state.sandboxExpanded ? "true" : "false");
}

function renderWorkspace(workspace) {
  state.currentWorkspace = workspace;
  renderArtifactPreviews();
  const doc = workspace.documentation;
  els.docTitle.textContent = `${doc.page_name} 页面背景`;
  els.docPurpose.textContent = doc.purpose;
  renderList(els.docStructures, doc.structures);
  renderCards(els.docSearchFields, doc.search_fields, field => `
    <div class="doc-card">
      <strong>${escapeHtml(field.label)}</strong>
      <p>${escapeHtml(`${field.key} · ${field.component}`)}</p>
    </div>
  `);
  renderCards(els.docTableColumns, doc.table_columns, column => `
    <div class="doc-card">
      <strong>${escapeHtml(column.label)}</strong>
      <p>${escapeHtml(column.prop || "无直接 prop")}</p>
    </div>
  `);
  renderChips(els.docPageActions, doc.page_actions);
  renderChips(els.docRowActions, doc.row_actions);
  renderList(els.docRules, doc.business_rules);
  renderCards(els.docDialogs, doc.dialogs, dialog => `
    <div class="doc-card">
      <strong>${escapeHtml(dialog.title)}</strong>
      <p>${escapeHtml(dialog.fields.map(field => field.label).join(" / ") || "暂无字段")}</p>
      <p>${escapeHtml(dialog.actions.join(" / ") || "暂无动作")}</p>
    </div>
  `);
  renderCards(els.docApiMethods, doc.api_methods, method => `
    <div class="doc-card">
      <strong>${escapeHtml(method.name)}</strong>
      <p>${escapeHtml(`${method.method} ${method.path}`)}</p>
    </div>
  `);
  renderCards(els.docBackendEndpoints, doc.backend_endpoints, endpoint => `
    <div class="doc-card">
      <strong>${escapeHtml(endpoint.handler)}</strong>
      <p>${escapeHtml(`${endpoint.method} ${endpoint.path}`)}</p>
    </div>
  `);
  renderRelatedFiles(workspace.related_files);
  renderSandboxIframe(workspace);
  renderDiscussion();
}

function renderAnalysisState(result) {
  state.currentAnalysisState = result;
  els.llmOutputStatus.classList.remove("empty-state");
  els.llmOutputStatus.innerHTML = `
    <div class="doc-card">
      <strong>分析来源：${escapeHtml(result.source)}</strong>
      <p>是否检测到源码变化：${result.is_stale ? "是" : "否"}</p>
      <p>当前页面资产已建立关联，可直接生成代码计划。</p>
    </div>
  `;
}

function renderLlmStatus(result) {
  const warnings = result.warnings?.length
    ? result.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>无额外提示</li>";
  els.llmOutputStatus.classList.remove("empty-state");
  els.llmOutputStatus.innerHTML = `
    <div class="doc-card">
      <strong>模式：${escapeHtml(result.mode)}</strong>
      <p>模型：${escapeHtml(result.model)}</p>
      <ul class="list">${warnings}</ul>
    </div>
  `;
}

function renderCodePlan(plan, preview) {
  state.currentCodePlan = plan;
  state.currentPreview = preview;
  els.insightSummary.classList.remove("empty-state");
  els.insightSummary.innerHTML = `
    <div class="doc-card">
      <strong>${escapeHtml(plan.summary)}</strong>
      <p>${escapeHtml((plan.rationale || []).join(" ")) || "暂无补充说明"}</p>
    </div>
  `;
  renderList(els.insightConfirmed, preview.files || []);
  renderList(els.insightOpenQuestions, [
    `当前状态：${plan.status}`,
    `分支：${plan.branch_name || "待创建"}`,
    `编辑数：${plan.edits?.length || 0}`,
  ]);
  els.codePlanDiff.classList.remove("empty-state");
  els.codePlanDiff.textContent = preview.diff || "当前计划没有生成具体 diff。";
  els.applyCodePlanButton.disabled = plan.status !== "planned";
  els.revertCodePlanButton.disabled = plan.status !== "applied";
  renderDiscussion();
}

function renderCodePlanHistory(plans) {
  state.currentPlans = plans || [];
  if (!state.currentPlans.length) {
    clearContent(els.patchHistory, "暂无记录");
    return;
  }
  els.patchHistory.classList.remove("empty-state");
  els.patchHistory.innerHTML = state.currentPlans.map(plan => `
    <div class="doc-card patch-record-card">
      <strong>${escapeHtml(plan.summary)}</strong>
      <p><span class="record-label">状态</span>${escapeHtml(plan.status)}</p>
      <p><span class="record-label">分支</span>${escapeHtml(plan.branch_name || "待创建")}</p>
      <div class="record-actions">
        <button class="button button-secondary button-small plan-preview" data-plan-id="${plan.plan_id}" type="button">查看 diff</button>
      </div>
    </div>
  `).join("");
  els.patchHistory.querySelectorAll(".plan-preview").forEach(button => {
    button.addEventListener("click", () => {
      previewCodePlan(button.dataset.planId).catch(console.error);
    });
  });
}

async function loadSampleProject() {
  setStatus("加载中", "running");
  const response = await fetch("/api/sample-project");
  const data = await response.json();
  els.projectNameInput.value = data.project_name;
  els.frontendPathInput.value = data.frontend_path || "";
  els.backendPathInput.value = data.backend_path || "";
  setStatus("样例已载入", "done");
}

async function scanProject() {
  setStatus("扫描中", "running");
  const response = await fetch("/api/analyze/discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectConfig()),
  });
  if (!response.ok) {
    setStatus("扫描失败", "idle");
    window.alert(await response.text());
    return;
  }
  state.currentDiscovery = await response.json();
  state.selectedPagePath = state.currentDiscovery.entry_page_suggestions[0] || state.currentDiscovery.frontend_pages[0]?.path || null;
  renderPageList(state.currentDiscovery.frontend_pages);
  setStatus("扫描完成", "done");
}

async function openWorkspace() {
  if (!state.selectedPagePath) {
    window.alert("请先扫描并选择一个页面。");
    return;
  }
  setStatus("装配中", "running");
  const query = new URLSearchParams({ page_path: state.selectedPagePath });
  const response = await fetch(`/api/page-analysis?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectConfig()),
  });
  if (!response.ok) {
    setStatus("装配失败", "idle");
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "页面工作区装配失败");
    return;
  }
  const result = await response.json();
  state.currentLineageResult = null;
  renderArtifactPreviews();
  renderAnalysisState(result);
  renderWorkspace(result.asset.workspace);
  await refreshCodePlans();
  setStatus("页面已装配", "done");
}

async function generateLlmDocumentation() {
  if (!state.selectedPagePath) {
    window.alert("请先加载页面工作区。");
    return;
  }
  setStatus("生成中", "running");
  renderArtifactPreviews();
  
  // 初始化追踪查看器并开始流式展示
  const traceContainer = document.getElementById("agent-trace-container");
  if (!state.traceViewer) {
    state.traceViewer = new window.AgentTraceViewer("agent-trace-container");
  }
  
  // 使用流式 API 实时展示分析过程
  const requestPayload = projectConfig();
  const query = new URLSearchParams({ 
    page_path: state.selectedPagePath,
    refresh: "false"
  });
  
  // 先用流式 API 展示过程
  try {
    await state.traceViewer.streamAnalysis(requestPayload, state.selectedPagePath, false);
  } catch (error) {
    console.error("Stream analysis failed:", error);
  }
  
  // 然后获取完整结果（带追踪）
  const response = await fetch(`/api/page-lineage/traced?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  
  if (!response.ok) {
    setStatus("生成失败", "idle");
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "JSON / 报告生成失败");
    return;
  }
  
  const data = await response.json();
  state.currentLineageResult = data.result;
  state.currentTrace = data.trace;
  
  renderArtifactPreviews();
  renderLlmStatus(data.result);
  logPageLineageDebug(data.result);
  
  // 展示完整的追踪信息
  if (data.trace && data.trace.trace_id) {
    setTimeout(() => {
      state.traceViewer.loadTrace(data.trace.trace_id);
    }, 500);
  }
  
  setStatus(data.result.mode === "fallback" ? "草稿模式" : "已生成", "done");
}

async function refreshCodePlans() {
  const response = await fetch("/api/agent/code-plans");
  if (!response.ok) {
    return;
  }
  const plans = await response.json();
  renderCodePlanHistory(plans);
}

async function previewCodePlan(planId) {
  const response = await fetch(`/api/agent/code-preview/${planId}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "Diff 预览失败");
    return;
  }
  const preview = await response.json();
  const plan = state.currentPlans.find(item => item.plan_id === planId) || state.currentCodePlan;
  if (plan) {
    renderCodePlan(plan, preview);
  }
}

async function submitCodePlan() {
  const text = els.floatingDemandInput.value.trim();
  if (!text) {
    window.alert("先写一条页面需求。");
    return;
  }
  if (!state.selectedPagePath || !state.currentWorkspace) {
    window.alert("请先加载一个页面工作区。");
    return;
  }
  setStatus("Agent 规划中", "running");
  const response = await fetch("/api/agent/code-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: projectConfig(),
      page_path: state.selectedPagePath,
      user_request: text,
    }),
  });
  if (!response.ok) {
    setStatus("规划失败", "idle");
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "代码计划生成失败");
    return;
  }
  const plan = await response.json();
  const previewResponse = await fetch(`/api/agent/code-preview/${plan.plan_id}`);
  const preview = await previewResponse.json();
  renderCodePlan(plan, preview);
  await refreshCodePlans();
  setStatus("计划已生成", "done");
}

async function applyCodePlan() {
  if (!state.currentCodePlan) {
    return;
  }
  setStatus("应用中", "running");
  const response = await fetch(`/api/agent/code-apply/${state.currentCodePlan.plan_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: projectConfig(),
      page_path: state.selectedPagePath,
      user_request: els.floatingDemandInput.value.trim() || state.currentCodePlan.summary,
    }),
  });
  if (!response.ok) {
    setStatus("应用失败", "idle");
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "代码计划应用失败");
    return;
  }
  const result = await response.json();
  state.currentCodePlan = { ...state.currentCodePlan, ...result };
  renderCodePlan(state.currentCodePlan, state.currentPreview || { diff: "", files: [], status: state.currentCodePlan.status });
  els.llmOutputStatus.classList.remove("empty-state");
  els.llmOutputStatus.innerHTML = `
    <div class="doc-card">
      <strong>已应用修改</strong>
      <p>分支：${escapeHtml(result.branch_name || "未创建")}</p>
      <p>提交：${escapeHtml(result.commit_sha || "未提交")}</p>
    </div>
  `;
  await refreshCodePlans();
  setStatus("修改已应用", "done");
}

async function revertCodePlan() {
  if (!state.currentCodePlan) {
    return;
  }
  setStatus("回滚中", "running");
  const response = await fetch(`/api/agent/code-revert/${state.currentCodePlan.plan_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: projectConfig(),
      page_path: state.selectedPagePath,
      user_request: els.floatingDemandInput.value.trim() || state.currentCodePlan.summary,
    }),
  });
  if (!response.ok) {
    setStatus("回滚失败", "idle");
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "代码计划回滚失败");
    return;
  }
  const result = await response.json();
  els.llmOutputStatus.classList.remove("empty-state");
  els.llmOutputStatus.innerHTML = `
    <div class="doc-card">
      <strong>已回滚修改</strong>
      <p>分支：${escapeHtml(result.branch_name || "未创建")}</p>
      <p>回滚提交：${escapeHtml(result.revert_commit_sha || "未生成")}</p>
    </div>
  `;
  els.insightOpenQuestions.classList.remove("empty-state");
  els.insightOpenQuestions.innerHTML = "<li>当前状态：reverted</li>";
  els.applyCodePlanButton.disabled = true;
  els.revertCodePlanButton.disabled = true;
  await refreshCodePlans();
  setStatus("修改已回滚", "done");
}

async function resetWorkspace() {
  if (!window.confirm("这会撤销 Agent 计划产生的前端改动，并清空当前计划记录。确定继续吗？")) {
    return;
  }
  setStatus("重置中", "running");
  const response = await fetch("/api/agent/reset-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: projectConfig(),
    }),
  });
  if (!response.ok) {
    setStatus("重置失败", "idle");
    const payload = await response.json().catch(() => null);
    window.alert(payload?.detail || "工作区重置失败");
    return;
  }
  const result = await response.json();
  state.currentCodePlan = null;
  state.currentPreview = null;
  els.codePlanDiff.classList.add("empty-state");
  els.codePlanDiff.textContent = "生成计划后，这里会显示 unified diff。";
  els.applyCodePlanButton.disabled = true;
  els.revertCodePlanButton.disabled = true;
  els.insightSummary.classList.add("empty-state");
  els.insightSummary.textContent = "工作区已重置，请重新生成计划。";
  clearContent(els.insightConfirmed, "暂无数据");
  clearContent(els.insightOpenQuestions, "暂无数据");
  els.llmOutputStatus.classList.remove("empty-state");
  els.llmOutputStatus.innerHTML = `
    <div class="doc-card">
      <strong>${escapeHtml(result.summary)}</strong>
      <p>恢复文件数：${escapeHtml(String(result.restored_files?.length || 0))}</p>
      <p>清空计划数：${escapeHtml(String(result.cleared_plan_ids?.length || 0))}</p>
      <p>当前分支：${escapeHtml(result.current_branch || "未知")}</p>
    </div>
  `;
  await refreshCodePlans();
  if (state.selectedPagePath) {
    await openWorkspace();
  }
  setStatus("已重置", "done");
}

function bindEvents() {
  els.loadSampleButton.addEventListener("click", () => loadSampleProject().catch(console.error));
  els.scanProjectButton.addEventListener("click", () => scanProject().catch(console.error));
  els.openWorkspaceButton.addEventListener("click", () => openWorkspace().catch(console.error));
  els.generateLlmDocButton.addEventListener("click", () => generateLlmDocumentation().catch(console.error));
  els.resetWorkspaceButton.addEventListener("click", () => resetWorkspace().catch(console.error));
  els.floatingDemandSubmit.addEventListener("click", () => submitCodePlan().catch(console.error));
  els.applyCodePlanButton.addEventListener("click", () => applyCodePlan().catch(console.error));
  els.revertCodePlanButton.addEventListener("click", () => revertCodePlan().catch(console.error));
  els.refreshCodePlansButton.addEventListener("click", () => refreshCodePlans().catch(console.error));
  els.runAgentButton.addEventListener("click", () => runAgent(renderLlmStatus).catch(console.error));
  els.clearDebugLogButton.addEventListener("click", clearDebugEntries);
  els.toggleSandboxButton.addEventListener("click", () => {
    state.sandboxExpanded = !state.sandboxExpanded;
    syncSandboxVisibility();
  });
}

function bootstrap() {
  bindEvents();
  syncSandboxVisibility();
  renderDebugLog();
  loadSampleProject()
    .then(scanProject)
    .catch(error => {
      console.error(error);
      setStatus("初始化失败", "idle");
    });
}

bootstrap();

// Shared DOM handles, UI state, and small helpers for the workbench.

export const els = {
  projectNameInput: document.getElementById("project-name"),
  frontendPathInput: document.getElementById("frontend-path"),
  backendPathInput: document.getElementById("backend-path"),
  loadSampleButton: document.getElementById("load-sample"),
  scanProjectButton: document.getElementById("scan-project"),
  openWorkspaceButton: document.getElementById("open-workspace"),
  generateLlmDocButton: document.getElementById("generate-llm-doc"),
  resetWorkspaceButton: document.getElementById("reset-workspace"),
  structuredJson: document.getElementById("structured-json"),
  markdownReport: document.getElementById("markdown-report"),
  statusPill: document.getElementById("status-pill"),
  pageList: document.getElementById("page-list"),
  relatedFiles: document.getElementById("related-files"),
  docTitle: document.getElementById("doc-title"),
  docPurpose: document.getElementById("doc-purpose"),
  conversationThread: document.getElementById("conversation-thread"),
  insightSummary: document.getElementById("insight-summary"),
  insightConfirmed: document.getElementById("insight-confirmed"),
  insightOpenQuestions: document.getElementById("insight-open-questions"),
  docStructures: document.getElementById("doc-structures"),
  docSearchFields: document.getElementById("doc-search-fields"),
  docTableColumns: document.getElementById("doc-table-columns"),
  docPageActions: document.getElementById("doc-page-actions"),
  docRowActions: document.getElementById("doc-row-actions"),
  docRules: document.getElementById("doc-rules"),
  docDialogs: document.getElementById("doc-dialogs"),
  docApiMethods: document.getElementById("doc-api-methods"),
  docBackendEndpoints: document.getElementById("doc-backend-endpoints"),
  patchHistory: document.getElementById("patch-history"),
  sandboxPreview: document.getElementById("sandbox-preview"),
  toggleSandboxButton: document.getElementById("toggle-sandbox"),
  llmOutputStatus: document.getElementById("llm-output-status"),
  floatingDemandInput: document.getElementById("floating-demand-input"),
  floatingDemandSubmit: document.getElementById("floating-demand-submit"),
  codePlanDiff: document.getElementById("code-plan-diff"),
  applyCodePlanButton: document.getElementById("apply-code-plan"),
  revertCodePlanButton: document.getElementById("revert-code-plan"),
  refreshCodePlansButton: document.getElementById("refresh-code-plans"),
  agentPromptInput: document.getElementById("agent-prompt"),
  runAgentButton: document.getElementById("run-agent"),
  clearDebugLogButton: document.getElementById("clear-debug-log"),
  debugLog: document.getElementById("debug-log"),
  agentAnswer: document.getElementById("agent-answer"),
};

export const state = {
  currentDiscovery: null,
  selectedPagePath: null,
  currentWorkspace: null,
  currentAnalysisState: null,
  currentLineageResult: null,
  currentCodePlan: null,
  currentPreview: null,
  currentPlans: [],
  sandboxExpanded: false,
  debugEntries: [],
  activeAgentRun: null,
  traceViewer: null,
  currentTrace: null,
};

export function setStatus(text, kind) {
  els.statusPill.textContent = text;
  els.statusPill.className = `status-pill ${kind}`;
}

export function projectConfig() {
  return {
    project_name: els.projectNameInput.value.trim() || "unnamed-project",
    frontend_path: els.frontendPathInput.value.trim() || null,
    backend_path: els.backendPathInput.value.trim() || null,
    entry_pages: [],
  };
}

export function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function clearContent(node, emptyText) {
  node.innerHTML = "";
  node.classList.add("empty-state");
  if (emptyText) {
    node.textContent = emptyText;
  }
}

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function renderList(node, items, formatter) {
  if (!items.length) {
    clearContent(node, "暂无数据");
    return;
  }
  node.classList.remove("empty-state");
  node.innerHTML = items.map(item => `<li>${escapeHtml(formatter ? formatter(item) : item)}</li>`).join("");
}

export function renderCards(node, items, renderItem) {
  if (!items.length) {
    clearContent(node, "暂无数据");
    return;
  }
  node.classList.remove("empty-state");
  node.innerHTML = items.map(renderItem).join("");
}

export function renderChips(node, items) {
  if (!items.length) {
    clearContent(node, "暂无数据");
    return;
  }
  node.classList.remove("empty-state");
  node.innerHTML = items.map(item => `<span class="chip">${escapeHtml(item)}</span>`).join("");
}

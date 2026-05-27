const PATCH_STORAGE_KEY = "airo:sandbox-patches:v3";

const sandboxPatchState = {
  routePatches: new Map(),
  observer: null,
  renderTimer: null,
  isApplying: false,
  engine: null,
};

function currentRoute() {
  const hash = window.location.hash || "#/";
  return hash.replace(/^#/, "") || "/";
}

function loadStoredPatches() {
  try {
    const raw = window.localStorage.getItem(PATCH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredPatches() {
  const payload = Object.fromEntries(sandboxPatchState.routePatches.entries());
  window.localStorage.setItem(PATCH_STORAGE_KEY, JSON.stringify(payload));
}

function hydrateStoredPatches() {
  const payload = loadStoredPatches();
  Object.entries(payload).forEach(([route, patches]) => {
    sandboxPatchState.routePatches.set(route, patches);
  });
}

function ensureRouteBucket(route) {
  if (!sandboxPatchState.routePatches.has(route)) {
    sandboxPatchState.routePatches.set(route, []);
  }
  return sandboxPatchState.routePatches.get(route);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function inferPrimaryValue(operation, rowContext) {
  if (operation.value !== undefined && operation.value !== null) {
    return String(operation.value);
  }
  if (operation.label?.includes("操作人")) {
    return rowContext?.primaryText ? `${rowContext.primaryText}处理` : "示意用户";
  }
  if (operation.label?.includes("笔数")) {
    return "1";
  }
  return rowContext?.primaryText || "沙箱值";
}

class DOMContextExtractor {
  constructor(doc, win) {
    this.document = doc;
    this.window = win;
  }

  waitForSelector(selector, { timeout = 5000, interval = 120 } = {}) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const node = this.document.querySelector(selector);
        if (node) {
          resolve(node);
          return;
        }
        if (Date.now() - startedAt >= timeout) {
          reject(new Error(`Selector not found: ${selector}`));
          return;
        }
        this.window.setTimeout(check, interval);
      };
      check();
    });
  }

  getVisibleDialogWrapper() {
    return Array.from(this.document.querySelectorAll(".el-dialog__wrapper")).find((node) => {
      const style = this.window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    }) || null;
  }

  getTableContext(tableSelector = ".el-table") {
    const table = this.document.querySelector(tableSelector);
    if (!table) {
      return null;
    }

    const headerWrapper = table.querySelector(".el-table__header-wrapper");
    const bodyWrapper = table.querySelector(".el-table__body-wrapper");
    const headerRow = headerWrapper?.querySelector("thead tr") || null;
    const bodyRows = Array.from(bodyWrapper?.querySelectorAll("tbody tr") || []);

    if (!headerWrapper || !bodyWrapper || !headerRow || !bodyRows.length) {
      return null;
    }

    return {
      table,
      headerWrapper,
      bodyWrapper,
      headerRow,
      bodyRows,
    };
  }

  extractRowContext(tableSelector, rowIndex) {
    const context = this.getTableContext(tableSelector);
    if (!context) {
      return null;
    }
    const row = context.bodyRows[rowIndex];
    if (!row) {
      return null;
    }
    const cells = Array.from(row.querySelectorAll("td .cell, td"));
    const texts = cells.map((node) => (node.textContent || "").trim()).filter(Boolean);
    return {
      rowIndex,
      primaryText: texts[0] || "",
      cells: texts,
      dom: row,
      boundingRect: row.getBoundingClientRect(),
    };
  }

  collectTableMetrics(tableSelector = ".el-table") {
    const context = this.getTableContext(tableSelector);
    if (!context) {
      return null;
    }

    const headerRect = context.headerRow.getBoundingClientRect();
    const bodyRect = context.bodyWrapper.getBoundingClientRect();
    const rowMetrics = context.bodyRows.map((row, index) => {
      const rect = row.getBoundingClientRect();
      const rowContext = this.extractRowContext(tableSelector, index);
      return {
        index,
        top: rect.top,
        height: rect.height || row.offsetHeight || 48,
        context: rowContext,
      };
    });

    return {
      ...context,
      headerRect,
      bodyRect,
      rowMetrics,
      scrollTop: context.bodyWrapper.scrollTop,
      scrollLeft: context.bodyWrapper.scrollLeft,
    };
  }
}

class OverlayManager {
  constructor(doc, win, extractor) {
    this.document = doc;
    this.window = win;
    this.extractor = extractor;
    this.root = null;
    this.tableOverlays = new Map();
    this.formOverlays = new Map();
    this.globalRibbons = new Map();
    this.consolePanel = null;
    this.cleanupTasks = [];
  }

  ensureRoot() {
    if (this.root?.isConnected) {
      return this.root;
    }
    const root = this.document.createElement("div");
    root.className = "sandbox-overlay-root";
    this.document.body.appendChild(root);
    this.root = root;
    return root;
  }

  cleanupTableOverlay(key) {
    const entry = this.tableOverlays.get(key);
    if (!entry) {
      return;
    }
    entry.scrollTarget?.removeEventListener("scroll", entry.sync);
    this.window.removeEventListener("resize", entry.sync);
    entry.resizeObserver?.disconnect();
    entry.container.remove();
    this.tableOverlays.delete(key);
  }

  cleanupFormOverlay(key) {
    const entry = this.formOverlays.get(key);
    if (!entry) {
      return;
    }
    entry.container.remove();
    this.formOverlays.delete(key);
  }

  clear() {
    Array.from(this.tableOverlays.keys()).forEach((key) => this.cleanupTableOverlay(key));
    Array.from(this.formOverlays.keys()).forEach((key) => this.cleanupFormOverlay(key));
    Array.from(this.globalRibbons.values()).forEach((node) => node.remove());
    this.globalRibbons.clear();
    if (this.consolePanel) {
      this.consolePanel.remove();
      this.consolePanel = null;
    }
  }

  destroy() {
    this.clear();
    this.cleanupTasks.forEach((task) => task());
    this.cleanupTasks = [];
    this.root?.remove();
    this.root = null;
  }

  showConsolePanel(title, payload) {
    const root = this.ensureRoot();
    if (!this.consolePanel) {
      this.consolePanel = this.document.createElement("div");
      this.consolePanel.className = "sandbox-console-panel";
      root.appendChild(this.consolePanel);
    }
    this.consolePanel.innerHTML = `
      <div class="sandbox-console-title">${title}</div>
      <pre>${JSON.stringify(payload, null, 2)}</pre>
    `;
  }

  showRibbon(key, title, lines, anchor) {
    if (this.globalRibbons.has(key)) {
      return;
    }
    const ribbon = this.document.createElement("div");
    ribbon.className = "sandbox-patch-ribbon";
    ribbon.innerHTML = `
      <div class="sandbox-patch-ribbon-title">${title}</div>
      <div class="sandbox-patch-ribbon-body">${lines.map((line) => `<span>${line}</span>`).join("")}</div>
    `;
    anchor.parentNode?.insertBefore(ribbon, anchor);
    this.globalRibbons.set(key, ribbon);
  }

  attachToTable(tableSelector, operation, onAction) {
    const metrics = this.extractor.collectTableMetrics(tableSelector);
    if (!metrics) {
      return false;
    }

    const overlayKey = `${tableSelector}:${operation.key || operation.label || operation.target || "column"}`;
    this.cleanupTableOverlay(overlayKey);

    const root = this.ensureRoot();
    const container = this.document.createElement("div");
    container.className = "sandbox-table-overlay";
    container.setAttribute("data-overlay-key", overlayKey);
    root.appendChild(container);

    const sync = () => {
      const nextMetrics = this.extractor.collectTableMetrics(tableSelector);
      if (!nextMetrics) {
        container.style.display = "none";
        return;
      }
      container.style.display = "block";
      this.renderTableOverlay(container, nextMetrics, operation, onAction);
    };

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(metrics.table);
    resizeObserver.observe(metrics.bodyWrapper);
    metrics.bodyRows.forEach((row) => resizeObserver.observe(row));
    metrics.scrollTarget = metrics.bodyWrapper;
    metrics.scrollTarget.addEventListener("scroll", sync, { passive: true });
    this.window.addEventListener("resize", sync);

    this.tableOverlays.set(overlayKey, {
      container,
      resizeObserver,
      scrollTarget: metrics.bodyWrapper,
      sync,
    });

    sync();
    return true;
  }

  renderTableOverlay(container, metrics, operation, onAction) {
    const overlayWidth = 116;
    const viewportWidth = this.window.innerWidth;
    const left = Math.min(metrics.bodyRect.right - 8, viewportWidth - overlayWidth - 12);
    const top = Math.max(metrics.headerRect.top, 80);

    container.style.top = `${top}px`;
    container.style.left = `${Math.max(16, left)}px`;
    container.style.width = `${overlayWidth}px`;

    const headerHeight = metrics.headerRect.height || 48;
    const columnLabel = operation.label?.replace(/^新增/, "").trim() || "新增列";
    const bodyRows = metrics.rowMetrics.map((rowMetric) => {
      const displayValue = inferPrimaryValue(operation, rowMetric.context);
      const buttonHtml = operation.target === "row_action"
        ? `<button class="sandbox-overlay-action" data-row-index="${rowMetric.index}" type="button">${columnLabel}</button>`
        : `<div class="sandbox-overlay-value">${displayValue}</div>`;
      return `
        <div class="sandbox-overlay-row" style="height:${rowMetric.height}px">
          ${buttonHtml}
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div class="sandbox-overlay-card" title="${operation.note || columnLabel}">
        <div class="sandbox-overlay-badge">Sandbox</div>
        <div class="sandbox-overlay-header" style="height:${headerHeight}px">${columnLabel}</div>
        <div class="sandbox-overlay-body">${bodyRows}</div>
      </div>
    `;

    container.querySelectorAll(".sandbox-overlay-action").forEach((button) => {
      button.addEventListener("click", () => {
        const rowIndex = Number(button.dataset.rowIndex || 0);
        const rowContext = this.extractor.extractRowContext(".el-table", rowIndex);
        onAction?.({
          operation,
          rowIndex,
          rowContext,
        });
      });
    });
  }

  mountShadowField(dialogWrapper, operation, shadowForm) {
    const dialogBody = dialogWrapper.querySelector(".el-dialog__body");
    if (!dialogBody) {
      return false;
    }

    const formKey = `${operation.key || operation.label || "field"}:${dialogWrapper.className}`;
    this.cleanupFormOverlay(formKey);

    const container = this.document.createElement("div");
    container.className = "sandbox-shadow-field";
    container.innerHTML = `
      <label class="sandbox-shadow-label">${operation.label || "新增字段"}</label>
      <div class="sandbox-shadow-input-shell">
        <input
          class="sandbox-shadow-input"
          type="${operation.component === "el-input-number" ? "number" : "text"}"
          placeholder="${operation.placeholder || "请输入"}"
          value="${shadowForm[operation.key] || ""}"
        />
      </div>
      <div class="sandbox-shadow-hint">沙箱外挂字段，不会改动真实 Vue 表单模型</div>
    `;

    const input = container.querySelector("input");
    input?.addEventListener("input", (event) => {
      shadowForm[operation.key || operation.label || "field"] = event.target.value;
    });

    dialogBody.appendChild(container);
    this.formOverlays.set(formKey, { container });
    return true;
  }
}

class NetworkInterceptor {
  constructor(win) {
    this.window = win;
    this.originalFetch = null;
    this.originalXhrOpen = null;
    this.originalXhrSend = null;
    this.matcher = null;
    this.handler = null;
    this.installed = false;
  }

  install({ matcher, handler }) {
    if (this.installed) {
      return;
    }
    this.matcher = matcher;
    this.handler = handler;
    this.originalFetch = this.window.fetch?.bind(this.window);
    this.patchFetch();
    this.patchXhr();
    this.installed = true;
  }

  destroy() {
    if (!this.installed) {
      return;
    }
    if (this.originalFetch) {
      this.window.fetch = this.originalFetch;
    }
    if (this.originalXhrOpen) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
    }
    if (this.originalXhrSend) {
      XMLHttpRequest.prototype.send = this.originalXhrSend;
    }
    this.installed = false;
  }

  shouldIntercept(request) {
    if (!this.matcher) {
      return false;
    }
    try {
      return this.matcher(request);
    } catch {
      return false;
    }
  }

  buildMockResponse(payload) {
    return Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }));
  }

  patchFetch() {
    if (!this.originalFetch) {
      return;
    }

    this.window.fetch = async (input, init = {}) => {
      const method = (init.method || "GET").toUpperCase();
      const url = typeof input === "string" ? input : input?.url || "";
      const bodyText = typeof init.body === "string" ? init.body : null;
      const request = {
        transport: "fetch",
        method,
        url,
        bodyText,
        bodyJson: bodyText ? safeJsonParse(bodyText) : null,
      };

      if (!this.shouldIntercept(request)) {
        return this.originalFetch(input, init);
      }

      const result = await this.handler?.(request);
      if (result?.mode === "passthrough") {
        return this.originalFetch(input, init);
      }
      return this.buildMockResponse(result?.response || {
        ok: true,
        sandboxIntercepted: true,
      });
    };
  }

  patchXhr() {
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__sandboxRequestMeta = {
        method: (method || "GET").toUpperCase(),
        url,
      };
      return sandboxPatchState.engine.networkInterceptor.originalXhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function patchedSend(body) {
      const request = {
        transport: "xhr",
        method: this.__sandboxRequestMeta?.method || "GET",
        url: this.__sandboxRequestMeta?.url || "",
        bodyText: typeof body === "string" ? body : null,
        bodyJson: typeof body === "string" ? safeJsonParse(body) : null,
      };

      if (!sandboxPatchState.engine.networkInterceptor.shouldIntercept(request)) {
        return sandboxPatchState.engine.networkInterceptor.originalXhrSend.call(this, body);
      }

      Promise.resolve(sandboxPatchState.engine.networkInterceptor.handler?.(request)).then((result) => {
        Object.defineProperty(this, "readyState", { value: 4, configurable: true });
        Object.defineProperty(this, "status", { value: 200, configurable: true });
        Object.defineProperty(this, "responseText", {
          value: JSON.stringify(result?.response || { ok: true, sandboxIntercepted: true }),
          configurable: true,
        });
        this.onreadystatechange?.();
        this.onload?.();
      });
      return undefined;
    };
  }
}

class PatchRuntimeEngine {
  constructor(doc, win) {
    this.document = doc;
    this.window = win;
    this.shadowState = {
      forms: {},
      actions: [],
      clearedBalanceRows: new Set(),
    };
    this.contextExtractor = new DOMContextExtractor(doc, win);
    this.overlayManager = new OverlayManager(doc, win, this.contextExtractor);
    this.networkInterceptor = new NetworkInterceptor(win);
    this.boundButtonPatches = [];
  }

  install() {
    this.installStyles();
    this.networkInterceptor.install({
      matcher: (request) => {
        const mutatingMethod = ["POST", "PUT"].includes(request.method);
        return mutatingMethod && Boolean(this.getVisibleShadowFormPayload());
      },
      handler: (request) => {
        const mergedPayload = {
          ...(request.bodyJson || {}),
          ...this.getVisibleShadowFormPayload(),
        };
        this.overlayManager.showConsolePanel("沙箱模拟提交成功", {
          request: {
            method: request.method,
            url: request.url,
          },
          payload: mergedPayload,
        });
        return {
          mode: "mock",
          response: {
            ok: true,
            sandboxIntercepted: true,
            payload: mergedPayload,
          },
        };
      },
    });
  }

  destroy() {
    this.boundButtonPatches.forEach((cleanup) => cleanup());
    this.boundButtonPatches = [];
    this.overlayManager.destroy();
    this.networkInterceptor.destroy();
  }

  installStyles() {
    if (this.document.getElementById("sandbox-overlay-styles")) {
      return;
    }
    const style = this.document.createElement("style");
    style.id = "sandbox-overlay-styles";
    style.textContent = `
      .sandbox-overlay-root {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9999;
      }
      .sandbox-table-overlay {
        position: fixed;
        pointer-events: auto;
      }
      .sandbox-overlay-card {
        position: relative;
        border: 1px solid rgba(96, 165, 250, 0.45);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(3px);
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
        overflow: hidden;
      }
      .sandbox-overlay-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        height: 18px;
        padding: 0 6px;
        border-radius: 999px;
        background: rgba(219, 234, 254, 0.95);
        color: #2563eb;
        font-size: 10px;
        line-height: 18px;
        font-weight: 700;
      }
      .sandbox-overlay-header,
      .sandbox-overlay-row {
        display: flex;
        align-items: center;
        padding: 0 10px;
        border-top: 1px solid rgba(191, 219, 254, 0.8);
      }
      .sandbox-overlay-header {
        background: rgba(239, 246, 255, 0.9);
        color: #1e3a8a;
        font-weight: 700;
        font-size: 13px;
      }
      .sandbox-overlay-row {
        background: rgba(255, 255, 255, 0.9);
      }
      .sandbox-overlay-value {
        color: #334155;
        font-size: 13px;
        white-space: nowrap;
        font-weight: 600;
      }
      .sandbox-overlay-action {
        border: 1px solid rgba(59, 130, 246, 0.45);
        background: white;
        color: #2563eb;
        border-radius: 6px;
        height: 28px;
        padding: 0 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        width: 100%;
      }
      .sandbox-shadow-field {
        margin-top: 16px;
        padding: 14px;
        border: 1px dashed #60a5fa;
        border-radius: 10px;
        background: rgba(239, 246, 255, 0.95);
      }
      .sandbox-shadow-label {
        display: block;
        margin-bottom: 8px;
        color: #1d4ed8;
        font-size: 13px;
        font-weight: 700;
      }
      .sandbox-shadow-input-shell {
        border: 1px solid #93c5fd;
        border-radius: 8px;
        background: white;
        padding: 8px 10px;
      }
      .sandbox-shadow-input {
        width: 100%;
        border: 0;
        outline: none;
        font-size: 13px;
      }
      .sandbox-shadow-hint {
        margin-top: 8px;
        color: #475569;
        font-size: 12px;
      }
      .sandbox-patch-ribbon {
        margin: 10px 0;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #bfdbfe;
        background: rgba(239, 246, 255, 0.96);
      }
      .sandbox-patch-ribbon-title {
        font-size: 12px;
        font-weight: 700;
        color: #1d4ed8;
        margin-bottom: 6px;
      }
      .sandbox-patch-ribbon-body {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: #334155;
        font-size: 13px;
      }
      .sandbox-console-panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: min(520px, calc(100vw - 32px));
        max-height: 44vh;
        overflow: auto;
        padding: 12px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.96);
        color: #e2e8f0;
        box-shadow: 0 18px 36px rgba(15, 23, 42, 0.28);
        pointer-events: auto;
      }
      .sandbox-console-title {
        margin-bottom: 8px;
        color: #93c5fd;
        font-size: 13px;
        font-weight: 700;
      }
      .sandbox-console-panel pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.5;
      }
      .sandbox-mock-btn {
        border: 1px solid rgba(37, 99, 235, 0.4);
        box-shadow: 0 0 0 2px rgba(191, 219, 254, 0.75);
      }
      .sandbox-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        min-width: 180px;
        max-width: 360px;
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.92);
        color: #f8fafc;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.2);
        pointer-events: none;
        opacity: 0;
        transition: opacity 180ms ease;
      }
      .sandbox-toast.success {
        background: rgba(22, 101, 52, 0.92);
      }
      .sandbox-toast.warning {
        background: rgba(146, 64, 14, 0.94);
      }
    `;
    this.document.head.appendChild(style);
  }

  getVisibleShadowFormKey() {
    const wrapper = this.contextExtractor.getVisibleDialogWrapper();
    if (!wrapper) {
      return null;
    }
    const title = wrapper.querySelector(".el-dialog__title")?.textContent?.trim() || "dialog";
    return `dialog:${title}`;
  }

  getVisibleShadowFormPayload() {
    const key = this.getVisibleShadowFormKey();
    return key ? this.shadowState.forms[key] : null;
  }

  showToast(message, kind = "info") {
    const root = this.overlayManager.ensureRoot();
    let toast = root.querySelector(".sandbox-toast");
    if (!toast) {
      toast = this.document.createElement("div");
      toast.className = "sandbox-toast";
      root.appendChild(toast);
    }
    toast.className = `sandbox-toast ${kind}`;
    toast.textContent = message;
    toast.style.opacity = "1";
    this.window.clearTimeout(this.toastTimer);
    this.toastTimer = this.window.setTimeout(() => {
      toast.style.opacity = "0";
    }, 2200);
  }

  normalizeText(text) {
    return (text || "").replace(/\s+/g, "").trim();
  }

  getTableHeaderLabels(tableSelector = ".el-table") {
    return Array.from(this.document.querySelectorAll(`${tableSelector} .el-table__header-wrapper thead th`))
      .map((cell) => this.normalizeText(cell.textContent));
  }

  getColumnIndexByLabel(label, tableSelector = ".el-table") {
    const normalizedLabel = this.normalizeText(label);
    return this.getTableHeaderLabels(tableSelector).findIndex((text) => text.includes(normalizedLabel));
  }

  buildRowSignature(row, tableSelector = ".el-table") {
    const labels = this.getTableHeaderLabels(tableSelector);
    const cells = Array.from(row.querySelectorAll("td"));
    const signatureParts = [];
    labels.forEach((label, index) => {
      if (!label || label.includes("操作") || label.includes("结存")) {
        return;
      }
      const text = this.normalizeText(cells[index]?.textContent || "");
      if (text) {
        signatureParts.push(`${label}:${text}`);
      }
    });
    return signatureParts.join("|");
  }

  getSelectedRows(tableSelector = ".el-table") {
    return Array.from(this.document.querySelectorAll(`${tableSelector} .el-table__body-wrapper tbody tr`))
      .filter((row) => row.querySelector(".el-checkbox__input.is-checked"));
  }

  applyClearedBalanceVisuals(tableSelector = ".el-table") {
    const balanceIndex = this.getColumnIndexByLabel("结存", tableSelector);
    if (balanceIndex < 0) {
      return;
    }
    Array.from(this.document.querySelectorAll(`${tableSelector} .el-table__body-wrapper tbody tr`)).forEach((row) => {
      const signature = this.buildRowSignature(row, tableSelector);
      if (!this.shadowState.clearedBalanceRows.has(signature)) {
        return;
      }
      const balanceCell = row.querySelectorAll("td")[balanceIndex];
      const cellContent = balanceCell?.querySelector(".cell") || balanceCell;
      if (cellContent) {
        cellContent.textContent = "￥0";
      }
    });
  }

  handleToolbarButtonAction(operation) {
    if (operation.key !== "clearBalance") {
      this.overlayManager.showConsolePanel("沙箱按钮触发", {
        action: operation.label || "mock-button",
      });
      return;
    }

    const selectedRows = this.getSelectedRows(".el-table");
    if (!selectedRows.length) {
      this.showToast("请先选择数据", "warning");
      return;
    }

    selectedRows.forEach((row) => {
      const signature = this.buildRowSignature(row, ".el-table");
      if (signature) {
        this.shadowState.clearedBalanceRows.add(signature);
      }
    });
    this.applyClearedBalanceVisuals(".el-table");
    this.showToast("已清除选中数据的结存展示", "success");
  }

  attachMockButton(operation) {
    const candidates = Array.from(this.document.querySelectorAll("button"));
    const existingRealButton = candidates.find((node) => node.textContent?.trim() === (operation.label || "沙箱按钮"));
    if (existingRealButton && !existingRealButton.dataset.sandboxButtonKey) {
      return;
    }
    const anchor = candidates.find((node) => node.textContent?.trim() === operation.original_label);
    if (!anchor || anchor.parentNode?.querySelector(`[data-sandbox-button-key="${operation.label}"]`)) {
      return;
    }
    const button = this.document.createElement("button");
    button.type = "button";
    button.className = `${anchor.className} sandbox-mock-btn`;
    button.setAttribute("data-sandbox-button-key", operation.label || "mock-button");
    button.textContent = operation.label || "沙箱按钮";
    button.addEventListener("click", () => {
      this.handleToolbarButtonAction(operation);
    });
    anchor.parentNode.insertBefore(button, anchor.nextSibling);
    this.boundButtonPatches.push(() => button.remove());
  }

  applyOperation(operation) {
    switch (operation.action) {
      case "add_table_column": {
        const tableSelector = operation.selector || ".el-table";
        const columnLabel = operation.label?.replace(/^新增/, "").trim() || "新增列";
        const hasExistingColumn = Array.from(this.document.querySelectorAll(`${tableSelector} th`))
          .some((node) => (node.textContent || "").replace(/\s+/g, "").includes(columnLabel));
        if (hasExistingColumn) {
          return;
        }
        this.overlayManager.attachToTable(tableSelector, operation, ({ rowContext }) => {
          this.overlayManager.showConsolePanel("沙箱行级上下文", {
            action: operation.label || "table-projection",
            row: rowContext,
          });
        });
        const table = this.document.querySelector(tableSelector);
        if (table?.parentNode) {
          this.overlayManager.showRibbon(
            `table:${operation.key || operation.label}`,
            "新增表格列预览",
            [`${operation.label || "新列"}${operation.note ? ` · ${operation.note}` : ""}`],
            table,
          );
        }
        break;
      }
      case "add_form_field": {
        const dialogWrapper = this.contextExtractor.getVisibleDialogWrapper();
        if (!dialogWrapper) {
          return;
        }
        const formKey = this.getVisibleShadowFormKey();
        if (!formKey) {
          return;
        }
        if (!this.shadowState.forms[formKey]) {
          this.shadowState.forms[formKey] = {};
        }
        this.overlayManager.mountShadowField(dialogWrapper, operation, this.shadowState.forms[formKey]);
        break;
      }
      case "add_search_field": {
        const searchRow = this.document.querySelector(".el-row");
        if (!searchRow) {
          return;
        }
        this.overlayManager.showRibbon(
          `search:${operation.key || operation.label}`,
          "搜索区需求备注",
          [`${operation.label || "新增字段"} · ${operation.placeholder || operation.component || "输入控件"}`],
          searchRow,
        );
        break;
      }
      case "rename_button": {
        this.attachMockButton(operation);
        break;
      }
      case "add_toolbar_button": {
        this.attachMockButton(operation);
        break;
      }
      case "annotate_rule": {
        const anchor = this.document.querySelector(".el-table") || this.document.body;
        this.overlayManager.showRibbon(
          `rule:${operation.key || operation.label || operation.note}`,
          "需求备注",
          [operation.note || operation.label || "已记录需求"],
          anchor,
        );
        break;
      }
      default:
        break;
    }
  }

  replacePatches(patches) {
    this.overlayManager.clear();
    this.boundButtonPatches.forEach((cleanup) => cleanup());
    this.boundButtonPatches = [];
    (patches || []).forEach((patch) => {
      (patch.operations || []).forEach((operation) => this.applyOperation(operation));
    });
    this.applyClearedBalanceVisuals(".el-table");
  }
}

function ensureEngine() {
  if (!sandboxPatchState.engine) {
    sandboxPatchState.engine = new PatchRuntimeEngine(document, window);
    sandboxPatchState.engine.install();
  }
  return sandboxPatchState.engine;
}

function renderRoutePatches() {
  sandboxPatchState.isApplying = true;
  const route = currentRoute();
  const patches = sandboxPatchState.routePatches.get(route) || [];
  ensureEngine().replacePatches(patches);
  sandboxPatchState.isApplying = false;
}

function scheduleRender(delay = 220) {
  window.clearTimeout(sandboxPatchState.renderTimer);
  sandboxPatchState.renderTimer = window.setTimeout(renderRoutePatches, delay);
}

function installMutationObserver() {
  if (sandboxPatchState.observer) {
    sandboxPatchState.observer.disconnect();
  }
  sandboxPatchState.observer = new MutationObserver(() => {
    if (sandboxPatchState.isApplying) {
      return;
    }
    scheduleRender(120);
  });
  sandboxPatchState.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export function installPatchRuntime() {
  hydrateStoredPatches();
  ensureEngine();

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (!payload || !payload.type || !payload.route) {
      return;
    }

    if (payload.type === "sandbox:apply-patch" && payload.patch) {
      const bucket = ensureRouteBucket(payload.route);
      bucket.push(payload.patch);
      saveStoredPatches();
      scheduleRender();
      return;
    }

    if (payload.type === "sandbox:replace-patches" && Array.isArray(payload.patches)) {
      sandboxPatchState.routePatches.set(payload.route, payload.patches);
      saveStoredPatches();
      scheduleRender();
    }
  });

  window.addEventListener("hashchange", () => scheduleRender(60));
  document.addEventListener("DOMContentLoaded", () => {
    installMutationObserver();
    scheduleRender(60);
  });
  installMutationObserver();
  scheduleRender(60);
}

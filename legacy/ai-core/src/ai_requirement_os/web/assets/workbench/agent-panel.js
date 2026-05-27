// Agent panel behavior is isolated here because later V1/V2 work will likely
// iterate on streaming traces, tool displays, and agent-specific workflows.

import { els, escapeHtml, projectConfig, setStatus, state } from "./shared.js";
import {
  consumeSseStream,
  logAgentRunDebug,
  logAgentStreamEvent,
  pushDebugEntry,
} from "./debug-panel.js";

export async function runAgent(renderLlmStatus) {
  const text = els.agentPromptInput.value.trim();
  if (!text) {
    window.alert("先写一条 Agent 指令。");
    return;
  }
  if (!state.selectedPagePath) {
    window.alert("请先扫描并选择一个页面。");
    return;
  }

  setStatus("Agent 运行中", "running");
  els.runAgentButton.disabled = true;
  state.activeAgentRun = { startedAt: Date.now() };
  els.agentAnswer.classList.remove("empty-state");
  els.agentAnswer.textContent = "Agent 正在推理并调用工具...";

  const payload = {
    user_prompt: text,
    config: projectConfig(),
    page_path: state.selectedPagePath,
    max_turns: 8,
  };
  pushDebugEntry(
    "Agent Run Request",
    [
      {
        label: "Payload",
        content: JSON.stringify(payload, null, 2),
      },
    ],
    "POST /api/agent/run/stream",
  );

  try {
    const response = await fetch("/api/agent/run/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setStatus("Agent 失败", "idle");
      const payloadError = await response.json().catch(() => null);
      const errorText = payloadError?.detail || "Agent 运行失败";
      els.agentAnswer.textContent = errorText;
      pushDebugEntry(
        "Agent Run Error",
        [
          {
            label: "Error",
            content: errorText,
          },
        ],
        String(response.status),
      );
      return;
    }

    let finalResult = null;
    await consumeSseStream(response, event => {
      logAgentStreamEvent(event);
      if (event.event === "turn_started") {
        setStatus(`Agent 第 ${event.turn} 轮`, "running");
        els.agentAnswer.textContent = `Agent 正在执行第 ${event.turn} 轮...`;
        return;
      }
      if (event.event === "decision") {
        const toolNames = (event.payload?.tool_calls || []).map(item => item.tool_name).join(", ");
        els.agentAnswer.innerHTML = `
          <strong>当前思路</strong>
          <p>${escapeHtml(event.payload?.reasoning || "无")}</p>
          <p>${escapeHtml(toolNames ? `准备调用：${toolNames}` : "这一步不需要调用工具。")}</p>
        `;
        return;
      }
      if (event.event === "tool_call_started") {
        setStatus(`调用 ${event.payload?.tool_name || "工具"} 中`, "running");
        return;
      }
      if (event.event === "run_completed") {
        finalResult = event.payload?.result || null;
      }
      if (event.event === "run_error") {
        setStatus("Agent 失败", "idle");
        els.agentAnswer.textContent = event.message || "Agent 运行失败";
      }
    });

    if (!finalResult) {
      setStatus("Agent 结束异常", "idle");
      return;
    }

    els.agentAnswer.innerHTML = `
      <strong>最终回答</strong>
      <p>${escapeHtml(finalResult.final_answer || "无")}</p>
    `;
    renderLlmStatus({
      mode: `agent/${finalResult.status}`,
      model: finalResult.model,
      warnings: finalResult.warnings || [],
    });
    logAgentRunDebug(finalResult);
    setStatus("Agent 已完成", "done");
  } finally {
    els.runAgentButton.disabled = false;
    state.activeAgentRun = null;
  }
}

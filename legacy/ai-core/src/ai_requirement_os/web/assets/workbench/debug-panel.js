// Debug/trace rendering is grouped here so the agent-facing experience can
// evolve separately from the broader page-analysis UI.

import { clearContent, els, escapeHtml, prettyJson, state } from "./shared.js";

export function renderDebugLog() {
  if (!state.debugEntries.length) {
    clearContent(els.debugLog, "还没有调试记录。");
    return;
  }
  els.debugLog.classList.remove("empty-state");
  els.debugLog.innerHTML = state.debugEntries.map(entry => `
    <article class="debug-entry">
      <div class="debug-entry-header">
        <strong>${escapeHtml(entry.title)}</strong>
        <span>${escapeHtml(entry.meta || "")}</span>
      </div>
      <div class="debug-entry-body">
        ${(entry.blocks || []).map(block => `
          <section class="debug-block">
            <strong>${escapeHtml(block.label)}</strong>
            <pre class="debug-code">${escapeHtml(block.content)}</pre>
          </section>
        `).join("")}
      </div>
    </article>
  `).join("");
}

export function pushDebugEntry(title, blocks, meta) {
  state.debugEntries = [
    {
      title,
      meta: meta || new Date().toLocaleTimeString("zh-CN"),
      blocks,
    },
    ...state.debugEntries,
  ].slice(0, 40);
  renderDebugLog();
}

export function clearDebugEntries() {
  state.debugEntries = [];
  renderDebugLog();
}

export async function consumeSseStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const lines = frame
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.startsWith("data:"));
      if (!lines.length) {
        continue;
      }
      const dataText = lines.map(line => line.slice(5).trim()).join("\n");
      if (!dataText) {
        continue;
      }
      onEvent(JSON.parse(dataText));
    }
  }
}

export function logPageLineageDebug(result) {
  pushDebugEntry(
    "Page Lineage Prompt",
    [
      {
        label: "System Prompt",
        content: result.debug?.system_prompt || "无",
      },
      {
        label: "User Prompt",
        content: result.debug?.user_prompt || "无",
      },
      {
        label: "Evidence Bundle",
        content: result.debug?.evidence_bundle_json || "无",
      },
      {
        label: "Lineage Output",
        content: prettyJson(result.lineage || {}),
      },
    ],
    `${result.mode} · ${result.model}`,
  );
}

export function logAgentRunDebug(result) {
  pushDebugEntry(
    "Agent Run Summary",
    [
      {
        label: "System Prompt",
        content: result.debug?.system_prompt || "无",
      },
      {
        label: "User Prompt",
        content: result.debug?.user_prompt || "无",
      },
      {
        label: "Runtime Context",
        content: prettyJson(result.debug?.runtime_context || {}),
      },
      {
        label: "Final Answer",
        content: result.final_answer || "无",
      },
    ],
    `${result.status} · ${result.model}`,
  );

  [...(result.steps || [])].reverse().forEach(step => {
    pushDebugEntry(
      `Agent Turn ${step.turn}`,
      [
        {
          label: "Reasoning",
          content: step.reasoning || "无",
        },
        {
          label: "Assistant Response",
          content: step.assistant_response || "无",
        },
        {
          label: "Tool Calls",
          content: prettyJson(step.tool_calls || []),
        },
        {
          label: "Tool Results",
          content: prettyJson(step.tool_results || []),
        },
      ],
      step.done ? "done" : "in progress",
    );
  });
}

export function logAgentStreamEvent(event) {
  if (event.event === "run_started") {
    pushDebugEntry(
      "Agent Run Started",
      [
        {
          label: "Debug",
          content: prettyJson(event.payload || {}),
        },
      ],
      event.payload?.model || "",
    );
    return;
  }
  if (event.event === "decision") {
    pushDebugEntry(
      `Turn ${event.turn} Decision`,
      [
        {
          label: "Reasoning",
          content: event.payload?.reasoning || "无",
        },
        {
          label: "Assistant Response",
          content: event.payload?.assistant_response || "无",
        },
        {
          label: "Tool Calls",
          content: prettyJson(event.payload?.tool_calls || []),
        },
      ],
      event.message,
    );
    return;
  }
  if (event.event === "tool_call_started" || event.event === "tool_call_finished") {
    pushDebugEntry(
      `Turn ${event.turn} ${event.payload?.tool_name || "tool"}`,
      [
        {
          label: event.event === "tool_call_started" ? "Tool Input" : "Tool Output",
          content: prettyJson(event.payload || {}),
        },
      ],
      event.event,
    );
    return;
  }
  if (event.event === "turn_finished") {
    pushDebugEntry(
      `Turn ${event.turn} Finished`,
      [
        {
          label: "Step",
          content: prettyJson(event.payload || {}),
        },
      ],
      event.message,
    );
    return;
  }
  if (event.event === "run_error") {
    pushDebugEntry(
      "Agent Run Error",
      [
        {
          label: "Error",
          content: prettyJson(event.payload || { detail: event.message }),
        },
      ],
      event.message,
    );
  }
}

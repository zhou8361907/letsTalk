/**
 * 调用 runChat 并收集 SSE 事件，返回 EvalTurnResult
 */

import { randomUUID } from "crypto";
// @lets-talk/agent-runtime 通过 eval/package.json 的 workspace 协议解析
const { runChat, disposePiSession } = await import(
  "@lets-talk/agent-runtime"
);

export async function runEvalTurn(message, config) {
  const { chatMode, useTools = true } = config;

  // 每个 scenario 用新 sessionId，避免污染
  const sessionId = `eval-${randomUUID()}`;
  const traceId = `trace-${randomUUID()}`;
  const actorId = "eval-bot"; // 固定 eval-bot actor

  const startTime = Date.now();
  let assistantText = "";
  let draft = null;
  const tools = new Set();
  let success = true;
  let error = undefined;
  let turnCostUsd = null;

  const events = [];

  try {
    await runChat({
      sessionId,
      traceId,
      message,
      useTools,
      chatMode,
      actorId,
      onEvent: (event) => {
        events.push(event);

        if (event.type === "assistant_delta") {
          assistantText += event.text;
        }

        if (event.type === "requirement_state") {
          draft = event.draft;
        }

        if (event.type === "tool_start") {
          tools.add(event.tool);
        }
      },
    });

    // 从 events 中提取 cost（如果有 turn_end 事件）
    const turnEndEvent = events.find((e) => e.type === "turn_end");
    // 注意：实际 cost 需要从 TraceRecorder 获取，这里简化处理
    // 在 provider 层我们会用 TraceRecorder 来获取准确 cost
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
  } finally {
    // 清理 session
    disposePiSession(sessionId);
  }

  const durationMs = Date.now() - startTime;

  return {
    assistantText,
    draft,
    tools: Array.from(tools),
    turnCostUsd,
    durationMs,
    traceId,
    success,
    error,
  };
}

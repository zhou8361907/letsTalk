/**
 * Pi session.compact() — percent≥critical 时在 prompt 前自动压缩历史。
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ChatMode, ContextUsageSnapshot, SseEvent } from "@lets-talk/shared-types";
import { contextBudgetThresholds } from "./context-budget-config.js";

function buildCompactionInstructions(
  chatMode: ChatMode,
  draftRevision?: number,
): string {
  const lines = [
    "你是 letsTalk 会话压缩助手。将较早对话总结为简洁中文要点。",
    "保留：已确认的代码路径、接口名、业务决策、用户纠正、锚点相关结论。",
    "不要写入：完整 tool/grep 原文、试探性错误推理、重复探索过程。",
    "代码为准：未在对话中确认过的 API/字段不要编造。",
  ];
  if (chatMode === "prd") {
    lines.push(
      "PRD 模式：需求清单正文在 requirementDraft（Store），勿在摘要中复述清单全文。",
      draftRevision != null && draftRevision > 0
        ? `可写：当前 draft_revision=${draftRevision} 及已达成条目 id 级结论。`
        : "可写：清单讨论的方向性结论（无条目 id 时一句带过）。",
    );
  }
  return lines.join("\n");
}

export function shouldCompactSession(
  usage: ContextUsageSnapshot | null,
): boolean {
  if (!usage || usage.percent == null) return false;
  return usage.percent >= contextBudgetThresholds().criticalPercent;
}

/** percent≥critical 时调用 Pi compact；须在 session.prompt 之前、会话 idle 时执行 */
export async function maybeCompactSessionIfNeeded(input: {
  session: AgentSession;
  usage: ContextUsageSnapshot | null;
  chatMode: ChatMode;
  draftRevision?: number;
  onEvent?: (event: SseEvent) => void;
}): Promise<boolean> {
  if (!shouldCompactSession(input.usage)) return false;
  if (input.session.isCompacting) return false;

  input.onEvent?.({ type: "context_compaction", phase: "start" });

  try {
    const result = await input.session.compact(
      buildCompactionInstructions(input.chatMode, input.draftRevision),
    );
    input.onEvent?.({
      type: "context_compaction",
      phase: "end",
      ok: true,
      tokensBefore: result.tokensBefore,
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    input.onEvent?.({
      type: "context_compaction",
      phase: "end",
      ok: false,
      message,
    });
    return false;
  }
}

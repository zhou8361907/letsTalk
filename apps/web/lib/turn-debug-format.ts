import type { TurnDebugSnapshot } from "@lets-talk/shared-types";

function charCount(s: string | undefined | null): number {
  return (s ?? "").length;
}

/** 回合调试「概览」面板文本 */
export function formatTurnOverview(turn: TurnDebugSnapshot): string {
  const sp = turn.systemPrompt;
  const lines = [
    "=== 发给 LLM 的内容分层 ===",
    "",
    "1. System（会话创建时冻结）",
    `   - 字符数: ${charCount(sp?.combined)}`,
    sp?.agentsFiles?.length
      ? `   - AGENTS 文件: ${sp.agentsFiles.map((f) => f.path).join(", ")}`
      : "   - AGENTS 文件: （无）",
    `   - append 块数: ${sp?.appendBlocks?.length ?? 0}`,
    sp?.sourceNote ? `   - 说明: ${sp.sourceNote}` : "",
    "",
    "2. User 每轮（JIT 前缀 + 用户输入）",
    turn.contextPrefix.includes("core_memory_refresh")
      ? "   - 含 <core_memory_refresh>（本会话 M0 磁盘更新）"
      : "",
    `   - JIT 前缀: ${charCount(turn.contextPrefix)} 字符`,
    `   - 用户原文: ${charCount(turn.userMessage)} 字符`,
    `   - 合计 promptUserText: ${charCount(turn.promptUserText)} 字符`,
    "",
    "3. 多轮历史",
    "   - 来自 Pi jsonl 的 user/assistant/toolResult（不含 system）",
    "",
    "4. 工具 schema",
    turn.activeTools?.length
      ? `   - 注册工具 (${turn.activeTools.length}): ${turn.activeTools.join(", ")}`
      : "   - 注册工具: （未知或未记录）",
    "",
    "=== 本轮元信息 ===",
    `- turnId: ${turn.turnId}`,
    `- 时间: ${turn.at}`,
    `- chatMode: ${turn.chatMode}`,
    turn.modelLabel ? `- model: ${turn.modelLabel}` : "",
    turn.anchor?.ref ? `- anchor: ${turn.anchor.ref}` : "",
    turn.contextUsage
      ? `- context: ${turn.contextUsage.tokens ?? "?"} / ${turn.contextUsage.contextWindow} tokens (${turn.contextUsage.percent ?? "?"}%)`
      : "",
    `- 工具调用次数: ${turn.tools.length}`,
    turn.piSessionFile ? `- pi jsonl: ${turn.piSessionFile}` : "",
    "",
    "提示: contextUsage.tokens 含 system + 历史 + 工具定义，通常远大于单轮 user 文本。",
  ];
  return lines.filter(Boolean).join("\n");
}

/** 复制用：合并 system + user + assistant 摘要 */
export function formatTurnFullExport(turn: TurnDebugSnapshot): string {
  const parts = [
    "# System Prompt",
    turn.systemPrompt?.combined?.trim() || "（无 system 快照）",
    turn.systemPrompt?.sourceNote
      ? `\n> ${turn.systemPrompt.sourceNote}`
      : "",
    "",
    "# User（promptUserText）",
    turn.promptUserText,
    "",
    "# Assistant",
    turn.assistantText || "（空）",
  ];
  if (turn.tools.length > 0) {
    parts.push(
      "",
      "# Tools",
      ...turn.tools.map(
        (t, i) =>
          `## ${i + 1}. ${t.tool}\n${t.preview}`,
      ),
    );
  }
  return parts.join("\n");
}

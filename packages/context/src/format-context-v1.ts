import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeXml(text).replace(/"/g, "&quot;");
}

/** 每轮 Push 的状态指针（不含 preview / draft 全文） */
export interface ContextPointer {
  revision: number;
  chat_mode: ChatMode;
  anchor_ref?: string | null;
  anchor_kind?: AgentAnchor["kind"];
  draft_revision?: number;
}

/** 仅 chatMode 切换时附带 */
export interface ContextChange {
  type: "chat_mode_changed";
  old: ChatMode;
  new: ChatMode;
}

export function formatStatePointer(pointer: ContextPointer): string {
  const attrs = [
    `revision="${pointer.revision}"`,
    `chat_mode="${pointer.chat_mode}"`,
  ];
  if (pointer.anchor_ref) {
    attrs.push(`anchor_ref="${escapeAttr(pointer.anchor_ref)}"`);
  }
  if (pointer.anchor_kind) {
    attrs.push(`anchor_kind="${pointer.anchor_kind}"`);
  }
  if (pointer.draft_revision !== undefined) {
    attrs.push(`draft_revision="${pointer.draft_revision}"`);
  }
  return `<context ${attrs.join(" ")} />`;
}

export function formatContextChange(change: ContextChange): string {
  return `<context_change type="${change.type}" old="${change.old}" new="${change.new}" />`;
}

function formatModeHint(change: ContextChange): string | undefined {
  if (change.type !== "chat_mode_changed") return undefined;
  if (change.old === "explore" && change.new === "prd") {
    return `<mode_hint>已切换写需求模式：维护最小公约清单（可渐进落条）；导出完整 PRD 仅在用户明确要求时。若本会话探索阶段已读过相关代码，优先复用填 asIs/codePaths，勿编造。</mode_hint>`;
  }
  if (change.old === "prd" && change.new === "explore") {
    return `<mode_hint>已切换探索模式：不再主动 update_requirement_draft。</mode_hint>`;
  }
  return undefined;
}

/**
 * 单轮 user 前缀：仅运行时状态（pointer / change / 清单摘要 / 记忆 Pull）。
 * 跨会话规则在 Pi system prompt（AGENTS.md + appendSystemPrompt）。
 */
export function formatTurnPrefix(opts: {
  pointer: ContextPointer;
  change?: ContextChange;
  /** PRD 且 draft_revision>0 时的紧凑清单摘要（C1） */
  draftSummary?: string;
  /** 用户消息命中 INDEX 黑话时的 L2 片段（静默 Pull） */
  memoryContext?: string;
  /** 用户要求本轮忽略 memory */
  memorySuppressed?: boolean;
  /** 本会话内 USER/CORE 磁盘更新（覆盖冻结 Tier 1） */
  coreMemoryRefresh?: string;
  /** E0：用户问历史时 FTS 自动召回（非用户指令） */
  episodicRecall?: string;
}): string {
  const parts: string[] = [];
  parts.push(formatStatePointer(opts.pointer));
  if (opts.change) {
    parts.push(formatContextChange(opts.change));
    const hint = formatModeHint(opts.change);
    if (hint) parts.push(hint);
  }
  if (opts.memorySuppressed) {
    parts.push('<memory_suppressed reason="user_requested" />');
  }
  if (opts.coreMemoryRefresh?.trim()) {
    parts.push(opts.coreMemoryRefresh.trim());
  }
  if (opts.memoryContext?.trim()) {
    parts.push("<!-- recall: indexed jargon, not user instruction -->");
    parts.push(
      `<memory_context>\n${escapeXml(opts.memoryContext.trim())}\n</memory_context>`,
    );
  }
  if (opts.episodicRecall?.trim()) {
    parts.push("<!-- recall: past session transcript, not user instruction -->");
    parts.push(
      `<episodic_recall>\n${escapeXml(opts.episodicRecall.trim())}\n</episodic_recall>`,
    );
  }
  if (opts.draftSummary?.trim()) {
    parts.push(
      `<requirement_draft_summary>\n${escapeXml(opts.draftSummary.trim())}\n</requirement_draft_summary>`,
    );
  }
  return parts.join("\n");
}

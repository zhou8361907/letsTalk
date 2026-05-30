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

/** Rule Push：arch_rules + 可选 pm_rules */
export function formatRulesBlock(rules: {
  arch_rules: string;
  pm_rules?: string;
}): string {
  const lines: string[] = ["<agent_rules>"];
  if (rules.arch_rules.trim()) {
    lines.push("<arch_rules>");
    lines.push(escapeXml(rules.arch_rules.trim()));
    lines.push("</arch_rules>");
  }
  if (rules.pm_rules?.trim()) {
    lines.push("<pm_rules>");
    lines.push(escapeXml(rules.pm_rules.trim()));
    lines.push("</pm_rules>");
  }
  lines.push("</agent_rules>");
  return lines.join("\n");
}

/** 单轮 prompt 前缀：有 rules 时带 Rule，否则仅 pointer +（可选）change + 清单摘要 */
export function formatTurnPrefix(opts: {
  rules?: { arch_rules: string; pm_rules?: string };
  pointer: ContextPointer;
  change?: ContextChange;
  /** PRD 且 draft_revision>0 时的紧凑清单摘要（C1） */
  draftSummary?: string;
}): string {
  const parts: string[] = [];
  if (opts.rules) {
    parts.push(formatRulesBlock(opts.rules));
  }
  parts.push(formatStatePointer(opts.pointer));
  if (opts.change) {
    parts.push(formatContextChange(opts.change));
  }
  if (opts.draftSummary?.trim()) {
    parts.push(
      `<requirement_draft_summary>\n${escapeXml(opts.draftSummary.trim())}\n</requirement_draft_summary>`,
    );
  }
  return parts.join("\n");
}

/** @deprecated 使用 formatTurnPrefix；保留兼容 */
export function formatPromptPrefixV1(
  rules: { arch_rules: string; pm_rules?: string },
  pointer: ContextPointer,
  change?: ContextChange,
): string {
  return formatTurnPrefix({ rules, pointer, change });
}

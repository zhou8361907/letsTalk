import type {
  AgentAnchor,
  ChatMode,
  RequirementDraftState,
  RequirementItem,
  TranscriptItem,
} from "@lets-talk/shared-types";
import { EXPORT_PRIMARY_APPENDIX_DIVIDER } from "@lets-talk/shared-types";
import {
  pmDisplayItems,
  pmDraftSummary,
  pmFieldLabel,
  pmFormatFieldValue,
  pmItemStatus,
  pmMissingSummary,
  pmVisibleFields,
} from "./format-requirement-draft";

export interface ExportPrdOptions {
  title: string;
  chatMode: ChatMode;
  anchor: AgentAnchor | null;
  exportedAt?: Date;
}

export interface ExportPrimaryOptions {
  title: string;
  anchor: AgentAnchor | null;
  exportedAt?: Date;
}

function formatAnchorBrief(anchor: AgentAnchor | null): string[] {
  if (!anchor) return [];
  const lines: string[] = ["", "**锚点**（检索线索，非 PM 业务正文）", ""];
  if (anchor.kind === "menu") {
    if (anchor.menuName) lines.push(`- 菜单：${anchor.menuName}`);
    if (anchor.breadcrumb?.length) lines.push(`- 路径：${anchor.breadcrumb.join(" / ")}`);
    if (anchor.routePath) lines.push(`- 路由：\`${anchor.routePath}\``);
  } else {
    lines.push(`- \`${anchor.ref}\`${anchor.label ? `（${anchor.label}）` : ""}`);
  }
  lines.push("");
  return lines;
}

/**
 * PM 定稿导出（主 · 真源）：仅业务格，不含研发附录
 */
export function buildRequirementPrimaryMarkdown(
  draft: RequirementDraftState,
  options: ExportPrimaryOptions,
): string {
  const at = (options.exportedAt ?? new Date()).toISOString();
  const items = pmDisplayItems(draft);
  const lines: string[] = [
    `# ${options.title}`,
    "",
    "> **【PM 定稿 · 真源】**",
    "> 以下业务描述经 PM 与 Agent 确认；验收与改口**以本节为准**。",
    "",
    `- 导出时间：${at}`,
    `- 摘要：${pmDraftSummary(draft)}`,
    ...formatAnchorBrief(options.anchor),
    "---",
    "",
  ];

  if (items.length === 0) {
    lines.push("（暂无条目）", "");
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const status = pmItemStatus(item);
    const visible = pmVisibleFields(item);
    const missing = pmMissingSummary(item);

    lines.push(`## 需求 ${i + 1} · ${item.title}`, "");
    lines.push(`**状态**：${status.icon} ${status.label}`, "");

    for (const f of visible) {
      const label = f.label || pmFieldLabel(String(f.key));
      lines.push("", `**${label}**`, "", pmFormatFieldValue(f));
    }

    if (missing.length > 0) {
      lines.push("", `**还缺**：${missing.join("、")}`);
    }
    lines.push("", "---", "");
  }

  if (draft.blockingQuestion?.trim()) {
    lines.push("## 待 PM 确认", "", draft.blockingQuestion.trim(), "", "---", "");
  }

  if (draft.openQuestions.length > 0) {
    lines.push("## 还不清楚的事", "");
    for (const q of draft.openQuestions) lines.push(`- ${q}`);
    lines.push("", "---", "");
  }

  return lines.join("\n").trim() + "\n";
}

export function mergePrimaryAndDevAppendix(
  primary: string,
  appendix: string,
  generatedAt?: Date,
): string {
  const ts = (generatedAt ?? new Date()).toISOString();
  return [
    primary.trim(),
    EXPORT_PRIMARY_APPENDIX_DIVIDER,
    `- 生成时间：${ts}`,
    "",
    appendix.trim(),
    "",
  ].join("\n");
}

/** @deprecated 使用 buildRequirementPrimaryMarkdown；完整含附录用 mergePrimaryAndDevAppendix */
export function buildRequirementDraftMarkdown(
  draft: RequirementDraftState,
  options: ExportPrimaryOptions,
): string {
  return buildRequirementPrimaryMarkdown(draft, options);
}

/** 将会话导出为 Markdown（优先拼接 Agent 回复；写需求模式可整份当 PRD） */
export function buildConversationMarkdown(
  items: TranscriptItem[],
  options: ExportPrdOptions,
): string {
  const at = (options.exportedAt ?? new Date()).toISOString();
  const lines: string[] = [
    `# ${options.title}`,
    "",
    `- 导出时间：${at}`,
    `- 模式：${options.chatMode === "prd" ? "需求整理" : "探索"}`,
  ];
  if (options.anchor) {
    lines.push(`- 锚点：${options.anchor.label ?? options.anchor.ref} (\`${options.anchor.ref}\`)`);
  }
  lines.push("", "---", "");

  const assistantBlocks = items.filter((i) => i.kind === "assistant");
  if (options.chatMode === "prd" && assistantBlocks.length > 0) {
    const last = assistantBlocks[assistantBlocks.length - 1]!;
    if (last.kind === "assistant") {
      lines.push(last.text.trim());
      lines.push("");
      lines.push("---", "");
      lines.push("## 对话记录附录", "");
    }
  }

  for (const item of items) {
    if (item.kind === "user") {
      lines.push(`### 用户`, "", item.text.trim(), "");
    } else if (item.kind === "assistant") {
      if (options.chatMode === "prd" && item === assistantBlocks[assistantBlocks.length - 1]) {
        continue;
      }
      lines.push(`### Agent`, "", item.text.trim(), "");
    } else if (item.kind === "tool") {
      lines.push(
        `<details><summary>工具 ${item.tool}${item.ok ? "" : " (失败)"}</summary>`,
        "",
        "```",
        item.preview.slice(0, 4000),
        "```",
        "",
        "</details>",
        "",
      );
    }
  }

  return lines.join("\n").trim() + "\n";
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

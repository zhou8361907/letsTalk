import type { AgentAnchor, ChatMode, TranscriptItem } from "@lets-talk/shared-types";

export interface ExportPrdOptions {
  title: string;
  chatMode: ChatMode;
  anchor: AgentAnchor | null;
  exportedAt?: Date;
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
    `- 模式：${options.chatMode === "prd" ? "写需求" : "探索"}`,
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

import type { AgentContext } from "./types.js";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 把 JIT 上下文格式化成模型可读的前缀块（XML 风格，特殊字符转义） */
export function formatAgentContextBlock(ctx: AgentContext): string {
  const lines: string[] = [
    `<agent_context version="${ctx.version}" mode="${ctx.mode}" chat_mode="${ctx.chat_mode}">`,
  ];

  // 以下各段顺序固定，便于模型形成稳定阅读习惯
  if (ctx.anchor) {
    const label = ctx.anchor.label ? ` label="${escapeXml(ctx.anchor.label)}"` : "";
    lines.push(
      `  <anchor kind="${ctx.anchor.kind}" ref="${escapeXml(ctx.anchor.ref)}"${label} />`,
    );
  }

  if (ctx.anchor_preview_content) {
    const previewLines = ctx.anchor_preview_content.split(/\r?\n/).length;
    lines.push(`  <anchor_preview lines="${previewLines}">`);
    lines.push(escapeXml(ctx.anchor_preview_content));
    lines.push("  </anchor_preview>");
  }

  if (ctx.arch_rules.trim()) {
    lines.push("  <arch_rules>");
    lines.push(escapeXml(ctx.arch_rules.trim()));
    lines.push("  </arch_rules>");
  }

  if (ctx.memory_directory_hint?.trim()) {
    lines.push("  <memory_directory_hint>");
    lines.push(escapeXml(ctx.memory_directory_hint.trim()));
    lines.push("  </memory_directory_hint>");
  }

  if (ctx.chat_mode === "prd" && ctx.pm_rules?.trim()) {
    lines.push("  <pm_rules>");
    lines.push(escapeXml(ctx.pm_rules.trim()));
    lines.push("  </pm_rules>");
  }

  if (ctx.requirement_draft_snapshot?.trim()) {
    lines.push("  <requirement_draft_snapshot>");
    lines.push(escapeXml(ctx.requirement_draft_snapshot.trim()));
    lines.push("  </requirement_draft_snapshot>");
  }

  if (ctx.hints_directory_hint?.trim()) {
    lines.push("  <business_hints>");
    lines.push(escapeXml(ctx.hints_directory_hint.trim()));
    lines.push("  </business_hints>");
  }

  lines.push("</agent_context>");
  return lines.join("\n");
}

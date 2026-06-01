import type { ChatMode } from "@lets-talk/shared-types";
import { MEMORY_GUIDANCE } from "./memory-guidance.js";
import { MEMORY_ARCH_RULES_SNIPPET } from "./memory-policy.js";
import { PM_MODE_RULES, trimPmRules } from "./pm-resources.js";
import {
  formatWorkspaceDirsHint,
  resolveWorkspaceLayout,
} from "./workspace-paths.js";

/**
 * 注入 Pi system prompt 的 letsTalk 业务块（跨会话稳定规则）。
 * AGENTS.md 由 Pi DefaultResourceLoader 自动载入 project_context；此处不重复全文。
 */
export function buildLetsTalkAppendSystemPrompt(chatMode: ChatMode): string {
  const layout = resolveWorkspaceLayout();
  const parts = [
    "# letsTalk 运行约束",
    formatWorkspaceDirsHint(layout),
    "## 记忆（跨会话）",
    MEMORY_GUIDANCE,
    MEMORY_ARCH_RULES_SNIPPET,
    "稳定规则全文见 project_context（AGENTS.md + Tier 1 USER/CORE）；与代码冲突以 workFront/workBack 为准。",
  ];

  if (chatMode === "prd") {
    parts.push("## 写需求模式（PM）", trimPmRules(PM_MODE_RULES));
  }

  return parts.filter(Boolean).join("\n\n");
}

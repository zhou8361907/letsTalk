import type { ChatMode } from "@lets-talk/shared-types";
import {
  resolveMemoryGuidance,
  resolvePmPrdRules,
} from "./prompt/prompt-editor.js";
import {
  formatHintsDirectoryHint,
  listBusinessHintFiles,
  readPrdTemplateOutline,
  trimPmRules,
} from "./pm-resources.js";
import {
  formatWorkspaceDirsHint,
  resolveWorkspaceLayout,
} from "./workspace-paths.js";

/**
 * 注入 Pi system prompt 的 letsTalk 业务块（跨会话稳定规则）。
 * AGENTS.md 由 Pi DefaultResourceLoader 自动载入 project_context；此处不重复全文。
 */
export async function buildLetsTalkAppendSystemPrompt(
  chatMode: ChatMode,
  workspaceRoot?: string,
): Promise<string> {
  const layout = resolveWorkspaceLayout();
  const root = workspaceRoot ?? layout.workspaceRoot;
  const memoryGuidance = await resolveMemoryGuidance(root);
  const parts = [
    "# letsTalk 运行约束",
    formatWorkspaceDirsHint(layout),
    memoryGuidance,
    "项目级编码与读码规则见 project_context（AGENTS.md + Tier1 USER/CORE）；与代码冲突以 workFront/workBack 为准。",
  ];

  if (chatMode === "prd") {
    const pmRules = await resolvePmPrdRules(root);
    parts.push("## 写需求模式（PM）", trimPmRules(pmRules));
    const template = await readPrdTemplateOutline(root);
    parts.push("## PRD 文档模板（用户要求导出/定稿时）", template);
    const hintFiles = await listBusinessHintFiles(root);
    if (hintFiles.length > 0) {
      parts.push(
        "## 业务 hints（仅供参考，用时 read）",
        formatHintsDirectoryHint(hintFiles),
      );
    }
  }

  return parts.filter(Boolean).join("\n\n");
}

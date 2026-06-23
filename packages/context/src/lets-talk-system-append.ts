import type { ChatMode } from "@lets-talk/shared-types";
import {
  buildSkillsSystemBlock,
  ensureSkillsReady,
  getSkillIndex,
  isSkillsEnabled,
  SKILLS_INDEX_HEADER,
} from "@lets-talk/skills";
import {
  resolveMemoryGuidance,
  resolvePmPrdRules,
  resolveSkillsGuidance,
} from "./prompt/prompt-editor.js";
import { QA_TESTING_RULES } from "./prompt/qa-testing.js";
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
  productLine?: string,
): Promise<string> {
  const layout = resolveWorkspaceLayout(productLine as any);
  const root = workspaceRoot ?? layout.workspaceRoot;
  const memoryGuidance = await resolveMemoryGuidance(root);
  const plLabel = layout.productLine === "shebao" ? "社保" : "医保";
  const parts = [
    "# letsTalk 运行约束",
    `当前产品线: ${plLabel}`,
    formatWorkspaceDirsHint(layout),
    memoryGuidance,
    "项目级编码与读码规则见 project_context（AGENTS.md + Tier1 USER/CORE）；与代码冲突以 workFront/workBack 为准。",
  ];

  if (chatMode === "prd") {
    const pmRules = await resolvePmPrdRules(root);
    parts.push("## 写需求模式（PM）", trimPmRules(pmRules));
    const template = await readPrdTemplateOutline(root);
    parts.push("## PRD 文档模板（用户要求导出/定稿时）", template);
    const hintsDirRel = layout.productLine === "shebao" ? ".agent/hints/shebao" : ".agent/hints/yibao";
    const hintFiles = await listBusinessHintFiles(root, layout.productLine);
    if (hintFiles.length > 0) {
      parts.push(
        "## 业务 hints（仅供参考，用时 read）",
        formatHintsDirectoryHint(hintFiles, hintsDirRel),
      );
    }
  }

  if (chatMode === "qa") {
    parts.push("## 测试辅助模式（QA）", QA_TESTING_RULES);
  }

  if (isSkillsEnabled()) {
    await ensureSkillsReady(root);
    const skillsGuidance = await resolveSkillsGuidance(root);
    const skills = await getSkillIndex(root);
    const indexBlock = buildSkillsSystemBlock(skills);
    parts.push(skillsGuidance);
    if (indexBlock.trim()) {
      parts.push(SKILLS_INDEX_HEADER, indexBlock);
    }
  }

  return parts.filter(Boolean).join("\n\n");
}

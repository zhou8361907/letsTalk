/**
 * Pi DefaultResourceLoader：Tier 1 USER/CORE → project_context 前部；letsTalk 规则 → appendSystemPrompt
 */

import { join, resolve } from "node:path";
import {
  DefaultResourceLoader,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ResourceLoader } from "@earendil-works/pi-coding-agent";
import {
  buildLetsTalkAppendSystemPrompt,
  resolveSelfImprovementReviewPrompt,
} from "@lets-talk/context";
import { isSkillsEnabled } from "@lets-talk/skills";
import {
  formatCoreMemorySystemBlock,
  loadCoreMemorySnapshot,
  TIER1_VIRTUAL_REL,
} from "@lets-talk/memory";
import type { ChatMode } from "@lets-talk/shared-types";

export async function createLetsTalkResourceLoader(
  workspaceRoot: string,
  chatMode: ChatMode,
): Promise<ResourceLoader> {
  const workspace = resolve(workspaceRoot);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(workspace, agentDir);
  const coreSnapshot = await loadCoreMemorySnapshot(workspace);
  const tier1Block = formatCoreMemorySystemBlock(coreSnapshot);
  const append = await buildLetsTalkAppendSystemPrompt(chatMode, workspace);

  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    settingsManager,
    appendSystemPrompt: [append],
    agentsFilesOverride: (base) => {
      if (!tier1Block.trim()) {
        return base;
      }
      const tier1File = {
        path: join(workspace, TIER1_VIRTUAL_REL),
        content: tier1Block,
      };
      return { agentsFiles: [tier1File, ...base.agentsFiles] };
    },
  });
  await loader.reload();
  return loader;
}

const EXPORT_APPENDIX_SYSTEM_APPEND = `# 研发附录（导出任务）

你是研发线索整理助手。用 grep/read 适度查代码，输出 Markdown 三节：前端可能涉及、后端可能涉及、联调与注意。
- 路径/接口写「可能」；读不到就写「需在仓库内进一步定位」
- 不要改写 PM 定稿；不要 JSON；尽量简洁`;

const TITLE_SUMMARY_SYSTEM_APPEND = `# 标题摘要（单次任务）

根据用户给出的需求清单，输出一句中文侧栏标题（≤28字）。
只输出标题一行，不要引号、不要前缀、不要解释。`;

/** 研发附录导出：无 AGENTS/Tier1，短 append + 只读工具 */
export async function createExportAppendixResourceLoader(
  workspaceRoot: string,
): Promise<ResourceLoader> {
  const workspace = resolve(workspaceRoot);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(workspace, agentDir);
  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    settingsManager,
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPrompt: [EXPORT_APPENDIX_SYSTEM_APPEND],
  });
  await loader.reload();
  return loader;
}

/** 侧栏标题摘要：无工具 */
export async function createTitleSummaryResourceLoader(
  workspaceRoot: string,
): Promise<ResourceLoader> {
  const workspace = resolve(workspaceRoot);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(workspace, agentDir);
  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    settingsManager,
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPrompt: [TITLE_SUMMARY_SYSTEM_APPEND],
  });
  await loader.reload();
  return loader;
}

/** 后台 self-improvement review：memory +（可选）skill_manage */
export async function createSelfImprovementReviewResourceLoader(
  workspaceRoot: string,
): Promise<ResourceLoader> {
  const workspace = resolve(workspaceRoot);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(workspace, agentDir);
  const skillsOn = isSkillsEnabled();
  const reviewPrompt = await resolveSelfImprovementReviewPrompt(
    workspace,
    skillsOn,
  );
  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    settingsManager,
    noContextFiles: true,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPrompt: [reviewPrompt],
  });
  await loader.reload();
  return loader;
}

/** @deprecated 使用 createSelfImprovementReviewResourceLoader */
export const createMemoryReviewResourceLoader =
  createSelfImprovementReviewResourceLoader;

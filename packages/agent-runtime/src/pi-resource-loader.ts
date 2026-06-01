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
import { buildLetsTalkAppendSystemPrompt } from "@lets-talk/context";
import {
  formatCoreMemorySystemBlock,
  loadCoreMemorySnapshot,
  TIER1_VIRTUAL_REL,
} from "@lets-talk/memory";
import type { ChatMode } from "@lets-talk/shared-types";

const MEMORY_REVIEW_SYSTEM_APPEND = `# 记忆回顾（后台任务）

你仅判断是否将**跨会话**事实写入 **memory** 工具。
- 称呼/偏好 → \`memory\` action=add, target=user, content=...
- 惯例/踩坑 → \`memory\` action=add, target=core, content=...
无值得保存时只回复「无需保存。」
禁止：grep/read/save_memory/写 topics 或 INDEX；禁止任务进度、PR、本单需求。`;

export async function createLetsTalkResourceLoader(
  workspaceRoot: string,
  chatMode: ChatMode,
): Promise<ResourceLoader> {
  const workspace = resolve(workspaceRoot);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(workspace, agentDir);
  const coreSnapshot = await loadCoreMemorySnapshot(workspace);
  const tier1Block = formatCoreMemorySystemBlock(coreSnapshot);
  const append = buildLetsTalkAppendSystemPrompt(chatMode);

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

/** 后台 memory review：无 AGENTS/Tier1，仅极简 append + memory 工具 */
export async function createMemoryReviewResourceLoader(
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
    appendSystemPrompt: [MEMORY_REVIEW_SYSTEM_APPEND],
  });
  await loader.reload();
  return loader;
}

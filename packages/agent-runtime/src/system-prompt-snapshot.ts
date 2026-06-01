/**
 * 从 Pi ResourceLoader 捕获 system prompt 调试快照
 */

import { relative, resolve } from "node:path";
import type { ResourceLoader } from "@earendil-works/pi-coding-agent";
import type { ChatMode, SystemPromptSnapshot } from "@lets-talk/shared-types";
import { createLetsTalkResourceLoader } from "./pi-resource-loader.js";

export function formatCombinedSystemPrompt(parts: {
  agentsFiles: Array<{ path: string; content: string }>;
  baseSystem?: string;
  appendBlocks: string[];
}): string {
  const sections: string[] = [];
  for (const f of parts.agentsFiles) {
    if (!f.content.trim()) continue;
    sections.push(`### project_context: ${f.path}\n\n${f.content.trim()}`);
  }
  if (parts.baseSystem?.trim()) {
    sections.push(`### system\n\n${parts.baseSystem.trim()}`);
  }
  parts.appendBlocks.forEach((block, i) => {
    if (!block.trim()) return;
    sections.push(`### append_system_${i + 1}\n\n${block.trim()}`);
  });
  return sections.join("\n\n---\n\n");
}

export function captureSystemPromptFromLoader(
  loader: ResourceLoader,
  input: {
    workspaceRoot: string;
    chatMode: ChatMode;
    modelLabel?: string;
    activeTools?: string[];
    sourceNote?: string;
  },
): SystemPromptSnapshot {
  const root = resolve(input.workspaceRoot);
  const { agentsFiles } = loader.getAgentsFiles();
  const relFiles = agentsFiles.map((f) => ({
    path: relative(root, resolve(f.path)).replace(/\\/g, "/"),
    content: f.content,
  }));
  const baseSystem = loader.getSystemPrompt();
  const appendBlocks = loader.getAppendSystemPrompt().filter((s) => s?.trim());
  const combined = formatCombinedSystemPrompt({
    agentsFiles: relFiles,
    baseSystem,
    appendBlocks,
  });

  return {
    capturedAt: new Date().toISOString(),
    chatMode: input.chatMode,
    modelLabel: input.modelLabel,
    activeTools: input.activeTools,
    agentsFiles: relFiles,
    baseSystem: baseSystem?.trim() || undefined,
    appendBlocks,
    combined,
    sourceNote: input.sourceNote,
  };
}

/** 按当前工作区与模式重建（历史会话无落盘时使用） */
export async function resolveSystemPromptSnapshot(
  workspaceRoot: string,
  chatMode: ChatMode,
  opts?: {
    modelLabel?: string;
    activeTools?: string[];
    sourceNote?: string;
  },
): Promise<SystemPromptSnapshot> {
  const loader = await createLetsTalkResourceLoader(workspaceRoot, chatMode);
  return captureSystemPromptFromLoader(loader, {
    workspaceRoot,
    chatMode,
    modelLabel: opts?.modelLabel,
    activeTools: opts?.activeTools,
    sourceNote:
      opts?.sourceNote ??
      "按当前 WORKSPACE 与 chatMode 重建，若期间改过 USER/CORE 或 AGENTS.md，可能与当时不完全一致",
  });
}

/**
 * Agent 写文件策略：允许 WORKSPACE_ROOT 下 .agent/（会话/调试等系统目录除外）
 * workFront / workBack 仍只读。
 */

import { resolve, relative, sep } from "node:path";

/** 禁止 Agent 直接写的 .agent 子目录（由应用维护） */
const BLOCKED_UNDER_AGENT = [
  ".agent/conversations",
  ".agent/debug",
  ".agent/menu-map",
  ".agent/skills",
] as const;

/** 记忆工具默认开启；设 LETS_TALK_MEMORY_TOOLS=0 关闭 */
export function isMemoryToolsEnabled(): boolean {
  const v = process.env.LETS_TALK_MEMORY_TOOLS?.trim();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

/** write/edit 默认开启；设 LETS_TALK_AGENT_WRITE=0 关闭 */
export function isScopedWriteEnabled(): boolean {
  const v = process.env.LETS_TALK_AGENT_WRITE?.trim();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

export function formatWritablePathsHint(): string {
  return ".agent/（除 conversations、debug、menu-map、skills；skills 用 skill_manage）";
}

export function assertWritableAgentPath(
  workspaceRoot: string,
  absolutePath: string,
): void {
  const root = resolve(workspaceRoot);
  const abs = resolve(absolutePath);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error("路径超出 WORKSPACE_ROOT，已拒绝写入");
  }

  const rel = relative(root, abs).replace(/\\/g, "/");
  if (!rel.startsWith(".agent/")) {
    throw new Error(
      `禁止写入 ${rel || "(根)"}。仅允许 ${formatWritablePathsHint()}；workFront/workBack 只读。`,
    );
  }

  for (const blocked of BLOCKED_UNDER_AGENT) {
    if (rel === blocked || rel.startsWith(`${blocked}/`)) {
      throw new Error(`禁止写入 ${rel}（由系统管理）`);
    }
  }
}

export function assertWritableAgentDir(
  workspaceRoot: string,
  absoluteDir: string,
): void {
  assertWritableAgentPath(workspaceRoot, resolve(absoluteDir, ".keep"));
}

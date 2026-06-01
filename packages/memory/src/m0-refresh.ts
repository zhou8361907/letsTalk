import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  formatCoreMemorySystemBlock,
  loadCoreMemorySnapshot,
  type CoreMemorySnapshot,
} from "./core-store.js";
import { memoryDir } from "./paths.js";

/** Pi project_context 虚拟 Tier 1 文件路径（展示用） */
export const TIER1_VIRTUAL_REL = ".agent/memory/_tier1.md";

export interface M0FileMtimes {
  userMtimeMs: number;
  coreMtimeMs: number;
}

/** 读取 USER/CORE 的 mtime；不存在则为 0 */
export async function getM0FileMtimes(
  workspaceRoot: string,
): Promise<M0FileMtimes> {
  const dir = memoryDir(workspaceRoot);
  const readMtime = async (name: string): Promise<number> => {
    try {
      const st = await stat(join(dir, name));
      return st.mtimeMs;
    } catch {
      return 0;
    }
  };
  return {
    userMtimeMs: await readMtime("USER.md"),
    coreMtimeMs: await readMtime("CORE.md"),
  };
}

/** 任一侧 M0 文件比会话创建时间新 → 需前缀刷新 */
export function shouldRefreshM0InPrefix(
  mtimes: M0FileMtimes,
  sessionCreatedAtMs: number,
): boolean {
  const latest = Math.max(mtimes.userMtimeMs, mtimes.coreMtimeMs);
  return latest > sessionCreatedAtMs;
}

/** 每轮 user 前缀：本会话内 M0 磁盘更新（覆盖冻结 Tier 1） */
export function formatCoreMemoryPrefixRefresh(
  snapshot: CoreMemorySnapshot,
): string {
  const body = formatCoreMemorySystemBlock(snapshot, {
    footerNote:
      "【覆盖规则】本块为最新 USER/CORE。请忽略 system prompt 里会话开始时冻结的旧 Tier 1；称呼、偏好、惯例以本块为准。",
  });
  if (!body.trim()) return "";
  return [
    '<core_memory_refresh priority="override" supersedes="system_tier1">',
    "【必读】以下 USER/CORE 已在本会话内更新，覆盖 system prompt 中的旧快照。回答涉及用户称呼/偏好/惯例时只认本块。",
    "",
    body,
    "</core_memory_refresh>",
  ].join("\n");
}

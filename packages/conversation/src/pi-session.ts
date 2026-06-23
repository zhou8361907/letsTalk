import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve, normalize } from "node:path";

/**
 * Pi Agent 上下文落盘目录（相对 WORKSPACE_ROOT）。
 * 与 letsTalk 会话 JSON 分离：UI 历史在 conversations/*.json，Pi 原生 turns 在 pi/*.jsonl。
 */
export const PI_SESSIONS_SUBDIR = ".agent/conversations/pi";

function safeSessionId(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safe || safe !== sessionId) {
    throw new Error("sessionId 格式无效");
  }
  return safe;
}

/** 相对 WORKSPACE_ROOT 的 Pi session 路径 */
export function relativePiSessionFile(sessionId: string): string {
  return `${PI_SESSIONS_SUBDIR}/${safeSessionId(sessionId)}.jsonl`;
}

export function piSessionsDir(workspaceRoot: string): string {
  const root = normalize(resolve(workspaceRoot));
  return join(root, PI_SESSIONS_SUBDIR);
}

/** 绝对路径：该 letsTalk 会话对应的 Pi jsonl */
export function piSessionFilePath(workspaceRoot: string, sessionId: string): string {
  return join(piSessionsDir(workspaceRoot), `${safeSessionId(sessionId)}.jsonl`);
}

/** 解析已存路径或回退到默认路径 */
export function resolvePiSessionFile(
  workspaceRoot: string,
  sessionId: string,
  stored?: string | null,
): string {
  const root = normalize(resolve(workspaceRoot));
  if (stored?.trim()) {
    const p = stored.trim();
    return isAbsolute(p) ? p : join(root, p);
  }
  return piSessionFilePath(root, sessionId);
}

export function toWorkspaceRelativePath(
  workspaceRoot: string,
  absolutePath: string,
): string {
  const root = resolve(workspaceRoot);
  const abs = resolve(absolutePath);
  if (abs.startsWith(root + "/") || abs === root) {
    return abs.slice(root.length + 1);
  }
  return abs;
}

export async function ensurePiSessionsDir(workspaceRoot: string): Promise<void> {
  await mkdir(piSessionsDir(workspaceRoot), { recursive: true });
}

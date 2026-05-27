import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ContextUsageSnapshot } from "@lets-talk/shared-types";
import { resolveWorkspaceLayout } from "@lets-talk/context";
import {
  getConversation,
  resolvePiSessionFile,
} from "@lets-talk/conversation";
import { createPiSession } from "./create-session.js";

function workspaceRoot(): string {
  if (!process.env.WORKSPACE_ROOT?.trim()) {
    throw new Error(
      "请在 .env 配置 WORKSPACE_ROOT（letsTalk 仓库根的绝对路径）",
    );
  }
  return resolveWorkspaceLayout().workspaceRoot;
}

/** 从 Pi AgentSession 读取当前上下文 token 估算 */
export function snapshotContextUsage(
  session: AgentSession,
): ContextUsageSnapshot | null {
  const usage = session.getContextUsage();
  if (!usage) return null;
  return {
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent,
  };
}

function emitSnapshot(
  session: AgentSession,
  onEvent?: (snap: ContextUsageSnapshot) => void,
): ContextUsageSnapshot | null {
  const snap = snapshotContextUsage(session);
  if (snap && onEvent) onEvent(snap);
  return snap;
}

/** 流式对话中推送上下文占用 */
export function emitContextUsage(
  session: AgentSession,
  onEvent: (snap: ContextUsageSnapshot) => void,
): void {
  emitSnapshot(session, onEvent);
}

/**
 * 按 sessionId 查询上下文占用（会话切换时调用）。
 * 若内存中已有 Pi 会话则直接读；否则短暂 open jsonl 后释放。
 */
export async function getContextUsageForSession(
  sessionId: string,
  sessions: Map<string, { session: AgentSession; dispose: () => void }>,
): Promise<ContextUsageSnapshot | null> {
  const cwd = workspaceRoot();

  const cached = sessions.get(sessionId);
  if (cached) {
    return snapshotContextUsage(cached.session);
  }

  const record = await getConversation(cwd, sessionId);
  if (!record) return null;

  const piSessionFile = resolvePiSessionFile(
    cwd,
    sessionId,
    record.piSessionFile,
  );
  const handle = await createPiSession(cwd, true, { piSessionFile });
  try {
    return snapshotContextUsage(handle.session);
  } finally {
    handle.dispose();
  }
}

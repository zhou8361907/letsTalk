/**
 * 跑一轮对话，并把 Pi 事件转成 SSE 推给浏览器
 *
 * 流程：
 *   浏览器 POST → 本文件 runChat() → session.prompt(用户话)
 *   → Pi 内部循环（模型想调工具就调工具）→ subscribe 回调 → SSE
 */

import {
  buildAgentContext,
  formatAgentContextBlock,
  resolveWorkspaceLayout,
} from "@lets-talk/context";
import {
  bindPiSessionFile,
  getConversation,
  resolvePiSessionFile,
} from "@lets-talk/conversation";
import type { AgentAnchor, ChatMode, SseEvent } from "@lets-talk/shared-types";
import { emitContextUsage, getContextUsageForSession } from "./context-usage.js";
import { createPiSession, type PiSessionHandle } from "./create-session.js";

// 内存里记住「每个 sessionId 对应一个 Pi 会话」；HMR 后 Map 丢失，靠 pi jsonl 恢复
const sessions = new Map<string, PiSessionHandle>();

async function getOrCreatePiHandle(
  sessionId: string,
  cwd: string,
  useTools: boolean,
): Promise<PiSessionHandle> {
  let handle = sessions.get(sessionId);
  if (handle && handle.cwd === cwd) {
    return handle;
  }

  handle?.dispose();

  const record = await getConversation(cwd, sessionId);
  const piSessionFile = resolvePiSessionFile(
    cwd,
    sessionId,
    record?.piSessionFile,
  );

  handle = await createPiSession(cwd, useTools, { piSessionFile });
  sessions.set(sessionId, handle);
  return handle;
}

/** 读取工作区布局（WORKSPACE_ROOT = letsTalk 运行根） */
export function getWorkspaceLayout() {
  const layout = resolveWorkspaceLayout();
  if (!process.env.WORKSPACE_ROOT?.trim()) {
    throw new Error(
      "请在 .env 配置 WORKSPACE_ROOT（letsTalk 仓库根的绝对路径）",
    );
  }
  return layout;
}

/** @deprecated 使用 getWorkspaceLayout；保留兼容 */
export function getWorkspaceRoot(): string {
  return getWorkspaceLayout().workspaceRoot;
}

/** 把 Pi 内部事件转成前端能消费的 SSE 格式 */
function piEventToSse(event: unknown): SseEvent | null {
  const e = event as Record<string, unknown>;

  // 流式文字
  if (e.type === "message_update") {
    const inner = e.assistantMessageEvent as { type?: string; delta?: string };
    if (inner?.type === "text_delta" && inner.delta) {
      return { type: "assistant_delta", text: inner.delta };
    }
    return null;
  }

  // 工具开始
  if (e.type === "tool_execution_start") {
    return {
      type: "tool_start",
      callId: String(e.toolCallId ?? ""),
      tool: String(e.toolName ?? "?"),
    };
  }

  // 工具结束
  if (e.type === "tool_execution_end") {
    let preview = "";
    const result = e.result as { content?: Array<{ text?: string }> } | undefined;
    if (result?.content) {
      preview = result.content.map((c) => c.text ?? "").join("\n");
    }
    return {
      type: "tool_output",
      callId: String(e.toolCallId ?? ""),
      ok: e.isError !== true,
      preview: preview.slice(0, 2000),
      durationMs: 0,
    };
  }

  // 本轮结束
  if (e.type === "agent_end") {
    return { type: "turn_end" };
  }

  return null;
}

/**
 * 执行一轮用户提问
 * @param onEvent 每有一条 SSE 事件就调用（发给浏览器）
 */
export async function runChat(options: {
  sessionId: string;
  message: string;
  useTools?: boolean;
  /** 阶段 2：选中锚点时 JIT 注入文件头；null = 全库探索 */
  anchor?: AgentAnchor | null;
  chatMode?: ChatMode;
  onEvent: (event: SseEvent) => void;
}): Promise<void> {
  const layout = getWorkspaceLayout();
  const cwd = layout.workspaceRoot;
  const useTools = options.useTools ?? true;

  // 1. 取或建 Pi 会话（Map miss 时从 .agent/conversations/pi/*.jsonl 恢复）
  const handle = await getOrCreatePiHandle(options.sessionId, cwd, useTools);
  const { session, modelLabel } = handle;

  // 2. 告诉前端：连上了、用的哪个模型
  options.onEvent({
    type: "session",
    sessionId: options.sessionId,
    cwd,
    model: modelLabel,
  });

  emitContextUsage(session, (snap) => {
    options.onEvent({ type: "context_usage", ...snap });
  });

  // 3. 监听 Pi 事件 → 转发 SSE
  const unsub = session.subscribe((piEvent: unknown) => {
    const sse = piEventToSse(piEvent);
    if (sse) options.onEvent(sse);
  });

  try {
    // 4. JIT 上下文前缀 + 用户话（每轮刷新，不写进 Pi 长期 history 的重复块由 Pi 管理）
    const ctx = await buildAgentContext({
      layout,
      anchor: options.anchor ?? null,
      chatMode: options.chatMode ?? "explore",
    });
    const previewLines = ctx.anchor_preview_content
      ? ctx.anchor_preview_content.split("\n").length
      : 0;
    options.onEvent({
      type: "context",
      mode: ctx.mode,
      anchorRef: ctx.anchor?.ref ?? null,
      previewLines,
    });

    const prefix = formatAgentContextBlock(ctx);
    const userText = prefix.trim()
      ? `${prefix}\n\n${options.message}`
      : options.message;

    await session.prompt(userText);
    emitContextUsage(session, (snap) => {
      options.onEvent({ type: "context_usage", ...snap });
    });
    options.onEvent({ type: "turn_end" });
  } finally {
    unsub();
    const piFile = session.sessionFile ?? handle.piSessionFile;
    if (piFile) {
      await bindPiSessionFile(cwd, options.sessionId, piFile);
    }
  }
}

/** 供 REST 查询：优先用内存中的 Pi 会话 */
export function queryContextUsage(sessionId: string) {
  return getContextUsageForSession(sessionId, sessions);
}

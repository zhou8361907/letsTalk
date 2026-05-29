/**
 * 跑一轮对话，并把 Pi 事件转成 SSE 推给浏览器
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
  saveConversation,
} from "@lets-talk/conversation";
import type {
  AgentAnchor,
  ChatMode,
  RequirementDraftState,
  SseEvent,
} from "@lets-talk/shared-types";
import {
  emitContextUsage,
  getContextUsageForSession,
  snapshotContextUsage,
} from "./context-usage.js";
import {
  logTurnRequest,
  logTurnResponse,
  nextTurnId,
  setActiveTurnId,
  type DebugToolRecord,
} from "./debug-logger.js";
import { createPiSession, type PiSessionHandle } from "./create-session.js";
import {
  buildAgentActions,
  emptyDraft,
  ensureDraft,
  getDraft,
  setDraft,
} from "./requirement-draft-store.js";
import { setDraftListener } from "./requirement-draft-runtime.js";

/** 进程内 Pi 会话缓存：sessionId → handle（Next dev HMR 后仍靠 jsonl 恢复） */
const sessions = new Map<string, PiSessionHandle>();
/** 每会话当前锚点 ref，供 createRequirementDraftTools 的 getAnchorRef 读取 */
const liveAnchorRefs = new Map<string, string | null>();

function anchorRefFrom(anchor: AgentAnchor | null | undefined): string | null {
  return anchor?.ref?.trim() || null;
}

function emitDraftEvents(
  draft: RequirementDraftState,
  onEvent: (event: SseEvent) => void,
): void {
  onEvent({ type: "requirement_state", draft });
  onEvent({ type: "agent_actions", actions: buildAgentActions(draft) });
}

async function persistDraft(
  cwd: string,
  sessionId: string,
  draft: RequirementDraftState,
): Promise<void> {
  const record = await getConversation(cwd, sessionId);
  if (!record) return;
  await saveConversation(cwd, {
    sessionId,
    items: record.items,
    anchor: record.anchor,
    title: record.title,
    requirementDraft: draft,
  });
}

/**
 * 获取或创建 Pi 句柄。
 * cwd 变化时 dispose 旧句柄；从 conversation JSON 恢复 piSessionFile 与 requirementDraft。
 */
async function getOrCreatePiHandle(
  sessionId: string,
  cwd: string,
  useTools: boolean,
  anchorRef: string | null,
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

  if (record?.requirementDraft) {
    setDraft(sessionId, record.requirementDraft);
  } else {
    ensureDraft(sessionId, anchorRef);
  }

  handle = await createPiSession(cwd, useTools, {
    piSessionFile,
    sessionId,
    getAnchorRef: () => liveAnchorRefs.get(sessionId) ?? null,
  });
  sessions.set(sessionId, handle);
  return handle;
}

export function getWorkspaceLayout() {
  const layout = resolveWorkspaceLayout();
  if (!process.env.WORKSPACE_ROOT?.trim()) {
    throw new Error(
      "请在 .env 配置 WORKSPACE_ROOT（letsTalk 仓库根的绝对路径）",
    );
  }
  return layout;
}

/** @deprecated 使用 getWorkspaceLayout */
export function getWorkspaceRoot(): string {
  return getWorkspaceLayout().workspaceRoot;
}

/** 将 Pi 原生事件转为前端消费的 SseEvent；未映射的类型返回 null */
function piEventToSse(event: unknown): SseEvent | null {
  const e = event as Record<string, unknown>;

  if (e.type === "message_update") {
    const inner = e.assistantMessageEvent as { type?: string; delta?: string };
    if (inner?.type === "text_delta" && inner.delta) {
      return { type: "assistant_delta", text: inner.delta };
    }
    return null;
  }

  if (e.type === "tool_execution_start") {
    return {
      type: "tool_start",
      callId: String(e.toolCallId ?? ""),
      tool: String(e.toolName ?? "?"),
    };
  }

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

  return null;
}

/** runChat 的入参；onEvent 由 API route 写入 SSE */
export interface RunChatOptions {
  sessionId: string;
  message: string;
  useTools?: boolean;
  anchor?: AgentAnchor | null;
  chatMode?: ChatMode;
  onEvent: (event: SseEvent) => void;
}

/**
 * 执行一轮 Agent 对话的主入口。
 *
 * 流程：恢复 Pi → 订阅事件 → buildAgentContext → session.prompt → turn_end
 * PRD 模式下工具更新草稿会通过 onEvent 推送 requirement_state。
 */
export async function runChat(options: RunChatOptions): Promise<void> {
  const layout = getWorkspaceLayout();
  const cwd = layout.workspaceRoot;
  const useTools = options.useTools ?? true;
  const anchorRef = anchorRefFrom(options.anchor);

  const onDraftUpdated = (draft: RequirementDraftState) => {
    emitDraftEvents(draft, options.onEvent);
    void persistDraft(cwd, options.sessionId, draft);
  };

  setDraftListener(options.sessionId, onDraftUpdated);
  liveAnchorRefs.set(options.sessionId, anchorRef);

  const handle = await getOrCreatePiHandle(
    options.sessionId,
    cwd,
    useTools,
    anchorRef,
  );
  const { session, modelLabel } = handle;

  ensureDraft(options.sessionId, anchorRef);
  const initialDraft = getDraft(options.sessionId) ?? emptyDraft(anchorRef);
  if (options.chatMode === "prd") {
    emitDraftEvents(initialDraft, options.onEvent);
  }

  options.onEvent({
    type: "session",
    sessionId: options.sessionId,
    cwd,
    model: modelLabel,
  });

  emitContextUsage(session, (snap) => {
    options.onEvent({ type: "context_usage", ...snap });
  });

  const turnId = nextTurnId(options.sessionId);
  setActiveTurnId(options.sessionId, turnId);
  const debugTools: DebugToolRecord[] = [];
  let debugAssistant = "";

  const unsub = session.subscribe((piEvent: unknown) => {
    const e = piEvent as Record<string, unknown>;
    if (e.type === "message_update") {
      const inner = e.assistantMessageEvent as { type?: string; delta?: string };
      if (inner?.type === "text_delta" && inner.delta) {
        debugAssistant += inner.delta;
      }
    }
    if (e.type === "tool_execution_start") {
      debugTools.push({
        tool: String(e.toolName ?? "?"),
        callId: String(e.toolCallId ?? ""),
        preview: "(执行中…)",
      });
    }
    if (e.type === "tool_execution_end") {
      const callId = String(e.toolCallId ?? "");
      const toolName = String(e.toolName ?? "?");
      let preview = "";
      const result = e.result as { content?: Array<{ text?: string }> } | undefined;
      if (result?.content) {
        preview = result.content.map((c) => c.text ?? "").join("\n");
      }
      const idx = debugTools.findIndex(
        (t) => t.callId === callId && t.tool === toolName,
      );
      const rec: DebugToolRecord = {
        tool: toolName,
        callId,
        ok: e.isError !== true,
        preview: preview.slice(0, 8000),
      };
      if (idx >= 0) debugTools[idx] = rec;
      else debugTools.push(rec);
    }

    const sse = piEventToSse(piEvent);
    if (sse) options.onEvent(sse);
  });

  try {
    const ctx = await buildAgentContext({
      layout,
      anchor: options.anchor ?? null,
      chatMode: options.chatMode ?? "explore",
      requirementDraft:
        options.chatMode === "prd"
          ? (getDraft(options.sessionId) ?? initialDraft)
          : null,
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

    // JIT 上下文拼在用户消息前；Pi 仍把整段当 user turn 写入 jsonl
    const prefix = formatAgentContextBlock(ctx);
    const userText = prefix.trim()
      ? `${prefix}\n\n${options.message}`
      : options.message;

    const draftForLog =
      options.chatMode === "prd"
        ? (getDraft(options.sessionId) ?? initialDraft)
        : null;

    await logTurnRequest(cwd, options.sessionId, turnId, {
      chatMode: options.chatMode ?? "explore",
      anchor: options.anchor ?? null,
      userMessage: options.message,
      contextBlock: prefix,
      requirementDraft: draftForLog,
    });

    await session.prompt(userText);
    emitContextUsage(session, (snap) => {
      options.onEvent({ type: "context_usage", ...snap });
    });
    options.onEvent({ type: "turn_end" });

    const usageSnap = snapshotContextUsage(session);
    await logTurnResponse(cwd, options.sessionId, turnId, {
      assistantText: debugAssistant,
      tools: debugTools,
      contextUsage: usageSnap,
      requirementDraftAfter:
        options.chatMode === "prd"
          ? (getDraft(options.sessionId) ?? null)
          : null,
    });
  } catch (err) {
    const usageSnap = snapshotContextUsage(session);
    await logTurnResponse(cwd, options.sessionId, turnId, {
      assistantText: debugAssistant,
      tools: debugTools,
      contextUsage: usageSnap,
      requirementDraftAfter:
        options.chatMode === "prd"
          ? (getDraft(options.sessionId) ?? null)
          : null,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    unsub();
    setDraftListener(options.sessionId, null);
    // 首轮 prompt 后 Pi 可能生成新 jsonl 路径，写回 conversation JSON 供下次 open
    const piFile = session.sessionFile ?? handle.piSessionFile;
    if (piFile) {
      await bindPiSessionFile(cwd, options.sessionId, piFile);
    }
  }
}

export function queryContextUsage(sessionId: string) {
  return getContextUsageForSession(sessionId, sessions);
}

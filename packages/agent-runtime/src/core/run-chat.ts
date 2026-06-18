/**
 * 跑一轮对话，并把 Pi 事件转成 SSE 推给浏览器。
 *
 * 调用链（从外到内）：
 *   route.ts POST
 *     → runChat({ onEvent })          ← 本文件
 *       → getOrCreatePiHandle         ← 复用/恢复 Pi AgentSession
 *         → createPiSession           ← create-session.ts
 *       → buildTurnPromptPrefix       ← 每轮仅 pointer / memory / 清单摘要
 *       → session.prompt(userText)    ← Pi SDK：调 LLM + 执行 grep/read 等工具
 *       → session.subscribe           ← Pi 流式事件 → onEvent → SSE
 *
 * 持久化分工：
 *   - Pi 多轮记忆：.agent/conversations/pi/{sessionId}.jsonl（bindPiSessionFile）
 *   - UI Transcript：.agent/conversations/{sessionId}.json（由前端 PUT，本文件只写 requirementDraft）
 */

import {
  invalidateSkillsIndexCache,
  isSkillsEnabled,
} from "@lets-talk/skills";
import { resolveWorkspaceLayout } from "@lets-talk/context";
import {
  bindPiSessionFile,
  getConversation,
  resolvePiSessionFile,
  saveConversation,
} from "@lets-talk/conversation";
import type {
  AgentAnchor,
  ChatMode,
  ChatStreamRequest,
  RequirementDraftState,
  SseEvent,
} from "@lets-talk/shared-types";
import {
  getContextUsageForSession,
  pushContextUsageEvents,
  snapshotContextUsage,
} from "../context-usage.js";
import { maybeCompactSessionIfNeeded } from "@lets-talk/infrastructure/session";
import {
  logTurnRequest,
  logTurnResponse,
  nextTurnId,
  setActiveTurnId,
  type DebugToolRecord,
} from "@lets-talk/infrastructure/debug";
import { createPiSession, type PiSessionHandle } from "./create-session.js";
import { TraceRecorder } from "../trace-recorder.js";
import { toolRecordsFromSteps } from "../trace-tool-records.js";
import {
  buildAgentActions,
  emptyDraft,
  ensureDraft,
  getDraft,
  getDraftRevision,
  initDraftRevision,
  setDraft,
  clearDraftRevision,
  type DraftItemInput,
  type ApplyDraftInput,
} from "@lets-talk/domain/requirement";
import { setDraftListener } from "@lets-talk/domain/requirement";
import {
  clearSelfImprovementReviewState,
  markSelfImprovementWrittenThisTurn,
  maybeSpawnSelfImprovementReview,
  noteUserTurnForSelfImprovementReview,
} from "../background-memory-review.js";
import {
  clearSessionContext,
} from "@lets-talk/infrastructure/session";
import { buildTurnPromptPrefix } from "../turn-prefix.js";
import {
  buildTurnDebugSnapshot,
  isTurnDebugSseEnabled,
  readPiJsonlTail,
} from "../turn-debug.js";
import {
  createRequestLogger,
  createTraceId,
  logAgentStep,
} from "../agent-logger.js";
import { hashText, truncateForProdLog } from "../log-redact.js";
import type { AgentStepLogFields, RequestLogContext } from "../log-steps.js";
import { estimateCostUsd } from "@lets-talk/infrastructure/pricing";
import {
  diffSessionCostUsd,
  diffSessionTokens,
  snapshotSessionTokens,
} from "@lets-talk/infrastructure/session";

// ─── 进程内状态（Next dev HMR 后 Map 会清空，靠 jsonl + conversation JSON 恢复）───

/** sessionId → Pi 句柄；同一会话多轮对话复用，避免重复 createAgentSession */
const sessions = new Map<string, PiSessionHandle>();
/**
 * sessionId → 当前锚点 ref。
 * createRequirementDraftTools 通过 getAnchorRef 闭包读取，工具执行时可能晚于 runChat 入参。
 */
const liveAnchorRefs = new Map<string, string | null>();
/** sessionId → 完整锚点（供 get_anchor_preview） */
const liveAnchors = new Map<string, AgentAnchor | null>();

// ─── 小工具函数 ─────────────────────────────────────────────────────────────

function anchorRefFrom(anchor: AgentAnchor | null | undefined): string | null {
  return anchor?.ref?.trim() || null;
}

/** PRD 模式：把草稿 + 底部建议动作一次性推给前端（两条 SSE） */
function emitDraftEvents(
  draft: RequirementDraftState,
  onEvent: (event: SseEvent) => void,
): void {
  onEvent({ type: "requirement_state", draft });
  onEvent({ type: "agent_actions", actions: buildAgentActions(draft) });
}

/** 工具改草稿后异步写入 conversation JSON（不碰 items，那是前端 PUT 负责） */
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
 * 获取或创建 Pi 句柄（Agent 实例）。
 *
 * 命中缓存：同 sessionId + 同 cwd → 直接返回，保留内存中的 AgentSession。
 * 未命中：dispose 旧句柄 → 读 conversation JSON → SessionManager.open(jsonl) → createPiSession。
 */
async function getOrCreatePiHandle(
  sessionId: string,
  cwd: string,
  useTools: boolean,
  anchorRef: string | null,
  chatMode: ChatMode,
  anchor: AgentAnchor | null,
  actorId?: string,
): Promise<PiSessionHandle> {
  let handle = sessions.get(sessionId);
  if (handle && handle.cwd === cwd && handle.chatMode === chatMode) {
    return handle;
  }

  handle?.dispose();

  const record = await getConversation(cwd, sessionId);
  const piSessionFile = resolvePiSessionFile(
    cwd,
    sessionId,
    record?.piSessionFile,
  );

  // 内存草稿与磁盘对齐，供 get_requirement_draft / update_requirement_draft 使用
  initDraftRevision(sessionId, Boolean(record?.requirementDraft?.items?.length));
  if (record?.requirementDraft) {
    setDraft(sessionId, record.requirementDraft);
  } else {
    ensureDraft(sessionId, anchorRef);
  }

  handle = await createPiSession(cwd, useTools, {
    piSessionFile,
    sessionId,
    chatMode,
    actorId,
    getAnchorRef: () => liveAnchorRefs.get(sessionId) ?? null,
    getAnchor: () => liveAnchors.get(sessionId) ?? null,
  });
  sessions.set(sessionId, handle);
  return handle;
}

/** 删除会话时释放 Pi 句柄与进程内上下文 */
export function disposePiSession(sessionId: string): void {
  const handle = sessions.get(sessionId);
  handle?.dispose();
  sessions.delete(sessionId);
  liveAnchorRefs.delete(sessionId);
  liveAnchors.delete(sessionId);
  clearSessionContext(sessionId);
  clearSelfImprovementReviewState(sessionId);
  clearDraftRevision(sessionId);
  setDraftListener(sessionId, null);
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

/**
 * Pi SDK 原生事件 → 前端 SseEvent。
 * 只映射 UI 需要展示的几类；其余 Pi 事件忽略。
 */
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

/** runChat 的入参；onEvent 由 API route 编码为 SSE 行 */
export interface RunChatOptions {
  sessionId: string;
  /** 单次 HTTP 请求 id；route 生成，脚本未传时 runChat 内 createTraceId */
  traceId?: string;
  /** 用户原始输入；JIT 前缀在内部拼接，不会改写此字段的持久化 */
  message: string;
  useTools?: boolean;
  anchor?: AgentAnchor | null;
  chatMode?: ChatMode;
  /** 单次 HTTP 请求的 step 收集；route 创建并 finalize */
  traceRecorder?: TraceRecorder;
  /** 会话归属 Actor；USER 画像与访问控制 */
  actorId?: string;
  /** 每产生一个 SseEvent 调用一次；route.ts 里对应 enqueue → ReadableStream */
  onEvent: (event: SseEvent) => void;
  /** QA 模式：面板选中的关注请求 */
  qaFocusedRequest?: ChatStreamRequest["qaFocusedRequest"];
}

/**
 * 执行一轮 Agent 对话的主入口（用户点一次「发送」= 调用一次）。
 *
 * 阶段概览：
 *   1. 准备：草稿 listener、取 Pi session
 *   2. 预热 SSE：session / context_usage /（prd）requirement_state
 *   3. 订阅 Pi 事件（在 prompt 之前注册，否则丢流式 delta）
 *   4. 组装 JIT 上下文 → session.prompt（此处进入 Pi SDK 黑盒）
 *   5. 收尾：turn_end、调试日志、bindPiSessionFile
 */
export async function runChat(options: RunChatOptions): Promise<void> {
  const layout = getWorkspaceLayout();
  const cwd = layout.workspaceRoot;
  const useTools = options.useTools ?? true;
  const chatMode = options.chatMode ?? "explore";
  const anchorRef = anchorRefFrom(options.anchor);
  const traceId = options.traceId ?? createTraceId();
  const userMsgMeta = {
    userMessageHash: hashText(options.message),
    userMessageLen: options.message.length,
  };
  let stepLogger = createRequestLogger({
    traceId,
    sessionId: options.sessionId,
  });
  const logCtx: RequestLogContext = {
    traceId,
    sessionId: options.sessionId,
  };
  const logStep = (fields: AgentStepLogFields) => {
    logAgentStep(stepLogger, logCtx, fields, options.traceRecorder);
  };

  // ── 阶段 1a：PRD 草稿旁路 ──────────────────────────────────────────────
  // update_requirement_draft 工具不走 piEventToSse，而是 notifyDraftUpdated → 这里
  const onDraftUpdated = (draft: RequirementDraftState) => {
    emitDraftEvents(draft, options.onEvent);
    const persistT0 = Date.now();
    void persistDraft(cwd, options.sessionId, draft)
      .then(() => {
        logStep({
          step: "artifact.persist_draft",
          durationMs: Date.now() - persistT0,
          success: true,
          chatMode,
        });
      })
      .catch((err: unknown) => {
        logStep({
          step: "artifact.persist_draft",
          durationMs: Date.now() - persistT0,
          success: false,
          chatMode,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  setDraftListener(options.sessionId, onDraftUpdated);
  liveAnchorRefs.set(options.sessionId, anchorRef);
  liveAnchors.set(options.sessionId, options.anchor ?? null);

  // ── 阶段 1b：取 Pi AgentSession（创建逻辑在 create-session.ts）──────────
  const sessionT0 = Date.now();
  const handle = await getOrCreatePiHandle(
    options.sessionId,
    cwd,
    useTools,
    anchorRef,
    chatMode,
    options.anchor ?? null,
    options.actorId,
  );
  const { session, modelLabel } = handle;
  logStep({
    step: "session.get_or_create",
    durationMs: Date.now() - sessionT0,
    success: true,
    model: modelLabel,
    chatMode,
    ...userMsgMeta,
  });

  ensureDraft(options.sessionId, anchorRef);
  const initialDraft = getDraft(options.sessionId) ?? emptyDraft(anchorRef);
  if (options.chatMode === "prd") {
    emitDraftEvents(initialDraft, options.onEvent);
  }

  // ── 阶段 2：prompt 前的 SSE 握手 ───────────────────────────────────────
  options.onEvent({
    type: "session",
    sessionId: options.sessionId,
    cwd,
    model: modelLabel,
    traceId,
  });

  pushContextUsageEvents(session, options.onEvent);
  const prePromptUsage = snapshotContextUsage(session);
  await maybeCompactSessionIfNeeded({
    session,
    usage: prePromptUsage,
    chatMode,
    draftRevision: getDraftRevision(options.sessionId),
    onEvent: options.onEvent,
  });
  pushContextUsageEvents(session, options.onEvent);

  const turnId = nextTurnId(options.sessionId);
  setActiveTurnId(options.sessionId, turnId);
  stepLogger = createRequestLogger({
    traceId,
    sessionId: options.sessionId,
    turnId,
  });
  logCtx.turnId = turnId;
  const debugTools: DebugToolRecord[] = [];
  let debugAssistant = "";
  const toolStepStarts = new Map<string, number>();
  let toolStepCounter = 0;

  // ── 阶段 3：订阅 Pi（必须在 prompt 之前；prompt 期间异步推送）────────────
  const unsub = session.subscribe((piEvent: unknown) => {
    const e = piEvent as Record<string, unknown>;

    // 下面三块仅服务于 LETS_TALK_DEBUG 落盘，与 SSE 无关
    if (e.type === "message_update") {
      const inner = e.assistantMessageEvent as { type?: string; delta?: string };
      if (inner?.type === "text_delta" && inner.delta) {
        debugAssistant += inner.delta;
      }
    }
    if (e.type === "tool_execution_start") {
      const callId = String(e.toolCallId ?? "");
      toolStepStarts.set(callId, Date.now());
      debugTools.push({
        tool: String(e.toolName ?? "?"),
        callId: String(e.toolCallId ?? ""),
        preview: "(执行中…)",
      });
    }
    if (e.type === "tool_execution_end") {
      const callId = String(e.toolCallId ?? "");
      const toolName = String(e.toolName ?? "?");
      if (
        e.isError !== true &&
        [
          "memory",
          "update_user_profile",
          "update_core_memory",
          "save_memory",
          "skill_manage",
        ].includes(toolName)
      ) {
        markSelfImprovementWrittenThisTurn(options.sessionId);
      }
      if (e.isError !== true && toolName === "skill_manage" && isSkillsEnabled()) {
        invalidateSkillsIndexCache(cwd);
      }
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

      const toolT0 = toolStepStarts.get(callId) ?? Date.now();
      toolStepStarts.delete(callId);
      toolStepCounter += 1;
      const { preview: toolPreview, truncated } = truncateForProdLog(preview);
      logStep({
        step: "tool.execute",
        stepId: `tool-${toolStepCounter}`,
        durationMs: Date.now() - toolT0,
        success: e.isError !== true,
        toolName,
        chatMode,
        preview: toolPreview,
        truncated,
        ...(e.isError === true ? { error: "tool_execution_failed" } : {}),
      });
    }

    // 转成 SseEvent 推给浏览器
    const sse = piEventToSse(piEvent);
    if (sse) options.onEvent(sse);
  });

  try {
    // ── 阶段 4a：V1 上下文 — 每轮仅 pointer / memory Pull / 清单摘要（规则在 system）──
    noteUserTurnForSelfImprovementReview(options.sessionId);
    const prefixT0 = Date.now();
    const turnCtx = await buildTurnPromptPrefix({
      sessionId: options.sessionId,
      layout,
      chatMode,
      anchor: options.anchor ?? null,
      draftRevision: getDraftRevision(options.sessionId),
      userMessage: options.message,
      sessionCreatedAtMs: handle.sessionCreatedAtMs,
      actorId: options.actorId,
      qaFocusedRequest: options.qaFocusedRequest ?? null,
    });
    const prefix = turnCtx.prefix;
    logStep({
      step: "context.build_prefix",
      durationMs: Date.now() - prefixT0,
      success: true,
      chatMode,
      model: modelLabel,
    });
    options.onEvent({
      type: "context",
      mode: turnCtx.mode,
      anchorRef: turnCtx.anchorRef,
      previewLines: 0,
      m0Refreshed: turnCtx.m0Refreshed,
    });
    if (turnCtx.m0Refreshed) {
      options.onEvent({ type: "memory_refreshed", source: "prefix" });
    }
    const userText = prefix.trim()
      ? `${prefix}\n\n${options.message}`
      : options.message;

    await logTurnRequest(cwd, options.sessionId, turnId, {
      chatMode,
      anchor: options.anchor ?? null,
      userMessage: options.message,
      contextBlock: prefix,
      requirementDraft:
        chatMode === "prd" ? (getDraft(options.sessionId) ?? initialDraft) : null,
      systemPrompt: handle.systemPromptSnapshot,
      modelLabel: handle.modelLabel,
      activeTools: handle.activeTools,
    });

    // ── 阶段 4b：进入 Pi SDK ─────────────────────────────────────────────
    // 内部：调 LLM → 可能多轮 tool_execution（grep/read/…）→ subscribe 推事件
    // 本仓库在此行之后无代码，直到 prompt Promise resolve
    const llmT0 = Date.now();
    const tokenStatsBefore = snapshotSessionTokens(session);
    await session.prompt(userText);
    const tokenStatsAfter = snapshotSessionTokens(session);
    const turnUsage = diffSessionTokens(tokenStatsAfter, tokenStatsBefore);
    const turnCostPi = diffSessionCostUsd(tokenStatsAfter, tokenStatsBefore);
    const costUsd =
      turnCostPi > 0 ? turnCostPi : estimateCostUsd(modelLabel, turnUsage);
    logStep({
      step: "llm.call",
      stepId: "llm-1",
      durationMs: Date.now() - llmT0,
      success: true,
      model: modelLabel,
      chatMode,
      tokenUsage: turnUsage,
      costUsd: costUsd ?? null,
      sessionTokenTotal: tokenStatsAfter.total,
      sessionCostUsd:
        tokenStatsAfter.costUsd > 0
          ? tokenStatsAfter.costUsd
          : (estimateCostUsd(modelLabel, {
              input: tokenStatsAfter.input,
              output: tokenStatsAfter.output,
            }) ?? undefined),
      ...userMsgMeta,
    });

    pushContextUsageEvents(session, options.onEvent);

    const usageSnap = snapshotContextUsage(session);
    const piFileAbs = session.sessionFile ?? handle.piSessionFile ?? null;
    let piRel: string | null = null;
    if (piFileAbs) {
      const { relative } = await import("node:path");
      piRel = relative(cwd, piFileAbs).replace(/\\/g, "/");
    }

    if (isTurnDebugSseEnabled()) {
      const { tail, totalBytes, truncated } = piFileAbs
        ? await readPiJsonlTail(piFileAbs)
        : { tail: null, totalBytes: 0, truncated: false };
      const snapshot = buildTurnDebugSnapshot({
        turnId,
        chatMode,
        anchor: options.anchor ?? null,
        userMessage: options.message,
        contextPrefix: prefix,
        promptUserText: userText,
        assistantText: debugAssistant,
        tools: debugTools,
        contextUsage: usageSnap,
        piSessionFileAbs: piFileAbs,
        piSessionFileRel: piRel,
        piJsonlTail: tail,
        piJsonlTruncated: truncated,
        piJsonlTotalBytes: totalBytes,
        systemPrompt: handle.systemPromptSnapshot,
        modelLabel: handle.modelLabel,
        activeTools: handle.activeTools,
      });
      options.onEvent({ type: "turn_debug", snapshot });
    }

    options.onEvent({ type: "turn_end" });

    maybeSpawnSelfImprovementReview({
      sessionId: options.sessionId,
      workspaceRoot: cwd,
      chatMode,
      actorId: options.actorId,
      userMessage: options.message,
      assistantText: debugAssistant,
    });

    await logTurnResponse(cwd, options.sessionId, turnId, {
      assistantText: debugAssistant,
      tools: debugTools,
      contextUsage: usageSnap,
      requirementDraftAfter:
        chatMode === "prd" ? (getDraft(options.sessionId) ?? null) : null,
    });

    options.traceRecorder?.setTurnMeta({
      turnId,
      chatMode,
      model: modelLabel,
      userMessageHash: userMsgMeta.userMessageHash,
      userMessageLen: userMsgMeta.userMessageLen,
      turnTokenUsage: turnUsage,
      turnCostUsd: costUsd ?? null,
      sessionTokenTotal: tokenStatsAfter.total,
      sessionCostUsd:
        tokenStatsAfter.costUsd > 0
          ? tokenStatsAfter.costUsd
          : (estimateCostUsd(modelLabel, {
              input: tokenStatsAfter.input,
              output: tokenStatsAfter.output,
            }) ?? undefined),
      tools: toolRecordsFromSteps(options.traceRecorder?.getSteps() ?? []),
      success: true,
    });
  } catch (err) {
    const usageSnap = snapshotContextUsage(session);
    await logTurnResponse(cwd, options.sessionId, turnId, {
      assistantText: debugAssistant,
      tools: debugTools,
      contextUsage: usageSnap,
      requirementDraftAfter:
        chatMode === "prd" ? (getDraft(options.sessionId) ?? null) : null,
      error: err instanceof Error ? err.message : String(err),
    });
    options.traceRecorder?.setTurnMeta({
      turnId,
      chatMode,
      model: modelLabel,
      userMessageHash: userMsgMeta.userMessageHash,
      userMessageLen: userMsgMeta.userMessageLen,
      tools: toolRecordsFromSteps(options.traceRecorder?.getSteps() ?? []),
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    // ── 阶段 5：清理 ─────────────────────────────────────────────────────
    unsub();
    setDraftListener(options.sessionId, null);
    // 把 jsonl 路径写回 conversation JSON，下次 getOrCreatePiHandle 可 SessionManager.open
    const piFile = session.sessionFile ?? handle.piSessionFile;
    if (piFile) {
      await bindPiSessionFile(cwd, options.sessionId, piFile);
    }
  }
}

/** 会话切换时查询 token 占用；无内存缓存则短暂 open jsonl 后释放 */
export function queryContextUsage(sessionId: string) {
  return getContextUsageForSession(sessionId, sessions);
}

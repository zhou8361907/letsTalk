/**
 * 组装单轮 user 前缀：仅运行时状态（pointer / 模式切换 / 记忆 Pull / 清单摘要）。
 * 跨会话业务规则在 createPiSession 时写入 Pi system prompt（AGENTS.md + append）。
 */

import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";
import type { WorkspaceLayout } from "@lets-talk/context";
import { buildQaContextPrefix } from "./qa/context.js";
import {
  formatRequirementDraftBriefSummary,
  formatTurnPrefix,
  resolveAgentAnchor,
} from "@lets-talk/context";
import { syncSessionPointer } from "./session-context.js";
import {
  formatCoreMemoryPrefixRefresh,
  formatMemoryContextForPrefix,
  getM0FileMtimes,
  isMemoryIgnoredMessage,
  loadCoreMemorySnapshot,
  resolveMemoryContext,
  shouldRefreshM0InPrefix,
} from "@lets-talk/memory";
import { buildEpisodicRecallBlock } from "@lets-talk/conversation";
import { isMemoryToolsEnabled } from "./agent-write-policy.js";
import { getDraft } from "@lets-talk/domain/requirement";

export interface BuildTurnPromptPrefixInput {
  sessionId: string;
  layout: WorkspaceLayout;
  chatMode: ChatMode;
  anchor: AgentAnchor | null;
  draftRevision: number;
  /** 当前轮用户消息，用于 INDEX 黑话静默 Pull */
  userMessage?: string;
  /** Pi 句柄创建时间（ms），用于 M0 前缀刷新 */
  sessionCreatedAtMs: number;
  /** 会话归属 Actor；USER 画像隔离 */
  actorId?: string;
  /** QA 模式：面板选中的关注请求 */
  qaFocusedRequest?: {
    seq?: number;
    url?: string;
    method?: string;
    statusCode?: number;
    traceId?: string;
    timestamp?: string;
    summary?: string;
  } | null;
  /** 产品线：yibao（医保）/ shebao（社保） */
  productLine?: string;
}

export interface BuildTurnPromptPrefixResult {
  prefix: string;
  mode: "explore" | "focused";
  anchorRef: string | null;
  /** 本轮注入了 <core_memory_refresh>（M0 磁盘比句柄创建新） */
  m0Refreshed: boolean;
}

export async function buildTurnPromptPrefix(
  input: BuildTurnPromptPrefixInput,
): Promise<BuildTurnPromptPrefixResult> {
  const resolved = await resolveAgentAnchor(
    input.layout.workspaceRoot,
    input.layout,
    input.anchor,
  );

  const { pointer, contextChange } = syncSessionPointer(
    {
      sessionId: input.sessionId,
      chatMode: input.chatMode,
      anchor: resolved,
      productLine: input.productLine,
    },
    input.draftRevision,
  );

  let draftSummary: string | undefined;
  if (input.chatMode === "prd" && input.draftRevision > 0) {
    const draft = getDraft(input.sessionId);
    const summary = formatRequirementDraftBriefSummary(draft);
    if (summary) draftSummary = summary;
  }

  let qaContextPrefix: string | undefined;
  if (input.chatMode === "qa") {
    const focused = input.qaFocusedRequest
      ? {
          seq: input.qaFocusedRequest.seq ?? 0,
          url: input.qaFocusedRequest.url ?? "",
          method: input.qaFocusedRequest.method ?? "?",
          statusCode: input.qaFocusedRequest.statusCode ?? 0,
          traceId: input.qaFocusedRequest.traceId ?? "",
          timestamp: input.qaFocusedRequest.timestamp ?? "",
        }
      : undefined;
    const ctx = buildQaContextPrefix(input.sessionId, focused);
    if (ctx) qaContextPrefix = ctx;
  }

  let memoryContext: string | undefined;
  let episodicRecall: string | undefined;
  let coreMemoryRefresh: string | undefined;
  let memorySuppressed = false;
  const userText = input.userMessage?.trim() ?? "";
  if (userText && isMemoryIgnoredMessage(userText)) {
    memorySuppressed = true;
  } else {
    if (userText) {
      const episodic = await buildEpisodicRecallBlock(
        input.layout.workspaceRoot,
        userText,
        { currentSessionId: input.sessionId },
      );
      if (episodic) episodicRecall = episodic;
    }
  }
  if (!memorySuppressed && isMemoryToolsEnabled()) {
    const mtimes = await getM0FileMtimes(
      input.layout.workspaceRoot,
      input.actorId,
    );
    if (shouldRefreshM0InPrefix(mtimes, input.sessionCreatedAtMs)) {
      const snap = await loadCoreMemorySnapshot(
        input.layout.workspaceRoot,
        input.actorId,
      );
      const block = formatCoreMemoryPrefixRefresh(snap);
      if (block) coreMemoryRefresh = block;
    }
    if (userText) {
      const mem = await resolveMemoryContext(
        input.layout.workspaceRoot,
        userText,
      );
      const formatted = formatMemoryContextForPrefix(mem);
      if (formatted) memoryContext = formatted;
    }
  }

  const basePrefix = formatTurnPrefix({
    pointer,
    change: contextChange,
    draftSummary,
    memoryContext,
    episodicRecall,
    memorySuppressed,
    coreMemoryRefresh,
  });

  // QA 上下文附加到前缀
  const prefix = qaContextPrefix
    ? `${basePrefix}\n\n${qaContextPrefix}\n`
    : basePrefix;

  return {
    prefix,
    mode: resolved ? "focused" : "explore",
    anchorRef: resolved?.ref ?? null,
    m0Refreshed: Boolean(coreMemoryRefresh?.trim()),
  };
}

/**
 * 后台 M0 记忆回顾（对齐 Hermes background_review · 每 N user turn）
 */

import { resolve } from "node:path";
import { getConversation } from "@lets-talk/conversation";
import { isMemoryToolsEnabled } from "./agent-write-policy.js";
import { createPiSession } from "./create-session.js";

const REVIEW_PROMPT = `请回顾下面的对话片段，判断是否值得写入跨会话 M0 记忆。

你**只能**调用工具 \`memory\`（本任务未注册 grep/read/save_memory 等其它工具）。

写入示例（action 必须为 add / replace / remove）：
- 用户称呼/偏好 → memory(action="add", target="user", content="用户希望被称呼为…")
- 仓库惯例/踩坑 → memory(action="add", target="core", content="…")

若无值得保存的内容，只回复「无需保存。」并结束。
禁止写入：任务进度、PR/分支、本单需求、接口清单、jargon（jargon 用 save_memory，本回顾不写）。`;

interface SessionReviewState {
  userTurns: number;
  wroteThisTurn: boolean;
  reviewInFlight: boolean;
}

const reviewState = new Map<string, SessionReviewState>();

function stateFor(sessionId: string): SessionReviewState {
  let s = reviewState.get(sessionId);
  if (!s) {
    s = { userTurns: 0, wroteThisTurn: false, reviewInFlight: false };
    reviewState.set(sessionId, s);
  }
  return s;
}

/** LETS_TALK_MEMORY_NUDGE_INTERVAL：默认 dev=10，production=0（关闭） */
export function memoryReviewInterval(): number {
  const raw = process.env.LETS_TALK_MEMORY_NUDGE_INTERVAL?.trim();
  if (raw === "0" || raw === "false" || raw === "no") return 0;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return process.env.NODE_ENV === "production" ? 0 : 10;
}

export function noteUserTurnForMemoryReview(sessionId: string): void {
  const s = stateFor(sessionId);
  s.userTurns += 1;
  s.wroteThisTurn = false;
}

export function markMemoryWrittenThisTurn(sessionId: string): void {
  stateFor(sessionId).wroteThisTurn = true;
}

export function clearMemoryReviewState(sessionId: string): void {
  reviewState.delete(sessionId);
}

async function buildTranscriptExcerpt(
  workspaceRoot: string,
  sessionId: string,
  latestUser: string,
  latestAssistant: string,
  maxChars = 12_000,
): Promise<string> {
  const lines: string[] = [];
  const record = await getConversation(workspaceRoot, sessionId);
  const items = record?.items ?? [];
  for (const item of items.slice(-12)) {
    if (item.kind === "user") {
      lines.push(`用户: ${item.text}`);
    } else if (item.kind === "assistant") {
      lines.push(`助手: ${item.text.slice(0, 2000)}`);
    }
  }
  if (latestUser.trim()) {
    lines.push(`用户: ${latestUser.trim()}`);
  }
  if (latestAssistant.trim()) {
    lines.push(`助手: ${latestAssistant.trim().slice(0, 4000)}`);
  }
  let text = lines.join("\n\n");
  if (text.length > maxChars) {
    text = `…（前 ${text.length - maxChars} 字省略）\n${text.slice(-maxChars)}`;
  }
  return text;
}

async function runReviewInBackground(input: {
  workspaceRoot: string;
  sessionId: string;
  chatMode: "explore" | "prd";
  userMessage: string;
  assistantText: string;
}): Promise<void> {
  const transcript = await buildTranscriptExcerpt(
    input.workspaceRoot,
    input.sessionId,
    input.userMessage,
    input.assistantText,
  );
  if (!transcript.trim()) return;

  const cwd = resolve(input.workspaceRoot);

  const handle = await createPiSession(cwd, true, {
    sessionKind: "memory-review",
    chatMode: input.chatMode,
  });

  try {
    const prompt = `${REVIEW_PROMPT}\n\n---\n\n${transcript}`;
    await handle.session.prompt(prompt);
  } finally {
    handle.dispose();
  }
}

/** 本轮结束后按需 spawn（不阻塞主回复） */
export function maybeSpawnBackgroundMemoryReview(input: {
  sessionId: string;
  workspaceRoot: string;
  chatMode: "explore" | "prd";
  userMessage: string;
  assistantText: string;
}): void {
  const interval = memoryReviewInterval();
  if (interval <= 0 || !isMemoryToolsEnabled()) return;

  const s = stateFor(input.sessionId);
  if (s.wroteThisTurn || s.reviewInFlight) return;
  if (s.userTurns % interval !== 0) return;

  s.reviewInFlight = true;
  void runReviewInBackground(input)
    .catch((err) => {
      console.warn(
        `[letsTalk:memory-review] ${input.sessionId} failed:`,
        err instanceof Error ? err.message : err,
      );
    })
    .finally(() => {
      s.reviewInFlight = false;
    });
}

/**
 * 后台 self-improvement review（对齐 Hermes background_review · memory + skill_manage）
 */

import { resolve } from "node:path";
import type { ChatMode } from "@lets-talk/shared-types";
import { getConversation } from "@lets-talk/conversation";
import { resolveSelfImprovementReviewPrompt } from "@lets-talk/context";
import {
  isSkillsEnabled,
  selfImprovementReviewInterval,
} from "@lets-talk/skills";
import { isMemoryToolsEnabled } from "./agent-write-policy.js";
import { createPiSession } from "./create-session.js";

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

export function selfImprovementReviewIntervalConfig(): number {
  return selfImprovementReviewInterval();
}

/** @deprecated 使用 selfImprovementReviewIntervalConfig */
export function memoryReviewInterval(): number {
  return selfImprovementReviewIntervalConfig();
}

function reviewEnabled(): boolean {
  const interval = selfImprovementReviewIntervalConfig();
  if (interval <= 0) return false;
  return isMemoryToolsEnabled() || isSkillsEnabled();
}

export function noteUserTurnForMemoryReview(sessionId: string): void {
  noteUserTurnForSelfImprovementReview(sessionId);
}

export function noteUserTurnForSelfImprovementReview(sessionId: string): void {
  const s = stateFor(sessionId);
  s.userTurns += 1;
  s.wroteThisTurn = false;
}

export function markMemoryWrittenThisTurn(sessionId: string): void {
  markSelfImprovementWrittenThisTurn(sessionId);
}

export function markSelfImprovementWrittenThisTurn(sessionId: string): void {
  stateFor(sessionId).wroteThisTurn = true;
}

export function clearMemoryReviewState(sessionId: string): void {
  clearSelfImprovementReviewState(sessionId);
}

export function clearSelfImprovementReviewState(sessionId: string): void {
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
  chatMode: ChatMode;
  actorId?: string;
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
  const skillsOn = isSkillsEnabled();

  const handle = await createPiSession(cwd, true, {
    sessionKind: "self-improvement-review",
    chatMode: input.chatMode,
    actorId: input.actorId,
  });

  try {
    const reviewPrompt = await resolveSelfImprovementReviewPrompt(cwd, skillsOn);
    const prompt = `${reviewPrompt}\n\n---\n\n${transcript}`;
    await handle.session.prompt(prompt);
  } finally {
    handle.dispose();
  }
}

/** 本轮结束后按需 spawn（不阻塞主回复） */
export function maybeSpawnBackgroundMemoryReview(input: {
  sessionId: string;
  workspaceRoot: string;
  chatMode: ChatMode;
  actorId?: string;
  userMessage: string;
  assistantText: string;
}): void {
  maybeSpawnSelfImprovementReview(input);
}

export function maybeSpawnSelfImprovementReview(input: {
  sessionId: string;
  workspaceRoot: string;
  chatMode: ChatMode;
  actorId?: string;
  userMessage: string;
  assistantText: string;
}): void {
  const interval = selfImprovementReviewIntervalConfig();
  if (!reviewEnabled()) return;

  const s = stateFor(input.sessionId);
  if (s.wroteThisTurn || s.reviewInFlight) return;
  if (s.userTurns % interval !== 0) return;

  s.reviewInFlight = true;
  void runReviewInBackground(input)
    .catch((err) => {
      console.warn(
        `[letsTalk:self-improve-review] ${input.sessionId} failed:`,
        err instanceof Error ? err.message : err,
      );
    })
    .finally(() => {
      s.reviewInFlight = false;
    });
}

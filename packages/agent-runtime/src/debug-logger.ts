/**
 * 调试日志：需求清单 + 每轮完整请求上下文 / 响应
 * 启用：.env 中 LETS_TALK_DEBUG=1 或 REQUIREMENT_DRAFT_DEBUG=1
 * 落盘：{WORKSPACE_ROOT}/.agent/debug/{sessionId}/
 */

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentAnchor, ContextUsageSnapshot, RequirementDraftState } from "@lets-talk/shared-types";

export function isDebugLoggingEnabled(): boolean {
  const v =
    process.env.LETS_TALK_DEBUG?.trim() ||
    process.env.REQUIREMENT_DRAFT_DEBUG?.trim();
  return v === "1" || v === "true" || v === "yes";
}

const turnCounters = new Map<string, number>();

export function nextTurnId(sessionId: string): string {
  const n = (turnCounters.get(sessionId) ?? 0) + 1;
  turnCounters.set(sessionId, n);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `turn-${String(n).padStart(3, "0")}-${ts}`;
}

function debugDir(workspaceRoot: string, sessionId: string): string {
  return join(workspaceRoot, ".agent", "debug", sessionId);
}

async function ensureDebugDir(workspaceRoot: string, sessionId: string): Promise<string> {
  const dir = debugDir(workspaceRoot, sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function appendManifest(
  dir: string,
  entry: Record<string, unknown>,
): Promise<void> {
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`;
  await appendFile(join(dir, "manifest.jsonl"), line, "utf8");
}

function consoleLine(tag: string, msg: string): void {
  console.log(`[letsTalk:debug:${tag}] ${msg}`);
}

export async function logTurnRequest(
  workspaceRoot: string,
  sessionId: string,
  turnId: string,
  payload: {
    chatMode: string;
    anchor: AgentAnchor | null;
    userMessage: string;
    contextBlock: string;
    requirementDraft: RequirementDraftState | null;
  },
): Promise<void> {
  if (!isDebugLoggingEnabled()) return;

  const dir = await ensureDebugDir(workspaceRoot, sessionId);
  const base = `${turnId}_request`;
  const md = [
    `# ${turnId} 请求`,
    ``,
    `- 时间: ${new Date().toISOString()}`,
    `- chatMode: ${payload.chatMode}`,
    `- anchor: ${payload.anchor ? JSON.stringify(payload.anchor, null, 2) : "(无)"}`,
    ``,
    `## 用户消息`,
    ``,
    "```",
    payload.userMessage,
    "```",
    ``,
    `## 注入上下文 (agent_context 完整块)`,
    ``,
    "```xml",
    payload.contextBlock,
    "```",
    ``,
    `## 当前需求清单 (结构化)`,
    ``,
    "```json",
    JSON.stringify(payload.requirementDraft, null, 2),
    "```",
    ``,
  ].join("\n");

  await writeFile(join(dir, `${base}.md`), md, "utf8");
  await writeFile(
    join(dir, `${base}.json`),
    JSON.stringify(
      {
        turnId,
        at: new Date().toISOString(),
        chatMode: payload.chatMode,
        anchor: payload.anchor,
        userMessage: payload.userMessage,
        contextBlock: payload.contextBlock,
        requirementDraft: payload.requirementDraft,
      },
      null,
      2,
    ),
    "utf8",
  );
  await appendManifest(dir, { type: "turn_request", turnId, files: [`${base}.md`, `${base}.json`] });
  consoleLine("turn", `${sessionId} ${turnId} 请求已写入 ${dir}/${base}.md`);
}

export interface DebugToolRecord {
  tool: string;
  callId?: string;
  ok?: boolean;
  argsSummary?: string;
  preview: string;
}

export async function logTurnResponse(
  workspaceRoot: string,
  sessionId: string,
  turnId: string,
  payload: {
    assistantText: string;
    tools: DebugToolRecord[];
    contextUsage: ContextUsageSnapshot | null;
    requirementDraftAfter: RequirementDraftState | null;
    error?: string;
  },
): Promise<void> {
  if (!isDebugLoggingEnabled()) return;

  const dir = await ensureDebugDir(workspaceRoot, sessionId);
  const base = `${turnId}_response`;
  const toolsMd =
    payload.tools.length === 0
      ? "（本轮无工具调用）"
      : payload.tools
          .map(
            (t, i) =>
              `### ${i + 1}. ${t.tool}${t.ok === false ? " (failed)" : ""}\n\n` +
              (t.argsSummary ? `args: ${t.argsSummary}\n\n` : "") +
              "```\n" +
              t.preview +
              "\n```",
          )
          .join("\n\n");

  const md = [
    `# ${turnId} 响应`,
    ``,
    `- 时间: ${new Date().toISOString()}`,
    payload.error ? `- 错误: ${payload.error}` : "",
    payload.contextUsage
      ? `- 上下文: ${payload.contextUsage.tokens ?? "?"} / ${payload.contextUsage.contextWindow} (${payload.contextUsage.percent ?? "?"}%)`
      : "",
    ``,
    `## 助手回复`,
    ``,
    "```",
    payload.assistantText || "（空）",
    "```",
    ``,
    `## 工具调用`,
    ``,
    toolsMd,
    ``,
    `## 回合结束时的需求清单`,
    ``,
    "```json",
    JSON.stringify(payload.requirementDraftAfter, null, 2),
    "```",
    ``,
  ]
    .filter(Boolean)
    .join("\n");

  await writeFile(join(dir, `${base}.md`), md, "utf8");
  await writeFile(
    join(dir, `${base}.json`),
    JSON.stringify(
      {
        turnId,
        at: new Date().toISOString(),
        assistantText: payload.assistantText,
        tools: payload.tools,
        contextUsage: payload.contextUsage,
        requirementDraftAfter: payload.requirementDraftAfter,
        error: payload.error,
      },
      null,
      2,
    ),
    "utf8",
  );
  await appendManifest(dir, { type: "turn_response", turnId, files: [`${base}.md`, `${base}.json`] });
  consoleLine("turn", `${sessionId} ${turnId} 响应已写入 ${dir}/${base}.md`);
}

export async function logDraftUpdate(
  workspaceRoot: string,
  sessionId: string,
  payload: {
    turnId?: string;
    toolInput: unknown;
    before: RequirementDraftState | null;
    after: RequirementDraftState;
    anchorRef: string | null;
  },
): Promise<void> {
  if (!isDebugLoggingEnabled()) return;

  const dir = await ensureDebugDir(workspaceRoot, sessionId);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `draft-${ts}`;
  const md = [
    `# 需求清单更新 ${ts}`,
    ``,
    `- 时间: ${new Date().toISOString()}`,
    `- sessionId: ${sessionId}`,
    payload.turnId ? `- 关联回合: ${payload.turnId}` : "",
    `- anchorRef: ${payload.anchorRef ?? "(无)"}`,
    ``,
    `## 工具入参 (update_requirement_draft)`,
    ``,
    "```json",
    JSON.stringify(payload.toolInput, null, 2),
    "```",
    ``,
    `## 更新前`,
    ``,
    "```json",
    JSON.stringify(payload.before, null, 2),
    "```",
    ``,
    `## 更新后`,
    ``,
    "```json",
    JSON.stringify(payload.after, null, 2),
    "```",
    ``,
    `## 差异摘要`,
    ``,
    `- 条目前: ${payload.before?.items.length ?? 0} → 后: ${payload.after.items.length}`,
    `- item ids 前: ${(payload.before?.items ?? []).map((i) => i.id).join(", ") || "(无)"}`,
    `- item ids 后: ${payload.after.items.map((i) => i.id).join(", ") || "(无)"}`,
    ``,
  ]
    .filter(Boolean)
    .join("\n");

  await writeFile(join(dir, `${base}.md`), md, "utf8");
  await writeFile(
    join(dir, `${base}.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        sessionId,
        turnId: payload.turnId,
        anchorRef: payload.anchorRef,
        toolInput: payload.toolInput,
        before: payload.before,
        after: payload.after,
      },
      null,
      2,
    ),
    "utf8",
  );
  await appendManifest(dir, { type: "draft_update", files: [`${base}.md`, `${base}.json`] });
  consoleLine("draft", `${sessionId} 清单更新 → ${dir}/${base}.md`);
}

/** 当前回合 id（工具回调里关联请求/响应） */
const activeTurnBySession = new Map<string, string>();

export function setActiveTurnId(sessionId: string, turnId: string): void {
  activeTurnBySession.set(sessionId, turnId);
}

export function getActiveTurnId(sessionId: string): string | undefined {
  return activeTurnBySession.get(sessionId);
}

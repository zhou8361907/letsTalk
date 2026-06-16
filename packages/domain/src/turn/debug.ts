/**
 * 回合调试：SSE 推送 + Pi jsonl 读取
 */

import { readFile, stat } from "node:fs/promises";
import type {
  AgentAnchor,
  ContextUsageSnapshot,
  SystemPromptSnapshot,
  TurnDebugSnapshot,
} from "@lets-talk/shared-types";
import type { DebugToolRecord } from "@lets-talk/infrastructure/debug";

const JSONL_TAIL_MAX_BYTES = 150_000;

/** 非 production 默认开启；LETS_TALK_TURN_DEBUG=0 可关 */
export function isTurnDebugSseEnabled(): boolean {
  const off = process.env.LETS_TALK_TURN_DEBUG?.trim();
  if (off === "0" || off === "false" || off === "no") return false;
  const on =
    process.env.LETS_TALK_TURN_DEBUG?.trim() ||
    process.env.LETS_TALK_DEBUG?.trim() ||
    process.env.REQUIREMENT_DRAFT_DEBUG?.trim();
  if (on === "1" || on === "true" || on === "yes") return true;
  return process.env.NODE_ENV !== "production";
}

export async function readPiJsonlTail(
  absPath: string,
  maxBytes = JSONL_TAIL_MAX_BYTES,
): Promise<{
  tail: string | null;
  totalBytes: number;
  truncated: boolean;
}> {
  try {
    const st = await stat(absPath);
    const totalBytes = st.size;
    if (totalBytes === 0) {
      return { tail: "", totalBytes: 0, truncated: false };
    }
    if (totalBytes <= maxBytes) {
      const full = await readFile(absPath, "utf8");
      return { tail: full, totalBytes, truncated: false };
    }
    const buf = Buffer.alloc(maxBytes);
    const { open } = await import("node:fs/promises");
    const fh = await open(absPath, "r");
    try {
      await fh.read(buf, 0, maxBytes, totalBytes - maxBytes);
    } finally {
      await fh.close();
    }
    const tail = buf.toString("utf8");
    const firstNl = tail.indexOf("\n");
    const cleaned = firstNl >= 0 ? tail.slice(firstNl + 1) : tail;
    return {
      tail: `…（前 ${totalBytes - maxBytes} 字节已省略）\n${cleaned}`,
      totalBytes,
      truncated: true,
    };
  } catch {
    return { tail: null, totalBytes: 0, truncated: false };
  }
}

export async function readPiJsonlFull(absPath: string): Promise<string> {
  return readFile(absPath, "utf8");
}

export function buildTurnDebugSnapshot(input: {
  turnId: string;
  chatMode: string;
  anchor: AgentAnchor | null;
  userMessage: string;
  contextPrefix: string;
  promptUserText: string;
  assistantText: string;
  tools: DebugToolRecord[];
  contextUsage: ContextUsageSnapshot | null;
  piSessionFileAbs: string | null;
  piSessionFileRel: string | null;
  piJsonlTail: string | null;
  piJsonlTruncated: boolean;
  piJsonlTotalBytes: number;
  systemPrompt?: SystemPromptSnapshot | null;
  modelLabel?: string | null;
  activeTools?: string[];
}): TurnDebugSnapshot {
  return {
    turnId: input.turnId,
    at: new Date().toISOString(),
    chatMode: input.chatMode,
    anchor: input.anchor,
    userMessage: input.userMessage,
    contextPrefix: input.contextPrefix,
    promptUserText: input.promptUserText,
    assistantText: input.assistantText,
    tools: input.tools.map((t) => ({
      tool: t.tool,
      ok: t.ok,
      preview: t.preview,
    })),
    contextUsage: input.contextUsage,
    piSessionFile: input.piSessionFileRel,
    piJsonlTail: input.piJsonlTail,
    piJsonlTruncated: input.piJsonlTruncated,
    piJsonlTotalBytes: input.piJsonlTotalBytes,
    systemPrompt: input.systemPrompt ?? null,
    modelLabel: input.modelLabel ?? null,
    activeTools: input.activeTools,
  };
}

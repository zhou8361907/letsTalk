/**
 * 需求清单工具 I/O 日志（仅 get / update 两个 Pi 工具）
 *
 * 开启：.env 中 LETS_TALK_DEBUG=1 或 REQUIREMENT_DRAFT_DEBUG=1
 * 落盘：{WORKSPACE_ROOT}/.agent/debug/{sessionId}/draft-io.jsonl
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isDebugLoggingEnabled } from "./logger.js";

export type DraftIoOp =
  | "get_requirement_draft"
  | "update_requirement_draft"
  | "update_revision_mismatch";

export function isDraftIoLogEnabled(): boolean {
  return isDebugLoggingEnabled();
}

export interface DraftIoLogPayload {
  /** 工具入参（模型传给工具的 JSON） */
  input?: unknown;
  /** 工具返回给模型的文本 */
  output?: string;
  error?: string;
}

export async function logDraftIo(
  workspaceRoot: string | undefined,
  sessionId: string,
  op: DraftIoOp,
  payload: DraftIoLogPayload = {},
): Promise<void> {
  if (!isDraftIoLogEnabled()) return;

  const record = {
    at: new Date().toISOString(),
    op,
    sessionId,
    input: payload.input,
    output: payload.output,
    error: payload.error,
  };

  console.log(`[letsTalk:draft:${op}]`, JSON.stringify(record, null, 2));

  if (!workspaceRoot?.trim()) return;
  try {
    const dir = join(workspaceRoot, ".agent", "debug", sessionId);
    await mkdir(dir, { recursive: true });
    await appendFile(
      join(dir, "draft-io.jsonl"),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
  } catch {
    // 落盘失败不阻断
  }
}

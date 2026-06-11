/**
 * 生产 log step 名称 — 与 00_GAP_ASSESSMENT §命名规范 共用。
 * log.step · trace span · 未来 metrics 标签均使用此表。
 */

export const LOG_STEPS = [
  "route.auth_parse",
  "session.get_or_create",
  "context.build_prefix",
  "llm.call",
  "tool.execute",
  "artifact.persist_draft",
  "background.memory_review",
  "sse.flush",
] as const;

export type LogStep = (typeof LOG_STEPS)[number];

export interface RequestLogContext {
  traceId: string;
  sessionId: string;
  turnId?: string;
}

export interface TokenUsageFields {
  input?: number;
  output?: number;
  total?: number;
}

/** 每条 step 结束写入 pino 的字段（生产 log 最小集） */
export interface AgentStepLogFields {
  step: LogStep;
  stepId?: string;
  durationMs: number;
  success: boolean;
  error?: string;
  tokenUsage?: TokenUsageFields;
  costUsd?: number | null;
  model?: string;
  toolName?: string;
  chatMode?: string;
  /** 用户消息 SHA256 前 16 hex；生产 log 不记原文 */
  userMessageHash?: string;
  userMessageLen?: number;
  /** tool 输出摘要（已截断） */
  preview?: string;
  truncated?: boolean;
  /** 会话累计 token（sse.flush / llm.call 可选） */
  sessionTokenTotal?: number;
  /** 会话累计成本 USD（Pi stats 或自估） */
  sessionCostUsd?: number;
}

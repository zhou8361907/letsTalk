import type { AgentStepLogFields, LogStep, TokenUsageFields } from "./log-steps.js";

export interface TraceStepRecord extends AgentStepLogFields {
  at: string;
}

export interface TraceToolRecord {
  tool: string;
  stepId?: string;
  ok: boolean;
  durationMs: number;
  preview?: string;
  truncated?: boolean;
}

export interface TurnTraceMeta {
  turnId: string;
  chatMode: string;
  model?: string;
  userMessageHash: string;
  userMessageLen: number;
  turnTokenUsage?: TokenUsageFields;
  turnCostUsd?: number | null;
  sessionTokenTotal?: number;
  sessionCostUsd?: number;
  tools: TraceToolRecord[];
  success: boolean;
  error?: string;
}

/** 写入 traces/YYYY-MM-DD.jsonl 的回合摘要 */
export interface TraceRecord {
  at: string;
  traceId: string;
  sessionId: string;
  actorId?: string;
  actorDisplayName?: string;
  turnId?: string;
  chatMode?: string;
  model?: string;
  userMessageHash?: string;
  userMessageLen?: number;
  durationMs: number;
  success: boolean;
  error?: string;
  steps: TraceStepRecord[];
  tools: TraceToolRecord[];
  turnTokenUsage?: TokenUsageFields;
  turnCostUsd?: number | null;
  sessionTokenTotal?: number;
  sessionCostUsd?: number;
}

/** 写入 sessions/{sessionId}.jsonl 的累计账本 */
export interface SessionLedgerEntry {
  at: string;
  traceId: string;
  sessionId: string;
  turnId?: string;
  turnIndex: number;
  chatMode?: string;
  model?: string;
  turnCostUsd: number;
  turnTokenUsage?: TokenUsageFields;
  cumulativeCostUsd: number;
  cumulativeTokenUsage: TokenUsageFields;
  turnCount: number;
  success: boolean;
}

export type TraceSummaryStep = LogStep | "route.bundle_load";

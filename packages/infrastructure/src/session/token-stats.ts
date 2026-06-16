import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { TokenUsageFields } from "@lets-talk/infrastructure/logging";

export interface SessionTokenSnapshot {
  input: number;
  output: number;
  total: number;
  costUsd: number;
}

export function snapshotSessionTokens(session: AgentSession): SessionTokenSnapshot {
  const stats = session.getSessionStats();
  return {
    input: stats.tokens.input,
    output: stats.tokens.output,
    total: stats.tokens.total,
    costUsd: stats.cost,
  };
}

export function diffSessionTokens(
  after: SessionTokenSnapshot,
  before: SessionTokenSnapshot,
): TokenUsageFields {
  return {
    input: Math.max(0, after.input - before.input),
    output: Math.max(0, after.output - before.output),
    total: Math.max(0, after.total - before.total),
  };
}

export function diffSessionCostUsd(
  after: SessionTokenSnapshot,
  before: SessionTokenSnapshot,
): number {
  return Math.max(0, after.costUsd - before.costUsd);
}

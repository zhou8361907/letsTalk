import {
  DEFAULT_CONTEXT_BUDGET_THRESHOLDS,
  evaluateContextBudget,
  type ContextBudgetHint,
  type ContextBudgetThresholds,
  type ContextUsageLike,
} from "@lets-talk/shared-types";

function parseEnvPercent(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return fallback;
  return n;
}

/** 自定义工具单次返回字符软顶，默认 24k */
export function toolOutputCharLimit(): number {
  const raw = process.env.LETS_TALK_TOOL_OUTPUT_CHAR_LIMIT?.trim();
  if (!raw) return 24_576;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 4096) return 24_576;
  return Math.floor(n);
}

export function contextBudgetThresholds(): ContextBudgetThresholds {
  return {
    warnPercent: parseEnvPercent(
      "LETS_TALK_CONTEXT_WARN_PERCENT",
      DEFAULT_CONTEXT_BUDGET_THRESHOLDS.warnPercent,
    ),
    criticalPercent: parseEnvPercent(
      "LETS_TALK_CONTEXT_CRITICAL_PERCENT",
      DEFAULT_CONTEXT_BUDGET_THRESHOLDS.criticalPercent,
    ),
  };
}

export function evaluateContextBudgetFromEnv(
  usage: ContextUsageLike | null,
): ContextBudgetHint | null {
  return evaluateContextBudget(usage, contextBudgetThresholds());
}

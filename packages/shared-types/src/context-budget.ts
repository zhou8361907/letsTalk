/** 上下文占用提醒级别（DeepSeek 1M：以成本/延迟为主） */
export type ContextBudgetLevel = "warn" | "critical";

export interface ContextBudgetHint {
  level: ContextBudgetLevel;
  message: string;
}

export interface ContextUsageLike {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface ContextBudgetThresholds {
  /** 成本/延迟提醒，默认 50 */
  warnPercent: number;
  /** 触发自动压缩，默认 90 */
  criticalPercent: number;
}

export const DEFAULT_CONTEXT_BUDGET_THRESHOLDS: ContextBudgetThresholds = {
  warnPercent: 50,
  criticalPercent: 90,
};

const WARN_MESSAGE =
  "上下文已过半，单轮可能变慢、变贵。建议把稳定结论写入「记忆」，或减少无关 tool 探索。";

const CRITICAL_MESSAGE =
  "上下文已达 90%，将自动压缩较早对话；PRD 清单仍在右侧，记忆可在「记忆」中编辑。";

/** 根据 Pi 上下文占用估算生成 UI 提示 */
export function evaluateContextBudget(
  usage: ContextUsageLike | null | undefined,
  thresholds: ContextBudgetThresholds = DEFAULT_CONTEXT_BUDGET_THRESHOLDS,
): ContextBudgetHint | null {
  if (!usage || usage.contextWindow <= 0 || usage.percent == null) {
    return null;
  }
  if (usage.percent >= thresholds.criticalPercent) {
    return { level: "critical", message: CRITICAL_MESSAGE };
  }
  if (usage.percent >= thresholds.warnPercent) {
    return { level: "warn", message: WARN_MESSAGE };
  }
  return null;
}

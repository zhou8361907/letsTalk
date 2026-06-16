/**
 * 模型单价表（USD / 1M tokens）。
 * 调价只改此文件，不改 session / run-chat 逻辑。
 */

import type { TokenUsageFields } from "@lets-talk/infrastructure/logging";

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  /** 价格来源日期注释 */
  asOf: string;
}

/** key 与 Pi modelLabel 一致，如 deepseek/deepseek-chat */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  "deepseek/deepseek-chat": {
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    asOf: "2026-06-01",
  },
  "deepseek/deepseek-v4-flash": {
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    asOf: "2026-06-01",
  },
  "anthropic/claude-sonnet-4-20250514": {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    asOf: "2026-06-01",
  },
};

/**
 * 根据 token 用量估算 USD 成本。
 * input/output 缺失时返回 null（不做猜测）。
 */
export function estimateCostUsd(
  model: string,
  usage: TokenUsageFields,
): number | null {
  const price = MODEL_PRICING[model];
  if (!price) return null;
  const { input, output } = usage;
  if (input == null && output == null) return null;
  const inCost = ((input ?? 0) * price.inputPer1M) / 1_000_000;
  const outCost = ((output ?? 0) * price.outputPer1M) / 1_000_000;
  return inCost + outCost;
}

/** 仅有 context window 占用估算时，无法计费 */
export function usageFromContextTokens(
  total: number | null | undefined,
): TokenUsageFields | undefined {
  if (total == null) return undefined;
  return { total };
}

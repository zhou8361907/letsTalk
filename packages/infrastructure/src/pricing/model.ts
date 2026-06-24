/**
 * 模型单价表（RMB / 1M tokens）。
 * 调价只改此文件，不改 session / run-chat 逻辑。
 * 所有价格均为人民币（元），来源为 DeepSeek 官方定价。
 */

import type { TokenUsageFields } from "@lets-talk/infrastructure/logging";

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  /** 缓存命中单价（RMB / 1M tokens） */
  cacheReadPer1M: number;
  /** 价格来源日期注释 */
  asOf: string;
}

/**
 * DeepSeek USD → RMB 换算系数（市场汇率 ≈ 7.2）。
 * 用于将 Pi SDK 内部的 USD cost 转为人民币。
 * 略高于 DeepSeek 官方价（¥1/$0.14=7.14），确保不低估。
 */
export const DEEPSEEK_USD_TO_CNY = 7.2;

/** key 与 Pi modelLabel 一致，如 deepseek/deepseek-chat */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // ── DeepSeek V4 Flash 人民币计价（USD × 7.2 市场汇率，略取整确保不低估）──
  // 来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
  "deepseek/deepseek-chat": {
    inputPer1M: 1.01,
    outputPer1M: 2.02,
    cacheReadPer1M: 0.03,
    asOf: "2026-06-23",
  },
  "deepseek/deepseek-v4-flash": {
    inputPer1M: 1.01,
    outputPer1M: 2.02,
    cacheReadPer1M: 0.03,
    asOf: "2026-06-23",
  },
  "anthropic/claude-sonnet-4-20250514": {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheReadPer1M: 0.30,
    asOf: "2026-06-01",
  },
};

/**
 * 根据 token 用量估算成本（RMB）。
 * input/output 均缺失时返回 null。
 * 支持 cacheRead 缓存命中计费。
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
  const cacheCost = ((usage.cacheRead ?? 0) * price.cacheReadPer1M) / 1_000_000;
  return inCost + outCost + cacheCost;
}

/** 仅有 context window 占用估算时，无法计费 */
export function usageFromContextTokens(
  total: number | null | undefined,
): TokenUsageFields | undefined {
  if (total == null) return undefined;
  return { total };
}

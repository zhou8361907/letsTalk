import type { ContextUsageSnapshot } from "@lets-talk/shared-types";

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 顶栏展示：上下文 12.3k / 128k (9.6%) */
export function formatContextUsageLabel(usage: ContextUsageSnapshot | null): string {
  if (!usage || usage.contextWindow <= 0) {
    return "上下文 —";
  }
  if (usage.tokens == null) {
    return `上下文 — / ${formatTokenCount(usage.contextWindow)}`;
  }
  const pct =
    usage.percent != null
      ? ` (${usage.percent.toFixed(1)}%)`
      : "";
  return `上下文 ${formatTokenCount(usage.tokens)} / ${formatTokenCount(usage.contextWindow)}${pct}`;
}

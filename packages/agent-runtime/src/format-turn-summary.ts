import { formatDuration, shouldUseJsonLog } from "./format-agent-log.js";
import type { LogStep } from "./log-steps.js";
import type { TraceRecorder } from "./trace-recorder.js";
import type { TraceRecord, TraceStepRecord } from "./trace-types.js";

const TIMING_LABELS: Partial<Record<LogStep | "route.bundle_load", string>> = {
  "route.bundle_load": "模块",
  "route.auth_parse": "解析",
  "session.get_or_create": "会话",
  "context.build_prefix": "上下文",
  "llm.call": "LLM",
  "tool.execute": "工具",
  "sse.flush": "推送",
};

const ANSI = { dim: "\x1b[90m", cyan: "\x1b[36m", green: "\x1b[32m", reset: "\x1b[0m" };

function c(code: string, text: string): string {
  if (process.env.NO_COLOR?.trim() || process.env.LOG_COLOR === "0") return text;
  if (process.stdout.isTTY !== true) return text;
  return `${code}${text}${ANSI.reset}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function sumStepMs(steps: TraceStepRecord[], step: LogStep | "route.bundle_load"): number {
  return steps
    .filter((s) => s.step === step)
    .reduce((n, s) => n + s.durationMs, 0);
}

function formatTimingLine(steps: TraceStepRecord[]): string {
  const order: Array<LogStep | "route.bundle_load"> = [
    "route.bundle_load",
    "route.auth_parse",
    "session.get_or_create",
    "context.build_prefix",
    "llm.call",
    "tool.execute",
    "sse.flush",
  ];
  const parts: string[] = [];
  for (const step of order) {
    const ms = sumStepMs(steps, step);
    if (ms <= 0) continue;
    const label = TIMING_LABELS[step] ?? step;
    parts.push(`${label} ${formatDuration(ms)}`);
  }
  return parts.join(" · ") || "—";
}

function formatToolLine(tools: TraceRecord["tools"]): string {
  if (tools.length === 0) return "无";
  return tools
    .map((t) => {
      const mark = t.ok ? "" : " ✗";
      return `${t.tool}${mark} ${formatDuration(t.durationMs)}`;
    })
    .join(", ");
}

function formatTokenLine(record: TraceRecord): string {
  const u = record.turnTokenUsage;
  if (!u) return "—";
  const parts: string[] = [];
  if (u.input != null) parts.push(`in ${u.input.toLocaleString()}`);
  if (u.output != null) parts.push(`out ${u.output.toLocaleString()}`);
  if (record.sessionTokenTotal != null) {
    parts.push(`会话累计 ${record.sessionTokenTotal.toLocaleString()} tok`);
  }
  if (record.turnCostUsd != null) parts.push(`$${record.turnCostUsd.toFixed(4)}`);
  else if (record.sessionCostUsd != null) {
    parts.push(`会话 $${record.sessionCostUsd.toFixed(4)}`);
  }
  return parts.join(" · ") || "—";
}

/** dev 默认展示；LOG_VERBOSE=0 关闭；LOG_JSON=1 / 生产不打印 */
export function shouldShowTurnSummary(): boolean {
  const v = process.env.LOG_VERBOSE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (shouldUseJsonLog()) return false;
  return true;
}

export function formatTurnSummaryLines(
  record: TraceRecord,
  files?: { traceFile: string; sessionFile: string },
): string[] {
  const title = record.turnId
    ? `turn ${record.turnId.split("-").slice(0, 2).join("-")} · trace ${shortId(record.traceId)}`
    : `trace ${shortId(record.traceId)}`;
  const status = record.success ? c(ANSI.green, "ok") : "FAILED";
  const user = record.userMessageLen != null
    ? `用户 ${record.userMessageLen} 字`
    : "用户 —";
  const mode = [record.chatMode, record.model?.split("/").pop()].filter(Boolean).join(" · ");

  const lines = [
    c(ANSI.cyan, `┌─ ${title} ─ ${status}`),
    `│ ${user} · ${mode}`,
    `│ 耗时  ${formatTimingLine(record.steps)} · 合计 ${formatDuration(record.durationMs)}`,
    `│ Token ${formatTokenLine(record)}`,
    `│ 工具  ${formatToolLine(record.tools)}`,
  ];

  if (files) {
    const rel = (p: string) => p.replace(record.sessionId, "…" + record.sessionId.slice(-8));
    lines.push(
      `│ 索引  traces/${files.traceFile.split("/traces/").pop() ?? "…"}`,
      `│ 账本  sessions/${files.sessionFile.split("/sessions/").pop() ?? "…"}`,
    );
  }
  if (process.env.LETS_TALK_DEBUG?.trim() === "1") {
    lines.push(`│ 深潜  .agent/debug/${record.sessionId}/`);
  }
  lines.push(c(ANSI.cyan, "└" + "─".repeat(56)));
  return lines;
}

export function printTurnSummary(
  recorder: TraceRecorder,
  files?: { traceFile: string; sessionFile: string },
): void {
  if (!shouldShowTurnSummary()) return;
  const record = recorder.buildTraceRecord();
  for (const line of formatTurnSummaryLines(record, files)) {
    console.log(line);
  }
}

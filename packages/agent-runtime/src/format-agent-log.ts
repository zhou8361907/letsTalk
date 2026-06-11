import type { AgentStepLogFields, LogStep, RequestLogContext } from "./log-steps.js";

const STEP_LABELS: Record<LogStep, string> = {
  "route.auth_parse": "解析请求",
  "session.get_or_create": "加载会话",
  "context.build_prefix": "组装上下文",
  "llm.call": "LLM 调用",
  "tool.execute": "工具",
  "artifact.persist_draft": "保存清单",
  "background.memory_review": "记忆审查",
  "sse.flush": "流结束",
};

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function colorsEnabled(): boolean {
  if (process.env.NO_COLOR?.trim()) return false;
  if (process.env.LOG_COLOR === "0") return false;
  return process.stdout.isTTY === true;
}

function c(code: string, text: string): string {
  return colorsEnabled() ? `${code}${text}${ANSI.reset}` : text;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function shortModel(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

export function formatDuration(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function formatTokenUsage(fields: AgentStepLogFields): string {
  const parts: string[] = [];
  const u = fields.tokenUsage;
  if (!u) return "";
  if (u.input != null) parts.push(`in ${u.input.toLocaleString()}`);
  if (u.output != null) parts.push(`out ${u.output.toLocaleString()}`);
  if (u.total != null && u.input == null && u.output == null) {
    parts.push(`ctx ${u.total.toLocaleString()}`);
  }
  if (fields.sessionTokenTotal != null) {
    parts.push(`session ${fields.sessionTokenTotal.toLocaleString()} tok`);
  }
  if (fields.costUsd != null) parts.push(`$${fields.costUsd.toFixed(4)}`);
  else if (fields.sessionCostUsd != null) {
    parts.push(`session $${fields.sessionCostUsd.toFixed(4)}`);
  }
  return parts.join(" · ");
}

/** 单行摘要（pino msg 字段 & 终端 human 模式共用） */
export function formatStepMessage(fields: AgentStepLogFields): string {
  const parts: string[] = [];
  if (fields.chatMode) parts.push(fields.chatMode);
  if (fields.model) parts.push(shortModel(fields.model));
  if (fields.toolName) parts.push(fields.toolName);
  if (fields.stepId) parts.push(fields.stepId);
  const tokens = formatTokenUsage(fields);
  if (tokens) parts.push(tokens);
  if (fields.truncated) parts.push("truncated");
  if (fields.error) parts.push(fields.error);
  return parts.filter(Boolean).join(" · ") || STEP_LABELS[fields.step];
}

export function formatPrettyLogLine(
  ctx: RequestLogContext,
  fields: AgentStepLogFields,
): string {
  const time = new Date().toISOString().slice(11, 19);
  const label = STEP_LABELS[fields.step];
  const icon = fields.success ? c(ANSI.green, "✓") : c(ANSI.red, "✗");
  const stepCol = c(ANSI.cyan, label.padEnd(8, " "));
  const dur = formatDuration(fields.durationMs).padStart(7, " ");
  const detail = formatStepMessage(fields);

  const idParts: string[] = [];
  if (fields.step === "route.auth_parse") {
    idParts.push(`trace ${shortId(ctx.traceId)}`);
    idParts.push(`session ${shortId(ctx.sessionId)}`);
  } else if (fields.step === "sse.flush") {
    idParts.push(`trace ${shortId(ctx.traceId)}`);
  }
  const idSuffix =
    idParts.length > 0 ? c(ANSI.dim, ` · ${idParts.join(" · ")}`) : "";
  const detailSuffix = detail ? c(ANSI.dim, ` · ${detail}`) : "";

  return `${c(ANSI.dim, "letsTalk")} ${c(ANSI.dim, time)} ${icon} ${stepCol} ${dur}${detailSuffix}${idSuffix}`;
}

export function shouldUseJsonLog(): boolean {
  const v = process.env.LOG_JSON?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

/**
 * 生产结构化日志（pino → stdout JSON）。
 * 与 debug-logger.ts（LETS_TALK_DEBUG artifact）分工：本模块始终可用，只记摘要字段。
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import {
  formatPrettyLogLine,
  formatStepMessage,
  shouldUseJsonLog,
} from "./format-agent-log.js";
import type { AgentStepLogFields, RequestLogContext } from "./log-steps.js";

const rootLogger = pino({
  name: "letsTalk",
  level: process.env.LOG_LEVEL?.trim() || "info",
});

export type { RequestLogContext } from "./log-steps.js";

export function createTraceId(): string {
  return randomUUID();
}

export function createRequestLogger(ctx: RequestLogContext): pino.Logger {
  return rootLogger.child({
    traceId: ctx.traceId,
    sessionId: ctx.sessionId,
    ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
  });
}

export function logAgentStep(
  logger: pino.Logger,
  ctx: RequestLogContext,
  fields: AgentStepLogFields,
): void {
  const message = formatStepMessage(fields);
  if (shouldUseJsonLog()) {
    if (fields.success) logger.info(fields, message);
    else logger.error(fields, message);
    return;
  }
  const line = formatPrettyLogLine(ctx, fields);
  if (fields.success) console.log(line);
  else console.error(line);
}

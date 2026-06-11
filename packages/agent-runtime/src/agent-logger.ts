/**
 * 生产结构化日志（pino → stdout JSON）。
 * 与 debug-logger.ts（LETS_TALK_DEBUG artifact）分工：本模块始终可用，只记摘要字段。
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import type { AgentStepLogFields } from "./log-steps.js";

const rootLogger = pino({
  name: "letsTalk",
  level: process.env.LOG_LEVEL?.trim() || "info",
});

export interface RequestLogContext {
  traceId: string;
  sessionId: string;
  turnId?: string;
}

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
  fields: AgentStepLogFields,
  msg?: string,
): void {
  const message = msg ?? fields.step;
  if (fields.success) {
    logger.info(fields, message);
  } else {
    logger.error(fields, message);
  }
}

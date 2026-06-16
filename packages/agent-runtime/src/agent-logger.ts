/**
 * 生产结构化日志（pino → stdout JSON）。
 *
 * 已迁移至 @lets-talk/infrastructure/logging
 * 本文件保留用于向后兼容。
 */

export {
  createTraceId,
  createRequestLogger,
  logAgentStep,
} from "@lets-talk/infrastructure/logging";
export type { RequestLogContext } from "@lets-talk/infrastructure/logging";
/**
 * Trace 持久化存储。
 *
 * 已迁移至 @lets-talk/infrastructure/tracing
 * 本文件保留用于向后兼容。
 */

export {
  persistTraceRecord,
  findTraceById,
  listSessionTraces,
  summarizeDailySessionCosts,
} from "@lets-talk/infrastructure/tracing";
/**
 * 调试日志：需求清单 + 每轮完整请求上下文 / 响应
 *
 * 已迁移至 @lets-talk/infrastructure/debug
 * 本文件保留用于向后兼容。
 */

export {
  isDebugLoggingEnabled,
  nextTurnId,
  setActiveTurnId,
  getActiveTurnId,
  logTurnRequest,
  logTurnResponse,
  logDraftUpdate,
  cleanupSessionDebug,
  type DebugToolRecord,
} from "@lets-talk/infrastructure/debug";
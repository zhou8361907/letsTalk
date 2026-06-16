/**
 * 需求清单工具 I/O 日志（仅 get / update 两个 Pi 工具）
 *
 * 已迁移至 @lets-talk/infrastructure/debug
 * 本文件保留用于向后兼容。
 */

export {
  isDraftIoLogEnabled,
  logDraftIo,
  type DraftIoLogPayload,
  type DraftIoOp,
} from "@lets-talk/infrastructure/debug";
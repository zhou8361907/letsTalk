/**
 * 跑一轮对话，并把 Pi 事件转成 SSE 推给浏览器。
 *
 * 已迁移至 ./core/run-chat.ts
 * 本文件保留用于向后兼容。
 */

export {
  runChat,
  getWorkspaceRoot,
  queryContextUsage,
  disposePiSession,
  type RunChatOptions,
} from "./core/run-chat.js";
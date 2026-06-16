// Debug Infrastructure

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
} from "./logger.js";

export {
  isDraftIoLogEnabled,
  logDraftIo,
  type DraftIoLogPayload,
  type DraftIoOp,
} from "./draft-io-log.js";
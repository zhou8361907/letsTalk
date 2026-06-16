// agent-runtime 对外只暴露这几个方法，保持简单

export {
  createPiSession,
  type CreatePiSessionOptions,
  type PiSessionHandle,
} from "./core/create-session.js";
export {
  getContextUsageForSession,
  snapshotContextUsage,
} from "./context-usage.js";
export {
  findTurnIdByUserMessage,
  loadSessionSystemPromptFromDisk,
  loadSessionTurnDebugFromDisk,
  mergeTurnDebugSnapshots,
  type LoadSessionTurnDebugResult,
  type SessionTurnDebugSource,
} from "./session-turn-debug.js";
export {
  captureSystemPromptFromLoader,
  formatCombinedSystemPrompt,
  resolveSystemPromptSnapshot,
} from "./system-prompt-snapshot.js";
export {
  runChat,
  getWorkspaceRoot,
  queryContextUsage,
  disposePiSession,
  type RunChatOptions,
} from "./core/run-chat.js";
export { generateDevAppendix } from "./generate-dev-appendix.js";
export {
  isDevAppendixJobRunning,
  runDevAppendixExportJob,
} from "./dev-appendix-job.js";
export { summarizeConversationTitle } from "./summarize-conversation-title.js";

// === Re-export for backward compatibility ===

// Domain - Requirement
export {
  emptyDraft,
  getDraft,
  setDraft,
  ensureDraft,
  getDraftRevision,
  initDraftRevision,
  clearDraftRevision,
  validateDraftUpdateInput,
  applyDraftUpdate,
  buildAgentActions,
  createRequirementDraftTools,
  type DraftItemInput,
  type ApplyDraftInput,
} from "@lets-talk/domain/requirement";

// Domain - Turn
export {
  isTurnDebugSseEnabled,
  readPiJsonlTail,
  readPiJsonlFull,
  buildTurnDebugSnapshot,
} from "@lets-talk/domain/turn";

// Domain - Anchor
export {
  listVueAnchors,
  anchorExists,
  readAnchorPreview,
} from "@lets-talk/domain/anchor";

// Infrastructure - Debug
export {
  isDebugLoggingEnabled,
  nextTurnId,
  setActiveTurnId,
  getActiveTurnId,
  logTurnRequest,
  logTurnResponse,
  logDraftUpdate,
  cleanupSessionDebug,
  isDraftIoLogEnabled,
  logDraftIo,
  type DraftIoLogPayload,
  type DraftIoOp,
  type DebugToolRecord,
} from "@lets-talk/infrastructure/debug";

// Infrastructure - Format
export { formatDuration, formatStepMessage, formatPrettyLogLine, shouldUseJsonLog } from "@lets-talk/infrastructure/format";
export { printTurnSummary, formatTurnSummaryLines } from "@lets-talk/infrastructure/format";

// Infrastructure - Logging
export { createRequestLogger, createTraceId, logAgentStep } from "@lets-talk/infrastructure/logging";
export type { AgentStepLogFields, LogStep } from "@lets-talk/infrastructure/logging";
export { hashText, truncateForProdLog } from "@lets-talk/infrastructure/logging";

// Infrastructure - Pricing
export { estimateCostUsd, MODEL_PRICING } from "@lets-talk/infrastructure/pricing";

// Infrastructure - Session
export { maybeCompactSessionIfNeeded, shouldCompactSession, syncSessionPointer, clearSessionContext, getSessionRevision, snapshotSessionTokens, diffSessionTokens, diffSessionCostUsd } from "@lets-talk/infrastructure/session";

// Infrastructure - Tracing
export { TraceRecorder, finalizeTrace, findTraceById, listSessionTraces, summarizeDailySessionCosts, toolRecordsFromSteps } from "@lets-talk/infrastructure/tracing";

// buildTurnPromptPrefix 保留在原位置（暂未迁移）
export { buildTurnPromptPrefix } from "./turn-prefix.js";
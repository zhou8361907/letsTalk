/**
 * 前后端共用类型契约。
 *
 * 约定：
 * - Web API 请求/响应、SSE 事件、持久化 JSON 均使用此包
 * - 改字段时需同步检查 apps/web 与 packages/agent-runtime
 */

import type { AgentAnchor } from "./anchor.js";

export type { AgentAnchor } from "./anchor.js";
export type { Actor } from "./actor.js";
export {
  ACTOR_ID_HEADER,
  ACTOR_NAME_HEADER,
  ANONYMOUS_ACTOR_ID,
} from "./actor.js";
export type { MenuUrlKind, ParsedMenuUrl } from "./parse-menu-url.js";
export { EXPORT_PRIMARY_APPENDIX_DIVIDER } from "./export-constants.js";
export type {
  ConversationRecord,
  ConversationSummary,
  DevAppendixExportJob,
  TranscriptItem,
} from "./conversation.js";
export type {
  TurnDebugSnapshot,
  TurnDebugToolRecord,
} from "./turn-debug.js";
export type {
  SystemPromptFilePart,
  SystemPromptSnapshot,
} from "./system-prompt-debug.js";
export type {
  AgentAction,
  AgentActionKind,
  RequirementDraftState,
  RequirementField,
  RequirementFieldKey,
  RequirementFieldStatus,
  RequirementItem,
  RequirementItemStatus,
  RequirementItemType,
} from "./requirement-draft.js";
export {
  canMarkReadyToFinalize,
  formatDraftConventionGapsLine,
  itemToBeNeedsConfirmation,
} from "./requirement-convention.js";
export {
  DEFAULT_CONTEXT_BUDGET_THRESHOLDS,
  evaluateContextBudget,
  type ContextBudgetHint,
  type ContextBudgetLevel,
  type ContextBudgetThresholds,
  type ContextUsageLike,
} from "./context-budget.js";

import type { RequirementFieldKey } from "./requirement-draft.js";

/** 需求字段 key → 中文标签，供 UI 与 Agent 工具描述共用 */
export const REQUIREMENT_FIELD_LABELS: Record<RequirementFieldKey, string> = {
  page: "在哪个页面",
  control: "改哪里",
  province: "适用范围",
  asIs: "现在怎样",
  toBe: "希望改成（流程用编号步骤）",
  table: "涉及的数据",
  configTables: "依赖的配置",
  actions: "有哪些操作",
  acceptance: "怎么验收",
  codePaths: "代码位置（仅研发）",
};

/**
 * 对话模式。
 * - explore：研发探索代码，无需求草稿板
 * - prd：产品经理写需求，启用 update_requirement_draft 与 RequirementCanvas
 */
export type ChatMode = "explore" | "prd";

/**
 * 模型上下文窗口占用快照。
 * 数值来自 Pi `AgentSession.getContextUsage()`，tokens 为估算值可能为 null。
 */
export interface ContextUsageSnapshot {
  tokens: number | null;
  contextWindow: number;
  /** 已用百分比 0–100；无法估算时为 null */
  percent: number | null;
}

/**
 * 服务端 → 浏览器 的 SSE 事件联合类型。
 *  wire 格式：`data: ${JSON.stringify(event)}\n\n`（见 formatSseData）
 */
export type SseEvent =
  /** 本轮开始，告知 sessionId、cwd、模型名；traceId 供排障关联 prod log */
  | { type: "session"; sessionId: string; cwd: string; model: string; traceId?: string }
  /** 上下文 token 占用更新（prompt 前后各推一次） */
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  /** 上下文占用提醒（默认 50% 提示，90% 触发压缩） */
  | {
      type: "context_budget_hint";
      level: import("./context-budget.js").ContextBudgetLevel;
      message: string;
    }
  /** Pi 会话上下文压缩（percent≥90% 时在 prompt 前自动执行） */
  | {
      type: "context_compaction";
      phase: "start" | "end";
      ok?: boolean;
      tokensBefore?: number;
      message?: string;
    }
  /** 助手回复增量文本 */
  | { type: "assistant_delta"; text: string }
  /** 工具开始执行 */
  | { type: "tool_start"; callId: string; tool: string; argsSummary?: string }
  /** 工具执行结束；preview 截断至 2000 字符 */
  | { type: "tool_output"; callId: string; ok: boolean; preview: string; durationMs: number }
  /** 本轮 JIT 上下文摘要（不含完整 XML，仅 meta） */
  | {
      type: "context";
      mode: "explore" | "focused";
      anchorRef: string | null;
      previewLines: number;
      /** 本轮 user 前缀含 <core_memory_refresh>（M0 已更新） */
      m0Refreshed?: boolean;
    }
  /** M0 磁盘更新后注入前缀（可与 context 同轮） */
  | { type: "memory_refreshed"; source: "prefix" }
  /** 本轮正常结束 */
  | { type: "turn_end" }
  /** 调试：本回合发给 LLM 的真实内容与 Pi jsonl 尾部（非 production 或 LETS_TALK_TURN_DEBUG） */
  | { type: "turn_debug"; snapshot: import("./turn-debug.js").TurnDebugSnapshot }
  /** PRD 模式：需求草稿板全量状态 */
  | { type: "requirement_state"; draft: import("./requirement-draft.js").RequirementDraftState }
  /** PRD 模式：可点击的 Agent 建议动作 */
  | { type: "agent_actions"; actions: import("./requirement-draft.js").AgentAction[] }
  /** 异常；HTTP 仍 200，由前端展示 message */
  | { type: "error"; code: string; message: string };

/** POST /api/agent/chat/stream 的请求体 */
export interface ChatStreamRequest {
  /**  letsTalk 会话 id，对应 .agent/conversations/{id}.json */
  sessionId: string;
  /** 用户输入；服务端会 prepend JIT 上下文，不会改写此字段的持久化 */
  message: string;
  /** 省略或 null → 全库 explore；有值 → focused 并注入 anchor_preview */
  anchor?: AgentAnchor | null;
  /** 默认 explore */
  chatMode?: ChatMode;
}

/** 格式化成 SSE 一行：data: {...}\n\n */
export function formatSseData(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

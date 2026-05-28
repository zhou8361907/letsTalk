/**
 * 前后端共用的类型（SSE 事件、聊天请求体、对话记录）
 */

import type { AgentAnchor } from "./anchor.js";

export type { AgentAnchor } from "./anchor.js";
export type { MenuUrlKind, ParsedMenuUrl } from "./parse-menu-url.js";
export { EXPORT_PRIMARY_APPENDIX_DIVIDER } from "./export-constants.js";
export type {
  ConversationRecord,
  ConversationSummary,
  TranscriptItem,
} from "./conversation.js";
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

import type { RequirementFieldKey } from "./requirement-draft.js";

export const REQUIREMENT_FIELD_LABELS: Record<RequirementFieldKey, string> = {
  page: "在哪个页面",
  control: "改哪里",
  province: "适用范围",
  asIs: "现在怎样",
  toBe: "希望改成",
  table: "涉及的数据",
  configTables: "依赖的配置",
  actions: "有哪些操作",
  acceptance: "怎么验收",
  codePaths: "代码位置（仅研发）",
};
/** 对话模式：研发探索 vs 产品经理写需求 */
export type ChatMode = "explore" | "prd";

/** Pi 上下文占用（与 AgentSession.getContextUsage 一致） */
export interface ContextUsageSnapshot {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

/** 浏览器 ← 服务端 的 SSE 事件 */
export type SseEvent =
  | { type: "session"; sessionId: string; cwd: string; model: string }
  | { type: "context_usage"; tokens: number | null; contextWindow: number; percent: number | null }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_start"; callId: string; tool: string; argsSummary?: string }
  | { type: "tool_output"; callId: string; ok: boolean; preview: string; durationMs: number }
  | {
      type: "context";
      mode: "explore" | "focused";
      anchorRef: string | null;
      previewLines: number;
    }
  | { type: "turn_end" }
  | { type: "requirement_state"; draft: import("./requirement-draft.js").RequirementDraftState }
  | { type: "agent_actions"; actions: import("./requirement-draft.js").AgentAction[] }
  | { type: "error"; code: string; message: string };

/** POST /api/agent/chat/stream 的请求体 */
export interface ChatStreamRequest {
  sessionId: string;
  message: string;
  /** null / 省略 = 全库探索模式 */
  anchor?: AgentAnchor | null;
  /** 默认 explore；prd = 写需求文档模式 */
  chatMode?: ChatMode;
}

/** 格式化成 SSE 一行：data: {...}\n\n */
export function formatSseData(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

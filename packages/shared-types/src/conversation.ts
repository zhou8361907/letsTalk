import type { AgentAnchor } from "./anchor.js";
import type { RequirementDraftState } from "./requirement-draft.js";

/**
 * 对话 Transcript 中的一条记录。
 * 与 `apps/web/app/page.tsx` 渲染结构一致，序列化到 `.agent/conversations/{id}.json`。
 */
export type TranscriptItem =
  /** 用户发送的原始问题（不含 JIT 上下文前缀） */
  | { kind: "user"; text: string }
  /** 助手最终回复全文（流式 delta 在 UI 侧拼接后写入） */
  | { kind: "assistant"; text: string }
  /** 单次工具调用结果，对应 SSE 的 tool_start + tool_output */
  | { kind: "tool"; tool: string; preview: string; ok: boolean }
  /** 本轮注入的 JIT 上下文摘要（便于调试「Agent 看到了什么」） */
  | {
      kind: "context";
      mode: string;
      anchorRef: string | null;
      previewLines: number;
    };

/** 会话列表项（不含 Transcript 正文，减轻列表接口体积） */
export interface ConversationSummary {
  /** UUID，同时作为 Pi jsonl 文件名 */
  sessionId: string;
  /** 取自首条用户消息，最长 40 字 */
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 完整会话持久化结构。
 * 路径：`.agent/conversations/{sessionId}.json`
 */
export interface ConversationRecord extends ConversationSummary {
  /** 当前绑定的页面/菜单锚点；null 表示全库探索 */
  anchor: AgentAnchor | null;
  /** UI Transcript 条目，刷新后可恢复展示 */
  items: TranscriptItem[];
  /**
   * Pi 原生多轮上下文文件，相对 WORKSPACE_ROOT。
   * 默认 `.agent/conversations/pi/{sessionId}.jsonl`
   */
  piSessionFile?: string | null;
  /** explore=研发查代码；prd=产品经理写需求 */
  chatMode?: "explore" | "prd";
  /** PRD 模式下的需求草稿板快照 */
  requirementDraft?: RequirementDraftState | null;
}

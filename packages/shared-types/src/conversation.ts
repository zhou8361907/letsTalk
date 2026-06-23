import type { AgentAnchor } from "./anchor.js";
import type { RequirementDraftState } from "./requirement-draft.js";
import type { ProductLineId } from "./product-line.js";

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
      m0Refreshed?: boolean;
    }
  /** 后台生成的导出物（如含研发附录的完整文档） */
  | {
      kind: "export_ready";
      exportKind: "dev_appendix";
      label: string;
      filename: string;
      markdown: string;
      completedAt: string;
    };

/** 研发附录后台导出状态（持久化在会话 JSON） */
export interface DevAppendixExportJob {
  status: "idle" | "running" | "done" | "failed";
  startedAt?: string;
  completedAt?: string;
  primaryMarkdown?: string;
  appendixMarkdown?: string;
  mergedMarkdown?: string;
  filename?: string;
  error?: string;
}

/** 会话列表项（不含 Transcript 正文，减轻列表接口体积） */
export interface ConversationSummary {
  /** UUID，同时作为 Pi jsonl 文件名 */
  sessionId: string;
  /** 取自首条用户消息，最长 40 字 */
  title: string;
  createdAt: string;
  updatedAt: string;
  /** 归属 Actor；缺省视为匿名用户（迁移前会话） */
  ownerActorId?: string;
  ownerDisplayName?: string;
  /** 累计对话花费（USD） */
  totalCostUsd?: number;
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
  /** explore=研发查代码；prd=产品经理写需求；qa=测试辅助 */
  chatMode?: "explore" | "prd" | "qa";
  /** PRD 模式下的需求草稿板快照 */
  requirementDraft?: RequirementDraftState | null;
  /** 草稿修订号（每次 update_requirement_draft 递增），用作乐观锁 */
  draftRevision?: number;
  /** 会话指针修订号（chatMode 切换时递增），用于上下文前缀去重 */
  pointerRevision?: number;
  /** 当前 PRD 阶段：exploring | drafting | confirming | ready_to_finalize | finalized */
  currentTask?: string;
  /** 产品线：yibao / shebao */
  productLine?: ProductLineId;
  /** 用户手动重命名后为 true，save 时不再用首条消息覆盖标题 */
  titleLocked?: boolean;
  /** 含研发附录的后台导出任务（最近一次） */
  devAppendixExport?: DevAppendixExportJob | null;
  /** 归属 Actor id（anon 或命名用户 uuid） */
  ownerActorId?: string;
  /** 列表展示用 */
  ownerDisplayName?: string;
}

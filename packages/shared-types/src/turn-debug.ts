import type { AgentAnchor } from "./anchor.js";
import type { SystemPromptSnapshot } from "./system-prompt-debug.js";

export type {
  SystemPromptFilePart,
  SystemPromptSnapshot,
} from "./system-prompt-debug.js";

/** 单轮调试快照（SSE turn_debug · 调试弹窗） */
export interface TurnDebugToolRecord {
  tool: string;
  ok?: boolean;
  preview: string;
}

export interface TurnDebugSnapshot {
  turnId: string;
  at: string;
  chatMode: string;
  anchor: AgentAnchor | null;
  /** 用户输入框原始文本 */
  userMessage: string;
  /** JIT 前缀（context / memory / draft 摘要） */
  contextPrefix: string;
  /** 实际传入 session.prompt() 的 user 文本 */
  promptUserText: string;
  assistantText: string;
  tools: TurnDebugToolRecord[];
  contextUsage: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  } | null;
  /** 相对 WORKSPACE_ROOT */
  piSessionFile: string | null;
  /** Pi jsonl 尾部（可能截断） */
  piJsonlTail: string | null;
  piJsonlTruncated: boolean;
  piJsonlTotalBytes: number;
  /** 本轮 Pi 会话创建时冻结的 system（AGENTS.md + append） */
  systemPrompt?: SystemPromptSnapshot | null;
  /** 本轮使用的模型 */
  modelLabel?: string | null;
  /** 本轮注册的工具名 */
  activeTools?: string[];
}

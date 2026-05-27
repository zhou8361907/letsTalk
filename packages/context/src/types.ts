import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";

/** 每轮 prompt 前组装的 JIT 上下文 */
export interface AgentContext {
  version: "1";
  workspace_root: string;
  anchor: AgentAnchor | null;
  arch_rules: string;
  /** 锚点相关：全库 / 聚焦某页 */
  mode: "explore" | "focused";
  /** 对话目的：研发探索 / 产品经理写需求 */
  chat_mode: ChatMode;
  anchor_preview_content?: string;
  memory_directory_hint?: string;
  /** 写需求模式：PM 守则 + 模板摘要 */
  pm_rules?: string;
  prd_template_outline?: string;
  hints_directory_hint?: string;
}

import type { WorkspaceLayout } from "./workspace-paths.js";

export interface BuildAgentContextInput {
  workspaceRoot?: string;
  anchor?: AgentAnchor | null;
  layout?: WorkspaceLayout;
  /** 预览行数，默认 150 */
  previewLines?: number;
  /** 默认 explore */
  chatMode?: ChatMode;
}

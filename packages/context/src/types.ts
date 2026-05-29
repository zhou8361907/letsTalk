import type { AgentAnchor, ChatMode } from "@lets-talk/shared-types";

/**
 * 每轮 `session.prompt` 前组装的 JIT（Just-In-Time）上下文。
 * 由 buildAgentContext 生成，formatAgentContextBlock 格式化为 XML 前缀。
 *
 * 注意：此处只给「导航信息」，不替 Agent 执行 grep/read。
 */
export interface AgentContext {
  version: "1";
  /** WORKSPACE_ROOT 绝对路径 */
  workspace_root: string;
  /** 校验后的锚点；文件不存在时会被置 null */
  anchor: AgentAnchor | null;
  /** AGENTS.md + 前后端目录说明，截断至约 1500 字 */
  arch_rules: string;
  /** 有锚点=focused，无锚点=explore */
  mode: "explore" | "focused";
  chat_mode: ChatMode;
  /** 文件锚点：文件头 N 行；菜单锚点：面包屑与 grep 提示 */
  anchor_preview_content?: string;
  /** memory 工具开启时：.agent/memory 目录说明 */
  memory_directory_hint?: string;
  /** chat_mode=prd 时注入的 PM 写作守则 */
  pm_rules?: string;
  prd_template_outline?: string;
  /** .agent/hints/ 下业务线索文件列表（仅供参考） */
  hints_directory_hint?: string;
  /** 当前需求清单文本快照，供 Agent 增量 update_requirement_draft */
  requirement_draft_snapshot?: string;
}

import type { WorkspaceLayout } from "./workspace-paths.js";

/** buildAgentContext 的输入；各字段均可选，有合理默认 */
export interface BuildAgentContextInput {
  workspaceRoot?: string;
  anchor?: AgentAnchor | null;
  layout?: WorkspaceLayout;
  /** 文件锚点预览行数，默认 150 */
  previewLines?: number;
  chatMode?: ChatMode;
  /** prd 模式必填：内存中的 RequirementDraftState */
  requirementDraft?: import("@lets-talk/shared-types").RequirementDraftState | null;
}

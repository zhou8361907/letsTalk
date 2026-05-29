/**
 * PM「写需求」模式的数据模型。
 *
 * Agent 通过工具 `update_requirement_draft` 更新；
 * UI 通过 SSE `requirement_state` / `agent_actions` 同步；
 * 持久化在 `ConversationRecord.requirementDraft`。
 */

/** 需求条目类型：改现有 / 新增 / 尚不确定 */
export type RequirementItemType = "modify" | "add" | "unknown";

/**
 * 单条需求的整体状态。
 * - draft：信息不全，仍在对话中补充
 * - ready：字段齐全，可导出
 * - blocked：有 blockingQuestion 待 PM 回答
 * - conflict：字段间矛盾，需人工澄清
 */
export type RequirementItemStatus = "draft" | "ready" | "blocked" | "conflict";

/** 单个字段的填写质量 */
export type RequirementFieldStatus = "ok" | "missing" | "pending" | "conflict";

/**
 * 标准需求字段 key。
 * PM 面向字段用业务语言；`codePaths` 仅供研发附录，勿写入 page/control 等。
 */
export type RequirementFieldKey =
  | "page" // 在哪个页面
  | "control" // 改哪里（按钮、字段、流程节点…）
  | "province" // 适用范围（省分/全局）
  | "asIs" // 现在怎样
  | "toBe" // 希望改成
  | "table" // 涉及的数据表/实体
  | "configTables" // 依赖的配置表
  | "actions" // 用户可执行的操作
  | "acceptance" // 验收标准
  | "codePaths"; // 代码位置（仅研发，PM 字段禁用技术术语）

/** 需求条目中一个具名字段及其填写状态 */
export interface RequirementField {
  key: RequirementFieldKey | string;
  /** 中文展示名，通常来自 REQUIREMENT_FIELD_LABELS */
  label: string;
  value: string;
  status: RequirementFieldStatus;
}

/** 一条可独立验收的需求（PM 视角的一句话 + 结构化字段） */
export interface RequirementItem {
  /** 稳定 id；Agent 更新时必须带上，避免重复新建条目 */
  id: string;
  title: string;
  type: RequirementItemType;
  status: RequirementItemStatus;
  fields: RequirementField[];
}

/**
 * 单个会话的需求草稿板完整状态。
 * version 固定为 1，便于将来迁移。
 */
export interface RequirementDraftState {
  version: 1;
  updatedAt: string;
  /** 创建草稿时绑定的锚点 ref，可与 ConversationRecord.anchor 对齐 */
  anchorRef: string | null;
  items: RequirementItem[];
  /** 待 PM 或业务方确认的开放问题列表 */
  openQuestions: string[];
  /** 当前阻断定稿的单一问题（UI 最多突出展示 1 条） */
  blockingQuestion: string | null;
  /** true 表示 Agent 认为可以导出 PRD */
  readyToFinalize: boolean;
}

/** 右侧画布底部 Agent 建议动作的类型 */
export type AgentActionKind = "finalize_with_blast" | "finalize_skip_blast";

/** UI 可点击的 Agent 建议动作（如「导出 PRD」） */
export interface AgentAction {
  id: string;
  label: string;
  kind: AgentActionKind;
  disabled?: boolean;
  title?: string;
}

/** 需求草稿板（PM 助手 M1） */

export type RequirementItemType = "modify" | "add" | "unknown";

export type RequirementItemStatus = "draft" | "ready" | "blocked" | "conflict";

export type RequirementFieldStatus = "ok" | "missing" | "pending" | "conflict";

/** 单条需求的标准字段 key */
export type RequirementFieldKey =
  | "page"
  | "control"
  | "province"
  | "asIs"
  | "toBe"
  | "table"
  | "configTables"
  | "actions"
  | "acceptance"
  | "codePaths";

export interface RequirementField {
  key: RequirementFieldKey | string;
  label: string;
  value: string;
  status: RequirementFieldStatus;
}

export interface RequirementItem {
  id: string;
  title: string;
  type: RequirementItemType;
  status: RequirementItemStatus;
  fields: RequirementField[];
}

export interface RequirementDraftState {
  version: 1;
  updatedAt: string;
  anchorRef: string | null;
  items: RequirementItem[];
  openQuestions: string[];
  /** 对话中最多展示的 1 个阻断性问题 */
  blockingQuestion: string | null;
  readyToFinalize: boolean;
}

export type AgentActionKind = "finalize_with_blast" | "finalize_skip_blast";

export interface AgentAction {
  id: string;
  label: string;
  kind: AgentActionKind;
  disabled?: boolean;
  title?: string;
}

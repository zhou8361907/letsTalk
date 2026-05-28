import type { AgentAction, RequirementDraftState } from "@lets-talk/shared-types";

/** 与 agent-runtime buildAgentActions 保持一致 */
export function buildAgentActionsFromDraft(
  draft: RequirementDraftState | null,
): AgentAction[] {
  if (!draft?.readyToFinalize || draft.items.length === 0) {
    return [];
  }
  return [
    {
      id: "finalize_blast",
      label: "生成说明（含影响面分析）",
      kind: "finalize_with_blast",
      disabled: true,
      title: "即将支持，可先导出说明文档",
    },
    {
      id: "finalize_skip",
      label: "先生成一版说明文档",
      kind: "finalize_skip_blast",
      disabled: false,
    },
  ];
}

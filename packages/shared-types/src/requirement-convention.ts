/**
 * 需求「最小公约」纯函数（无 Node 依赖，可供 Web 客户端与 Agent 共用）。
 */

import type { RequirementDraftState, RequirementItem } from "./requirement-draft.js";

function fieldValue(item: RequirementItem, key: string): string {
  return item.fields.find((f) => f.key === key)?.value.trim() ?? "";
}

/** toBe 含 Agent 未核实规则（待确认 / pending） */
export function itemToBeNeedsConfirmation(item: RequirementItem): boolean {
  const toBeField = item.fields.find((f) => f.key === "toBe");
  const toBe = toBeField?.value.trim() ?? "";
  if (!toBe) return false;
  if (toBeField?.status === "pending") return true;
  return /待确认|待定|TBD/i.test(toBe);
}

/** 清单是否满足「可标 readyToFinalize」的公约（不修改 draft，只读） */
export function canMarkReadyToFinalize(
  draft: RequirementDraftState | null | undefined,
): boolean {
  if (!draft?.items.length) return false;
  if (draft.blockingQuestion?.trim()) return false;
  for (const item of draft.items) {
    if (itemToBeNeedsConfirmation(item)) return false;
    if (!fieldValue(item, "toBe") || !fieldValue(item, "acceptance")) {
      return false;
    }
  }
  return true;
}

/** 供 prefix 摘要：公约缺口一行 */
export function formatDraftConventionGapsLine(
  draft: RequirementDraftState | null | undefined,
): string {
  if (!draft) return "";
  const parts: string[] = [];
  if (draft.blockingQuestion?.trim()) {
    parts.push(`待你确认：${draft.blockingQuestion.trim()}`);
  }
  const pendingLabels: string[] = [];
  for (const it of draft.items) {
    for (const f of it.fields) {
      if (f.key === "codePaths") continue;
      if (f.status !== "pending" && f.status !== "missing") continue;
      const label = f.label || String(f.key);
      if (!pendingLabels.includes(label)) pendingLabels.push(label);
    }
  }
  if (pendingLabels.length) {
    parts.push(
      `待补/待确认：${pendingLabels.slice(0, 6).join("、")}${pendingLabels.length > 6 ? "…" : ""}`,
    );
  }
  if (draft.openQuestions.length) {
    parts.push(`开放问题 ${draft.openQuestions.length} 条`);
  }
  if (!parts.length) return "";
  return `公约缺口：${parts.join("；")}`;
}

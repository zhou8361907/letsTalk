import type {
  RequirementDraftState,
  RequirementField,
  RequirementFieldKey,
  RequirementItem,
  RequirementItemStatus,
} from "@lets-talk/shared-types";
import { REQUIREMENT_FIELD_LABELS } from "@lets-talk/shared-types";

/** PM 界面不展示的内部字段 */
const PM_HIDDEN_KEYS = new Set<string>(["codePaths", "table", "configTables", "actions"]);

const TECHNICAL_VALUE =
  /rbac_|Mapper|Controller|Service|\.java|\.vue|API|接口|entity|表新增|字段新增/i;

/** PM 界面展示的字段顺序 */
const PM_FIELD_ORDER: RequirementFieldKey[] = [
  "page",
  "control",
  "province",
  "asIs",
  "toBe",
  "acceptance",
];

export function pmItemStatus(item: RequirementItem): {
  icon: string;
  label: string;
  hint?: string;
} {
  const map: Record<
    RequirementItemStatus,
    { icon: string; label: string; hint?: string }
  > = {
    ready: { icon: "🟢", label: "信息较完整" },
    draft: { icon: "🟡", label: "还缺一些信息" },
    blocked: { icon: "🟡", label: "等你确认" },
    conflict: {
      icon: "🔴",
      label: "和系统现状不一致",
      hint: "Agent 会在对话里说明，请确认以哪边为准",
    },
  };
  return map[item.status] ?? { icon: "🟡", label: "整理中" };
}

export function pmFieldLabel(key: string, fallback?: string): string {
  return (
    REQUIREMENT_FIELD_LABELS[key as RequirementFieldKey] ??
    fallback ??
    key
  );
}

/** 只展示 PM 需要看的字段：有内容，或核心缺口 */
export function pmVisibleFields(item: RequirementItem): RequirementField[] {
  const core = new Set(["page", "control", "toBe", "acceptance"]);

  const byKey = new Map(item.fields.map((f) => [String(f.key), f]));
  const ordered: RequirementField[] = [];

  for (const key of PM_FIELD_ORDER) {
    const f = byKey.get(key);
    if (!f || PM_HIDDEN_KEYS.has(key)) continue;
    if (f.value.trim()) {
      if (TECHNICAL_VALUE.test(f.value) && key !== "page") continue;
      ordered.push(f);
      continue;
    }
    if (core.has(key) && (f.status === "missing" || f.status === "pending")) {
      ordered.push(f);
    }
  }

  for (const f of item.fields) {
    const key = String(f.key);
    if (PM_HIDDEN_KEYS.has(key)) continue;
    if (PM_FIELD_ORDER.includes(key as RequirementFieldKey)) continue;
    if (!f.value.trim() || TECHNICAL_VALUE.test(f.value)) continue;
    ordered.push(f);
  }

  return ordered;
}

export function pmMissingSummary(item: RequirementItem): string[] {
  return pmVisibleFields(item)
    .filter((f) => f.status === "missing" || f.status === "pending")
    .map((f) => pmFieldLabel(String(f.key), f.label));
}

export function pmFormatFieldValue(field: RequirementField): string {
  const v = field.value.trim();
  if (!v) {
    return field.status === "pending" ? "待你补充" : "还没写";
  }
  return v;
}

export function pmPageHint(
  draft: RequirementDraftState,
  item: RequirementItem,
): string | null {
  const pageField = item.fields.find((f) => f.key === "page");
  if (pageField?.value.trim()) return null;
  if (draft.anchorRef) {
    const base = draft.anchorRef.split("/").pop()?.replace(/\.(vue|java)$/, "") ?? "";
    const friendly: Record<string, string> = {
      UserAdmin: "用户管理页",
      Detail: "明细页",
      Login: "登录页",
    };
    return friendly[base] ?? (base ? `关联页面：${base}` : null);
  }
  return null;
}

/** 折叠纯研发向的重复条目（UI 层不展示） */
export function pmDisplayItems(draft: RequirementDraftState): RequirementItem[] {
  return draft.items.filter((item) => {
    const title = item.title.trim();
    if (/^后端|数据库|接口|API/i.test(title)) return false;
    const visible = pmVisibleFields(item);
    const hasCore = visible.some(
      (f) =>
        f.value.trim() &&
        ["page", "control", "toBe", "acceptance"].includes(String(f.key)),
    );
    if (!hasCore && visible.length === 0) return false;
    return true;
  });
}

export function pmDraftSummary(draft: RequirementDraftState): string {
  const items = pmDisplayItems(draft);
  const n = items.length;
  if (n === 0) return "还没有拆出具体需求";
  const ready = items.filter((i) => i.status === "ready").length;
  if (ready === n) return `${n} 条需求，大多可以定稿了`;
  return `${n} 条需求，Agent 会帮你逐条补全`;
}

import { randomUUID } from "node:crypto";
import type {
  RequirementDraftState,
  RequirementField,
  RequirementFieldKey,
  RequirementItem,
  RequirementItemStatus,
  RequirementItemType,
} from "@lets-talk/shared-types";
import { REQUIREMENT_FIELD_LABELS } from "@lets-talk/shared-types";

const sessions = new Map<string, RequirementDraftState>();

const MODIFY_KEYS: RequirementFieldKey[] = [
  "page",
  "control",
  "province",
  "asIs",
  "toBe",
  "acceptance",
  "codePaths",
];

const ADD_KEYS: RequirementFieldKey[] = [
  "page",
  "table",
  "configTables",
  "actions",
  "province",
  "acceptance",
  "codePaths",
];

export function emptyDraft(anchorRef: string | null = null): RequirementDraftState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    anchorRef,
    items: [],
    openQuestions: [],
    blockingQuestion: null,
    readyToFinalize: false,
  };
}

export function getDraft(sessionId: string): RequirementDraftState | undefined {
  return sessions.get(sessionId);
}

export function setDraft(sessionId: string, draft: RequirementDraftState): void {
  sessions.set(sessionId, draft);
}

export function ensureDraft(
  sessionId: string,
  anchorRef: string | null,
): RequirementDraftState {
  let d = sessions.get(sessionId);
  if (!d) {
    d = emptyDraft(anchorRef);
    sessions.set(sessionId, d);
  }
  if (anchorRef !== undefined && anchorRef !== d.anchorRef) {
    d = { ...d, anchorRef, updatedAt: new Date().toISOString() };
    sessions.set(sessionId, d);
  }
  return d;
}

function fieldStatus(value: string): RequirementField["status"] {
  const t = value.trim();
  if (!t) return "missing";
  if (/待确认|待你补充|不清楚|待定|TBD/i.test(t)) return "pending";
  return "ok";
}

const PM_OPTIONAL_KEYS = new Set<RequirementFieldKey>(["province", "codePaths"]);

function normalizeFields(
  type: RequirementItemType,
  raw: Record<string, string> | undefined,
): RequirementField[] {
  const keys = type === "add" ? ADD_KEYS : MODIFY_KEYS;
  const out: RequirementField[] = [];
  for (const key of keys) {
    const value = raw?.[key]?.trim() ?? "";
    if (!value && PM_OPTIONAL_KEYS.has(key)) continue;
    if (!value && key === "codePaths") continue;
    if (!value) {
      if (["page", "control", "toBe", "acceptance", "table", "actions"].includes(key)) {
        out.push({
          key,
          label: REQUIREMENT_FIELD_LABELS[key],
          value: "",
          status: "missing",
        });
      }
      continue;
    }
    out.push({
      key,
      label: REQUIREMENT_FIELD_LABELS[key],
      value,
      status: fieldStatus(value),
    });
  }
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (keys.includes(key as RequirementFieldKey)) continue;
    const v = value.trim();
    if (!v) continue;
    out.push({
      key,
      label: key,
      value: v,
      status: fieldStatus(v),
    });
  }
  return out;
}

function itemReadiness(fields: RequirementField[]): RequirementItemStatus {
  const required = fields.filter((f) =>
    ["page", "control", "toBe", "acceptance"].includes(String(f.key)),
  );
  const missing = required.some((f) => f.status === "missing");
  const pending = fields.some((f) => f.status === "pending");
  const conflict = fields.some((f) => f.status === "conflict");
  if (conflict) return "conflict";
  if (missing || pending) return "draft";
  return "ready";
}

export interface DraftItemInput {
  id?: string;
  title: string;
  type?: RequirementItemType;
  status?: RequirementItemStatus;
  fields?: Record<string, string>;
}

export interface ApplyDraftInput {
  items?: DraftItemInput[];
  openQuestions?: string[];
  blockingQuestion?: string | null;
  readyToFinalize?: boolean;
  replaceItems?: boolean;
}

function fieldValue(item: RequirementItem, key: string): string {
  return item.fields.find((f) => f.key === key)?.value.trim() ?? "";
}

function setFieldValue(
  item: RequirementItem,
  key: RequirementFieldKey,
  value: string,
): RequirementItem {
  const fields = item.fields.map((f) =>
    f.key === key
      ? {
          ...f,
          value,
          status: fieldStatus(value),
        }
      : f,
  );
  if (!fields.some((f) => f.key === key)) {
    fields.push({
      key,
      label: REQUIREMENT_FIELD_LABELS[key],
      value,
      status: fieldStatus(value),
    });
  }
  return {
    ...item,
    fields,
    status: itemReadiness(fields),
  };
}

function defaultPageName(anchorRef: string | null): string {
  if (!anchorRef) return "";
  const base = anchorRef.split("/").pop()?.replace(/\.(vue|java)$/, "") ?? "";
  const friendly: Record<string, string> = {
    UserAdmin: "用户管理页",
    Detail: "明细页",
    Login: "登录页",
  };
  return friendly[base] ?? "";
}

function isBackendOnlyItem(item: RequirementItem): boolean {
  if (/^后端|数据库|接口|API|表结构/i.test(item.title.trim())) return true;
  const page = fieldValue(item, "page");
  const control = fieldValue(item, "control");
  const toBe = fieldValue(item, "toBe");
  const hasTech = item.fields.some(
    (f) =>
      ["table", "actions", "configTables"].includes(String(f.key)) &&
      f.value.trim(),
  );
  return hasTech && !page && !control && !toBe;
}

function mergeBackendIntoPrimary(
  items: RequirementItem[],
): RequirementItem[] {
  const backend = items.filter(isBackendOnlyItem);
  if (!backend.length) return items;

  const kept = items.filter((i) => !isBackendOnlyItem(i));
  if (!kept.length) return items;

  const notes = backend
    .flatMap((b) =>
      b.fields
        .filter((f) => f.value.trim())
        .map((f) => `${f.label || f.key}: ${f.value.trim()}`),
    )
    .join("；");

  const primary = kept[0]!;
  const existing = fieldValue(primary, "codePaths");
  const merged = [existing, notes].filter(Boolean).join("\n");
  kept[0] = setFieldValue(primary, "codePaths", merged);
  return kept;
}

function inheritItemContext(
  item: RequirementItem,
  anchorRef: string | null,
  siblings: RequirementItem[],
): RequirementItem {
  let next = item;
  const siblingWithPage = siblings.find(
    (s) => s.id !== next.id && fieldValue(s, "page"),
  );
  const page =
    fieldValue(next, "page") ||
    (siblingWithPage ? fieldValue(siblingWithPage, "page") : "") ||
    defaultPageName(anchorRef);
  if (page && !fieldValue(next, "page")) {
    next = setFieldValue(next, "page", page);
  }
  return next;
}

function postProcessItems(
  items: RequirementItem[],
  anchorRef: string | null,
): RequirementItem[] {
  let list = mergeBackendIntoPrimary(items);
  list = list.map((item) => inheritItemContext(item, anchorRef, list));
  return list;
}

export function applyDraftUpdate(
  sessionId: string,
  anchorRef: string | null,
  input: ApplyDraftInput,
): RequirementDraftState {
  const base = ensureDraft(sessionId, anchorRef);
  const now = new Date().toISOString();

  let items = base.items;
  if (input.items?.length) {
    const mapped: RequirementItem[] = input.items.map((raw) => {
      const type: RequirementItemType = raw.type ?? "unknown";
      const fields = normalizeFields(type, raw.fields);
      return {
        id: raw.id?.trim() || randomUUID(),
        title: raw.title.trim() || "未命名需求",
        type,
        status: raw.status ?? itemReadiness(fields),
        fields,
      };
    });

    if (input.replaceItems === true) {
      items = mapped;
    } else if (input.replaceItems === false) {
      const byId = new Map(base.items.map((i) => [i.id, i]));
      for (const m of mapped) {
        byId.set(m.id, m);
      }
      items = [...byId.values()];
    } else if (base.items.length === 0) {
      items = mapped;
    } else {
      const byId = new Map(base.items.map((i) => [i.id, i]));
      for (const m of mapped) {
        byId.set(m.id, m);
      }
      items = [...byId.values()];
    }
    items = postProcessItems(items, anchorRef ?? base.anchorRef);
  }

  const draft: RequirementDraftState = {
    ...base,
    updatedAt: now,
    anchorRef: anchorRef ?? base.anchorRef,
    items,
    openQuestions: input.openQuestions ?? base.openQuestions,
    blockingQuestion:
      input.blockingQuestion !== undefined
        ? input.blockingQuestion
        : base.blockingQuestion,
    readyToFinalize: input.readyToFinalize ?? base.readyToFinalize,
  };

  sessions.set(sessionId, draft);
  return draft;
}

export function buildAgentActions(draft: RequirementDraftState) {
  if (!draft.readyToFinalize || draft.items.length === 0) {
    return [];
  }
  return [
    {
      id: "finalize_blast",
      label: "生成说明（含影响面分析）",
      kind: "finalize_with_blast" as const,
      disabled: true,
      title: "即将支持，可先导出说明文档",
    },
    {
      id: "finalize_skip",
      label: "先生成一版说明文档",
      kind: "finalize_skip_blast" as const,
      disabled: false,
      title: "导出当前需求清单与对话",
    },
  ];
}

/**
 * 需求草稿内存存储 + 字段校验。
 *
 * - 运行时：Map<sessionId, RequirementDraftState>
 * - 持久化：run-chat 在工具回调时写入 ConversationRecord
 * - Agent 更新入口：requirement-draft-tools → applyDraftUpdate
 */

import { randomUUID } from "node:crypto";
import { canMarkReadyToFinalize } from "@lets-talk/shared-types";
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
/** sessionId → 草稿写版本（乐观锁） */
const draftRevisions = new Map<string, number>();

export function getDraftRevision(sessionId: string): number {
  return draftRevisions.get(sessionId) ?? 0;
}

function bumpDraftRevision(sessionId: string): number {
  const next = getDraftRevision(sessionId) + 1;
  draftRevisions.set(sessionId, next);
  return next;
}

export function initDraftRevision(sessionId: string, fromDraft?: boolean): void {
  if (!draftRevisions.has(sessionId)) {
    draftRevisions.set(sessionId, fromDraft ? 1 : 0);
  }
}

export function clearDraftRevision(sessionId: string): void {
  draftRevisions.delete(sessionId);
}

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
  initDraftRevision(sessionId, true);
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

function mergeDraftItem(existing: RequirementItem, raw: DraftItemInput): RequirementItem {
  const type: RequirementItemType =
    raw.type && raw.type !== "unknown" ? raw.type : existing.type;
  const mergedRaw: Record<string, string> = {};
  for (const f of existing.fields) {
    mergedRaw[String(f.key)] = f.value;
  }
  if (raw.fields) {
    for (const [key, value] of Object.entries(raw.fields)) {
      mergedRaw[key] = value;
    }
  }
  const fields = normalizeFields(type, mergedRaw);
  return {
    id: existing.id,
    title: raw.title?.trim() || existing.title,
    type,
    status: raw.status ?? itemReadiness(fields),
    fields,
  };
}

function mapDraftItemInput(
  raw: DraftItemInput,
  existingById: Map<string, RequirementItem>,
  replaceItems: boolean | undefined,
): RequirementItem {
  const existingId = raw.id?.trim();
  if (existingId && !replaceItems && existingById.has(existingId)) {
    return mergeDraftItem(existingById.get(existingId)!, raw);
  }
  const type: RequirementItemType = raw.type ?? "unknown";
  const fields = normalizeFields(type, raw.fields);
  return {
    id: existingId || randomUUID(),
    title: raw.title.trim() || "未命名需求",
    type,
    status: raw.status ?? itemReadiness(fields),
    fields,
  };
}

function buildDraftUpdate(
  sessionId: string,
  anchorRef: string | null,
  input: ApplyDraftInput,
): RequirementDraftState {
  const base = ensureDraft(sessionId, anchorRef);
  const now = new Date().toISOString();
  const existingById = new Map(base.items.map((i) => [i.id, i]));

  let items = base.items;
  if (input.items?.length) {
    if (input.replaceItems === true) {
      items = input.items.map((raw) =>
        mapDraftItemInput(raw, existingById, true),
      );
    } else {
      const byId = new Map(base.items.map((i) => [i.id, i]));
      for (const raw of input.items) {
        const merged = mapDraftItemInput(raw, existingById, false);
        byId.set(merged.id, merged);
      }
      items = [...byId.values()];
    }
    items = postProcessItems(items, anchorRef ?? base.anchorRef);
  }

  return {
    ...base,
    updatedAt: now,
    anchorRef: anchorRef ?? base.anchorRef,
    items,
    openQuestions: input.openQuestions ?? base.openQuestions,
    blockingQuestion:
      input.blockingQuestion !== undefined
        ? input.blockingQuestion
        : base.blockingQuestion,
    readyToFinalize: false,
  };
}

function finalizeReadyFlag(
  draft: RequirementDraftState,
  requested?: boolean,
): RequirementDraftState {
  const want = requested ?? draft.readyToFinalize;
  if (!want) return { ...draft, readyToFinalize: false };
  if (!canMarkReadyToFinalize(draft)) {
    return { ...draft, readyToFinalize: false };
  }
  return { ...draft, readyToFinalize: true };
}

/** G：modify 条目至少要有 page 或 control（postProcess 之后校验） */
export function validateDraftUpdateInput(
  sessionId: string,
  anchorRef: string | null,
  input: ApplyDraftInput,
): string | null {
  if (!input.items?.length) return null;
  const preview = buildDraftUpdate(sessionId, anchorRef, input);
  const problems: string[] = [];
  for (const item of preview.items) {
    if (item.type === "add") continue;
    const page = fieldValue(item, "page");
    const control = fieldValue(item, "control");
    if (!page && !control) {
      problems.push(`「${item.title}」(id=${item.id})`);
    }
  }
  if (!problems.length) return null;
  return [
    "ValidationError: modify/unknown 条目须至少填写 page 或 control 之一。",
    `缺少：${problems.join("；")}`,
    "请 get_requirement_draft 后补全 fields，或从锚点/对话中填写 page/control。",
  ].join("\n");
}

export function applyDraftUpdate(
  sessionId: string,
  anchorRef: string | null,
  input: ApplyDraftInput,
): RequirementDraftState {
  const built = buildDraftUpdate(sessionId, anchorRef, input);
  const draft = finalizeReadyFlag(built, input.readyToFinalize);
  sessions.set(sessionId, draft);
  bumpDraftRevision(sessionId);
  return draft;
}

export function buildAgentActions(draft: RequirementDraftState) {
  if (!canMarkReadyToFinalize(draft) || draft.items.length === 0) {
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

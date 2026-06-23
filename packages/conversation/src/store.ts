import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, normalize, resolve } from "node:path";
import type {
  ConversationRecord,
  ConversationSummary,
  DevAppendixExportJob,
  RequirementDraftState,
  TranscriptItem,
} from "@lets-talk/shared-types";
import type { AgentAnchor } from "@lets-talk/shared-types";
import {
  ensurePiSessionsDir,
  relativePiSessionFile,
  resolvePiSessionFile,
  toWorkspaceRelativePath,
} from "./pi-session.js";
import {
  tryDeleteSessionFromDb,
  trySyncConversationToDb,
  getSessionDb,
} from "./db-sync.js";
import { conversationOwnedBy } from "./actors.js";

/** letsTalk 会话元数据目录（相对 WORKSPACE_ROOT） */
export const CONVERSATIONS_DIR = ".agent/conversations";

const TITLE_MAX = 40;
const DEFAULT_TITLE = "新对话";

export function conversationsDir(workspaceRoot: string): string {
  return join(normalize(resolve(workspaceRoot)), CONVERSATIONS_DIR);
}

function conversationPath(workspaceRoot: string, sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safe || safe !== sessionId) {
    throw new Error("sessionId 格式无效");
  }
  return join(conversationsDir(workspaceRoot), `${safe}.json`);
}

export function deriveTitle(items: TranscriptItem[], fallback = DEFAULT_TITLE): string {
  const firstUser = items.find((i) => i.kind === "user");
  if (!firstUser) return fallback;
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  if (!t) return fallback;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX)}…` : t;
}

async function ensureDir(workspaceRoot: string): Promise<void> {
  await mkdir(conversationsDir(workspaceRoot), { recursive: true });
}

function matchesActorFilter(
  rec: ConversationRecord,
  actorId?: string,
): boolean {
  if (!actorId) return true;
  return conversationOwnedBy(rec.ownerActorId, actorId);
}

async function listConversationsFromJson(
  workspaceRoot: string,
  actorId?: string,
): Promise<ConversationSummary[]> {
  const dir = conversationsDir(workspaceRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const out: ConversationSummary[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, name), "utf8");
      const rec = JSON.parse(raw) as ConversationRecord;
      if (!matchesActorFilter(rec, actorId)) continue;
      out.push({
        sessionId: rec.sessionId,
        title: rec.title || DEFAULT_TITLE,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
        ownerActorId: rec.ownerActorId,
        totalCostUsd: rec.totalCostUsd,
        ownerDisplayName: rec.ownerDisplayName,
      });
    } catch {
      // skip corrupt file
    }
  }

  out.sort((a, b) => {
    const byCreated = b.createdAt.localeCompare(a.createdAt);
    return byCreated !== 0 ? byCreated : b.sessionId.localeCompare(a.sessionId);
  });
  return out;
}

/** 侧栏列表：DB + JSON 合并（过渡期）；DB 不可用则纯 JSON */
export async function listConversations(
  workspaceRoot: string,
  actorId?: string,
): Promise<ConversationSummary[]> {
  const jsonRows = await listConversationsFromJson(workspaceRoot, actorId);
  const db = getSessionDb(workspaceRoot);
  if (!db) {
    return jsonRows;
  }
  try {
    const dbRows = db.listSessions(actorId);
    if (dbRows.length === 0) {
      return jsonRows;
    }
    const map = new Map<string, ConversationSummary>();
    for (const r of jsonRows) {
      map.set(r.sessionId, r);
    }
    for (const r of dbRows) {
      if (actorId && !conversationOwnedBy(r.ownerActorId, actorId)) continue;
      const existing = map.get(r.sessionId);
      if (!existing || r.updatedAt.localeCompare(existing.updatedAt) >= 0) {
        map.set(r.sessionId, r);
      }
    }
    const merged = [...map.values()].filter(
      (r) => !actorId || conversationOwnedBy(r.ownerActorId, actorId),
    );
    return merged.sort((a, b) => {
      const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
      return byUpdated !== 0 ? byUpdated : b.sessionId.localeCompare(a.sessionId);
    });
  } catch (err) {
    console.warn(
      "[session-db] listSessions failed, falling back to JSON:",
      err instanceof Error ? err.message : err,
    );
    return jsonRows;
  }
}

export async function getConversation(
  workspaceRoot: string,
  sessionId: string,
): Promise<ConversationRecord | null> {
  try {
    const raw = await readFile(conversationPath(workspaceRoot, sessionId), "utf8");
    return JSON.parse(raw) as ConversationRecord;
  } catch {
    return null;
  }
}

export function assertConversationAccess(
  record: ConversationRecord | null,
  actorId: string,
): void {
  if (!record) {
    throw new Error("会话不存在");
  }
  if (!conversationOwnedBy(record.ownerActorId, actorId)) {
    throw new Error("无权访问此会话");
  }
}

export async function claimConversationOwner(
  workspaceRoot: string,
  sessionId: string,
  actorId: string,
  displayName?: string,
): Promise<ConversationRecord | null> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing || existing.ownerActorId) return existing;
  const record: ConversationRecord = {
    ...existing,
    ownerActorId: actorId,
    ownerDisplayName: displayName,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    conversationPath(workspaceRoot, sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  trySyncConversationToDb(workspaceRoot, record);
  return record;
}

export async function createConversation(
  workspaceRoot: string,
  options?: {
    sessionId?: string;
    ownerActorId?: string;
    ownerDisplayName?: string;
  },
): Promise<ConversationRecord> {
  await ensureDir(workspaceRoot);
  const id = options?.sessionId?.trim() || randomUUID();

  const now = new Date().toISOString();
  await ensurePiSessionsDir(workspaceRoot);

  const record: ConversationRecord = {
    sessionId: id,
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    anchor: null,
    items: [],
    piSessionFile: relativePiSessionFile(id),
    chatMode: "explore",
    ownerActorId: options?.ownerActorId,
    ownerDisplayName: options?.ownerDisplayName,
  };

  await writeFile(
    conversationPath(workspaceRoot, id),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  trySyncConversationToDb(workspaceRoot, record);
  return record;
}

export async function saveConversation(
  workspaceRoot: string,
  input: {
    sessionId: string;
    items: TranscriptItem[];
    anchor?: AgentAnchor | null;
    title?: string;
    piSessionFile?: string | null;
    chatMode?: "explore" | "prd" | "qa";
    requirementDraft?: RequirementDraftState | null;
    draftRevision?: number;
    currentTask?: string;
    totalCostUsd?: number;
  },
): Promise<ConversationRecord> {
  await ensureDir(workspaceRoot);
  const existing = await getConversation(workspaceRoot, input.sessionId);
  const now = new Date().toISOString();
  const items = input.items;
  const title = (() => {
    if (input.title?.trim()) return input.title.trim();
    if (existing?.titleLocked && existing.title) return existing.title;
    return deriveTitle(items, existing?.title ?? DEFAULT_TITLE);
  })();

  const record: ConversationRecord = {
    sessionId: input.sessionId,
    title: title || DEFAULT_TITLE,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    titleLocked: existing?.titleLocked,
    anchor: input.anchor !== undefined ? input.anchor : (existing?.anchor ?? null),
    items,
    piSessionFile:
      input.piSessionFile !== undefined
        ? input.piSessionFile
        : (existing?.piSessionFile ?? relativePiSessionFile(input.sessionId)),
    chatMode:
      input.chatMode !== undefined
        ? input.chatMode
        : (existing?.chatMode ?? "explore"),
    requirementDraft:
      input.requirementDraft != null
        ? input.requirementDraft
        : (existing?.requirementDraft ?? null),
    totalCostUsd:
      input.totalCostUsd !== undefined
        ? input.totalCostUsd
        : (existing?.totalCostUsd ?? undefined),
    draftRevision:
      input.draftRevision !== undefined
        ? input.draftRevision
        : (existing?.draftRevision ?? 0),
    currentTask:
      input.currentTask !== undefined
        ? input.currentTask
        : (existing?.currentTask ?? undefined),
    devAppendixExport: existing?.devAppendixExport ?? null,
    ownerActorId: existing?.ownerActorId,
    ownerDisplayName: existing?.ownerDisplayName,
  };

  await writeFile(
    conversationPath(workspaceRoot, input.sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  trySyncConversationToDb(workspaceRoot, record);
  return record;
}

/** 每轮结束后写入 Pi session 文件路径（供 HMR 后 SessionManager.open） */
export async function bindPiSessionFile(
  workspaceRoot: string,
  sessionId: string,
  absolutePiSessionFile: string,
): Promise<void> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing) return;

  const rel = toWorkspaceRelativePath(workspaceRoot, absolutePiSessionFile);
  if (existing.piSessionFile === rel) return;

  await saveConversation(workspaceRoot, {
    sessionId,
    items: existing.items,
    anchor: existing.anchor,
    title: existing.title,
    piSessionFile: rel,
  });
}

export async function renameConversation(
  workspaceRoot: string,
  sessionId: string,
  title: string,
): Promise<ConversationRecord | null> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing) return null;
  const next = title.trim();
  if (!next) {
    throw new Error("标题不能为空");
  }
  const now = new Date().toISOString();
  const record: ConversationRecord = {
    ...existing,
    title: next,
    titleLocked: true,
    updatedAt: now,
  };
  await writeFile(
    conversationPath(workspaceRoot, sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  trySyncConversationToDb(workspaceRoot, record);
  return record;
}

const AUTO_TITLE_MAX = 40;

/** LLM 或系统生成的标题（默认加锁，避免 save 时被首条消息覆盖） */
export async function setConversationTitle(
  workspaceRoot: string,
  sessionId: string,
  title: string,
  options?: { lock?: boolean },
): Promise<ConversationRecord | null> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing) return null;
  let next = title.trim().replace(/\s+/g, " ");
  if (!next) return null;
  if (next.length > AUTO_TITLE_MAX) {
    next = `${next.slice(0, AUTO_TITLE_MAX - 1)}…`;
  }
  const now = new Date().toISOString();
  const record: ConversationRecord = {
    ...existing,
    title: next,
    titleLocked: options?.lock !== false,
    updatedAt: now,
  };
  await writeFile(
    conversationPath(workspaceRoot, sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  trySyncConversationToDb(workspaceRoot, record);
  return record;
}

export async function updateDevAppendixExport(
  workspaceRoot: string,
  sessionId: string,
  patch: Partial<DevAppendixExportJob>,
): Promise<ConversationRecord | null> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const prev = existing.devAppendixExport ?? { status: "idle" as const };
  const record: ConversationRecord = {
    ...existing,
    devAppendixExport: { ...prev, ...patch },
    updatedAt: now,
  };
  await writeFile(
    conversationPath(workspaceRoot, sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  trySyncConversationToDb(workspaceRoot, record);
  return record;
}

/** 附录完成后写入 transcript 气泡（替换同类型旧条目） */
export async function appendExportReadyTranscriptItem(
  workspaceRoot: string,
  sessionId: string,
  item: Extract<TranscriptItem, { kind: "export_ready" }>,
): Promise<ConversationRecord | null> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing) return null;
  const items = [
    ...existing.items.filter(
      (i) => !(i.kind === "export_ready" && i.exportKind === item.exportKind),
    ),
    item,
  ];
  return saveConversation(workspaceRoot, {
    sessionId,
    items,
    anchor: existing.anchor,
    title: existing.title,
    chatMode: existing.chatMode,
    requirementDraft: existing.requirementDraft,
  });
}

/** 删除会话 JSON、Pi jsonl（按 record.piSessionFile 解析路径） */
export async function deleteConversation(
  workspaceRoot: string,
  sessionId: string,
): Promise<boolean> {
  const existing = await getConversation(workspaceRoot, sessionId);
  if (!existing) {
    return false;
  }

  try {
    await unlink(conversationPath(workspaceRoot, sessionId));
  } catch {
    return false;
  }

  const piAbs = resolvePiSessionFile(
    workspaceRoot,
    sessionId,
    existing.piSessionFile,
  );
  try {
    await unlink(piAbs);
  } catch {
    // pi jsonl 可能本就不存在
  }
  tryDeleteSessionFromDb(workspaceRoot, sessionId);
  return true;
}

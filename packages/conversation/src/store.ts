import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type {
  ConversationRecord,
  ConversationSummary,
  RequirementDraftState,
  TranscriptItem,
} from "@lets-talk/shared-types";
import type { AgentAnchor } from "@lets-talk/shared-types";
import {
  ensurePiSessionsDir,
  relativePiSessionFile,
  toWorkspaceRelativePath,
} from "./pi-session.js";

/** letsTalk 会话元数据目录（相对 WORKSPACE_ROOT） */
export const CONVERSATIONS_DIR = ".agent/conversations";

const TITLE_MAX = 40;
const DEFAULT_TITLE = "新对话";

export function conversationsDir(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), CONVERSATIONS_DIR);
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
  if (!firstUser || firstUser.kind !== "user") return fallback;
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  if (!t) return fallback;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX)}…` : t;
}

async function ensureDir(workspaceRoot: string): Promise<void> {
  await mkdir(conversationsDir(workspaceRoot), { recursive: true });
}

export async function listConversations(
  workspaceRoot: string,
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
      out.push({
        sessionId: rec.sessionId,
        title: rec.title || DEFAULT_TITLE,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      });
    } catch {
      // skip corrupt file
    }
  }

  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
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

export async function createConversation(
  workspaceRoot: string,
  sessionId?: string,
): Promise<ConversationRecord> {
  await ensureDir(workspaceRoot);
  const id = sessionId?.trim() || randomUUID();

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
  };

  await writeFile(
    conversationPath(workspaceRoot, id),
    JSON.stringify(record, null, 2),
    "utf8",
  );
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
    chatMode?: "explore" | "prd";
    requirementDraft?: RequirementDraftState | null;
  },
): Promise<ConversationRecord> {
  await ensureDir(workspaceRoot);
  const existing = await getConversation(workspaceRoot, input.sessionId);
  const now = new Date().toISOString();
  const items = input.items;
  const title =
    input.title?.trim() ||
    deriveTitle(items, existing?.title ?? DEFAULT_TITLE);

  const record: ConversationRecord = {
    sessionId: input.sessionId,
    title: title || DEFAULT_TITLE,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
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
      input.requirementDraft !== undefined
        ? input.requirementDraft
        : (existing?.requirementDraft ?? null),
  };

  await writeFile(
    conversationPath(workspaceRoot, input.sessionId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
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

export async function deleteConversation(
  workspaceRoot: string,
  sessionId: string,
): Promise<boolean> {
  try {
    await unlink(conversationPath(workspaceRoot, sessionId));
    return true;
  } catch {
    return false;
  }
}

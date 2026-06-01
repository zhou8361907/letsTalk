import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureMemoryDir, memoryDir } from "./paths.js";
import { validateSaveMemoryContent } from "./validate-save.js";

export const USER_REL = ".agent/memory/USER.md";
export const CORE_REL = ".agent/memory/CORE.md";
export const USER_CHAR_LIMIT = 1500;
export const CORE_CHAR_LIMIT = 2500;

export const ENTRY_SEPARATOR = "\n\n§\n\n";

export interface CoreMemorySnapshot {
  user: string | null;
  core: string | null;
  userTruncated: boolean;
  coreTruncated: boolean;
}

export type CoreMemoryUpdateMode = "append" | "replace";

function userFilePath(workspaceRoot: string): string {
  return join(memoryDir(workspaceRoot), "USER.md");
}

function coreFilePath(workspaceRoot: string): string {
  return join(memoryDir(workspaceRoot), "CORE.md");
}

async function readOptionalFile(absPath: string): Promise<string | null> {
  try {
    const raw = await readFile(absPath, "utf8");
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

function truncateWithNotice(text: string, limit: number): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, limit)}…（已截断，完整见 read_user_profile / read_core_memory）`,
    truncated: true,
  };
}

export async function loadCoreMemorySnapshot(
  workspaceRoot: string,
): Promise<CoreMemorySnapshot> {
  const userRaw = await readOptionalFile(userFilePath(workspaceRoot));
  const coreRaw = await readOptionalFile(coreFilePath(workspaceRoot));

  const user = userRaw
    ? truncateWithNotice(userRaw, USER_CHAR_LIMIT)
    : { text: null as string | null, truncated: false };
  const core = coreRaw
    ? truncateWithNotice(coreRaw, CORE_CHAR_LIMIT)
    : { text: null as string | null, truncated: false };

  return {
    user: user.text,
    core: core.text,
    userTruncated: user.truncated,
    coreTruncated: core.truncated,
  };
}

/** Tier 1：注入 Pi system prompt 的 M0 块 */
export function formatCoreMemorySystemBlock(
  snapshot: CoreMemorySnapshot,
  opts?: { footerNote?: string },
): string {
  const parts: string[] = ["# 助手核心记忆（跨会话 · Tier 1）"];

  if (snapshot.user) {
    parts.push("## USER（用户画像）");
    if (snapshot.userTruncated) {
      parts.push("（以下 USER 已按字符上限截断）");
    }
    parts.push(snapshot.user);
  }

  if (snapshot.core) {
    parts.push("## CORE（助手笔记）");
    if (snapshot.coreTruncated) {
      parts.push("（以下 CORE 已按字符上限截断）");
    }
    parts.push(snapshot.core);
  }

  if (!snapshot.user && !snapshot.core) {
    return "";
  }

  parts.push(
    opts?.footerNote ??
      "以上 USER/CORE 在会话创建时冻结进 system prompt；磁盘变更后下一会话或 <core_memory_refresh> 前缀会更新。引用代码结论前仍须 grep/read。",
  );
  return parts.join("\n\n");
}

function removeEntryByOldText(
  existing: string,
  oldText: string,
  label: string,
): string {
  const needle = oldText.trim();
  if (!needle) {
    throw new Error(`${label} remove 需要 old_text`);
  }
  if (!existing.includes(needle)) {
    throw new Error(`remove 未找到 old_text，请核对 ${label} 原文`);
  }
  const next = existing.replace(needle, "").trim();
  const cleaned = next
    .split(ENTRY_SEPARATOR)
    .map((e) => e.trim())
    .filter(Boolean)
    .join(ENTRY_SEPARATOR);
  return cleaned;
}

export async function removeUserProfileEntry(
  workspaceRoot: string,
  old_text: string,
): Promise<{ path: string; charCount: number; limit: number }> {
  await ensureMemoryDir(workspaceRoot);
  const existing = await readFullUser(workspaceRoot);
  const next = removeEntryByOldText(existing, old_text, "USER.md");
  assertWithinLimit(next, USER_CHAR_LIMIT, "USER.md");
  await writeFile(userFilePath(workspaceRoot), next ? `${next}\n` : "", "utf8");
  return {
    path: USER_REL,
    charCount: next.length,
    limit: USER_CHAR_LIMIT,
  };
}

export async function removeCoreMemoryEntry(
  workspaceRoot: string,
  old_text: string,
): Promise<{ path: string; charCount: number; limit: number }> {
  await ensureMemoryDir(workspaceRoot);
  const existing = await readFullCore(workspaceRoot);
  const next = removeEntryByOldText(existing, old_text, "CORE.md");
  assertWithinLimit(next, CORE_CHAR_LIMIT, "CORE.md");
  await writeFile(coreFilePath(workspaceRoot), next ? `${next}\n` : "", "utf8");
  return {
    path: CORE_REL,
    charCount: next.length,
    limit: CORE_CHAR_LIMIT,
  };
}

/** 工具返回：live 占用（对齐 Hermes usage 条） */
export function formatM0UsageLine(
  charCount: number,
  limit: number,
  target: "user" | "core",
): string {
  const pct = limit > 0 ? Math.min(100, Math.round((charCount / limit) * 100)) : 0;
  const label = target === "user" ? "USER 画像" : "CORE 笔记";
  return `${label}：${charCount}/${limit} 字符（${pct}%）`;
}

async function readFullUser(workspaceRoot: string): Promise<string> {
  return (await readOptionalFile(userFilePath(workspaceRoot))) ?? "";
}

async function readFullCore(workspaceRoot: string): Promise<string> {
  return (await readOptionalFile(coreFilePath(workspaceRoot))) ?? "";
}

function assertWithinLimit(text: string, limit: number, label: string): void {
  if (text.length > limit) {
    throw new Error(
      `${label} 超过 ${limit} 字符（当前 ${text.length}）。请用 replace 合并或删减后再写。`,
    );
  }
}

export async function readUserProfile(
  workspaceRoot: string,
): Promise<{ content: string; charCount: number; limit: number }> {
  const content = await readFullUser(workspaceRoot);
  return {
    content: content || "（USER.md 暂无内容）",
    charCount: content.length,
    limit: USER_CHAR_LIMIT,
  };
}

export async function readCoreMemory(
  workspaceRoot: string,
): Promise<{ content: string; charCount: number; limit: number }> {
  const content = await readFullCore(workspaceRoot);
  return {
    content: content || "（CORE.md 暂无内容）",
    charCount: content.length,
    limit: CORE_CHAR_LIMIT,
  };
}

export async function updateUserProfile(
  workspaceRoot: string,
  input: { content: string; mode: CoreMemoryUpdateMode; old_text?: string },
): Promise<{ path: string; charCount: number; limit: number }> {
  const validation = validateSaveMemoryContent(input.content);
  if (validation.blocked) {
    throw new Error(validation.blocked);
  }

  await ensureMemoryDir(workspaceRoot);
  const existing = await readFullUser(workspaceRoot);
  let next: string;

  if (input.mode === "replace") {
    if (input.old_text?.trim()) {
      if (!existing.includes(input.old_text)) {
        throw new Error("replace 未找到 old_text，请核对 USER.md 原文");
      }
      next = existing.replace(input.old_text, input.content.trim());
    } else {
      next = input.content.trim();
    }
  } else {
    const piece = input.content.trim();
    next = existing ? `${existing}${ENTRY_SEPARATOR}${piece}` : piece;
  }

  assertWithinLimit(next, USER_CHAR_LIMIT, "USER.md");
  await writeFile(userFilePath(workspaceRoot), `${next}\n`, "utf8");

  return {
    path: USER_REL,
    charCount: next.length,
    limit: USER_CHAR_LIMIT,
  };
}

export async function updateCoreMemory(
  workspaceRoot: string,
  input: { content: string; mode: CoreMemoryUpdateMode; old_text?: string },
): Promise<{ path: string; charCount: number; limit: number }> {
  const validation = validateSaveMemoryContent(input.content);
  if (validation.blocked) {
    throw new Error(validation.blocked);
  }

  await ensureMemoryDir(workspaceRoot);
  const existing = await readFullCore(workspaceRoot);
  let next: string;

  if (input.mode === "replace") {
    if (input.old_text?.trim()) {
      if (!existing.includes(input.old_text)) {
        throw new Error("replace 未找到 old_text，请核对 CORE.md 原文");
      }
      next = existing.replace(input.old_text, input.content.trim());
    } else {
      next = input.content.trim();
    }
  } else {
    const piece = input.content.trim();
    next = existing ? `${existing}${ENTRY_SEPARATOR}${piece}` : piece;
  }

  assertWithinLimit(next, CORE_CHAR_LIMIT, "CORE.md");
  await writeFile(coreFilePath(workspaceRoot), `${next}\n`, "utf8");

  return {
    path: CORE_REL,
    charCount: next.length,
    limit: CORE_CHAR_LIMIT,
  };
}

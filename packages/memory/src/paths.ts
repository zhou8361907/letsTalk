import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { MemoryKind } from "./index-table.js";

export const MEMORY_DIR = ".agent/memory";
export const INDEX_REL = ".agent/memory/INDEX.md";
export const ALIASES_REL = ".agent/memory/aliases.json";
export const TOPICS_DIR = "topics";

export function memoryDir(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), MEMORY_DIR);
}

export function indexFilePath(workspaceRoot: string): string {
  return join(memoryDir(workspaceRoot), "INDEX.md");
}

export function aliasesFilePath(workspaceRoot: string): string {
  return join(memoryDir(workspaceRoot), "aliases.json");
}

export function topicsDir(workspaceRoot: string): string {
  return join(memoryDir(workspaceRoot), TOPICS_DIR);
}

export function topicRelPath(kind: MemoryKind, slug: string): string {
  return `${TOPICS_DIR}/${kind}-${slug}.md`;
}

export function topicFilePath(
  workspaceRoot: string,
  kind: MemoryKind,
  slug: string,
): string {
  return join(topicsDir(workspaceRoot), `${kind}-${slug}.md`);
}

/** 按 Actor 隔离的 USER 画像目录 */
export function actorUserDir(workspaceRoot: string, actorId: string): string {
  return join(memoryDir(workspaceRoot), "actors", actorId);
}

export function actorUserRelPath(actorId: string): string {
  return `${MEMORY_DIR}/actors/${actorId}/USER.md`;
}

export function actorUserFilePath(
  workspaceRoot: string,
  actorId: string,
): string {
  return join(actorUserDir(workspaceRoot, actorId), "USER.md");
}

/** @deprecated legacy 根目录 flat 文件 */
export function legacyMemoryFilePath(workspaceRoot: string, slug: string): string {
  return join(memoryDir(workspaceRoot), `${slug}.md`);
}

export async function ensureMemoryDir(workspaceRoot: string): Promise<string> {
  const dir = memoryDir(workspaceRoot);
  await mkdir(dir, { recursive: true });
  await mkdir(topicsDir(workspaceRoot), { recursive: true });
  return dir;
}

/** topic → 文件名 slug */
export function topicToSlug(topic: string): string {
  const slug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("topic 无效，无法生成文件名");
  }
  return slug.slice(0, 80);
}

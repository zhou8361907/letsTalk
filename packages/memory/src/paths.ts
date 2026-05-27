import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export const MEMORY_DIR = ".agent/memory";

export function memoryDir(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), MEMORY_DIR);
}

export function memoryFilePath(workspaceRoot: string, slug: string): string {
  return join(memoryDir(workspaceRoot), `${slug}.md`);
}

export async function ensureMemoryDir(workspaceRoot: string): Promise<string> {
  const dir = memoryDir(workspaceRoot);
  await mkdir(dir, { recursive: true });
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

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildMemoryMarkdown,
  parseMemoryMarkdown,
  type MemoryConfidence,
} from "./frontmatter.js";
import {
  ensureMemoryDir,
  memoryDir,
  memoryFilePath,
  topicToSlug,
} from "./paths.js";
import { findStaleSources } from "./stale.js";

export interface SaveMemoryInput {
  topic: string;
  content: string;
  confidence: MemoryConfidence;
  tags?: string[];
  sources?: string[];
}

export interface SaveMemoryResult {
  slug: string;
  path: string;
  topic: string;
}

export interface ReadMemoryResult {
  slug: string;
  path: string;
  topic: string;
  confidence: MemoryConfidence;
  tags: string[];
  sources: string[];
  updated_at: string;
  body: string;
  staleSources: string[];
  staleWarning?: string;
}

export interface MemoryListItem {
  slug: string;
  topic: string;
  confidence: MemoryConfidence;
  updated_at: string;
  path: string;
}

export async function saveMemory(
  workspaceRoot: string,
  input: SaveMemoryInput,
): Promise<SaveMemoryResult> {
  await ensureMemoryDir(workspaceRoot);
  const slug = topicToSlug(input.topic);
  const path = memoryFilePath(workspaceRoot, slug);
  const updated_at = new Date().toISOString();

  const markdown = buildMemoryMarkdown(
    {
      topic: input.topic.trim(),
      confidence: input.confidence,
      tags: input.tags,
      sources: input.sources,
      updated_at,
    },
    input.content,
  );

  await writeFile(path, markdown, "utf8");

  return {
    slug,
    path: join(".agent/memory", `${slug}.md`),
    topic: input.topic.trim(),
  };
}

export async function readMemory(
  workspaceRoot: string,
  topicOrSlug: string,
): Promise<ReadMemoryResult> {
  const slug = topicToSlug(topicOrSlug);
  const path = memoryFilePath(workspaceRoot, slug);
  const raw = await readFile(path, "utf8");
  const fileStat = await stat(path);
  const { meta, body } = parseMemoryMarkdown(raw);

  const sources = meta.sources ?? [];
  const staleSources = await findStaleSources(
    workspaceRoot,
    sources,
    fileStat.mtimeMs,
  );

  const staleWarning =
    staleSources.length > 0
      ? `⚠ 以下 sources 可能比记忆更新，请以代码为准：${staleSources.join(", ")}`
      : undefined;

  return {
    slug,
    path: join(".agent/memory", `${slug}.md`),
    topic: meta.topic ?? topicOrSlug,
    confidence: meta.confidence ?? "draft",
    tags: meta.tags ?? [],
    sources,
    updated_at: meta.updated_at ?? fileStat.mtime.toISOString(),
    body,
    staleSources,
    staleWarning,
  };
}

export async function listMemoryFiles(
  workspaceRoot: string,
): Promise<MemoryListItem[]> {
  const dir = memoryDir(workspaceRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const items: MemoryListItem[] = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const path = join(dir, name);
    const raw = await readFile(path, "utf8");
    const { meta } = parseMemoryMarkdown(raw);
    const slug = name.replace(/\.md$/, "");
    items.push({
      slug,
      topic: meta.topic ?? slug,
      confidence: meta.confidence ?? "draft",
      updated_at: meta.updated_at ?? "",
      path: join(".agent/memory", name),
    });
  }

  items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return items;
}

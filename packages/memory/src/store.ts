import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildMemoryMarkdown,
  parseMemoryMarkdown,
  type MemoryConfidence,
  type MemoryKind,
} from "./frontmatter.js";
import {
  readIndexRows,
  syncIndexForTopic,
  type IndexRow,
} from "./index-table.js";
import { matchIndexTerms } from "./match.js";
import {
  ensureMemoryDir,
  legacyMemoryFilePath,
  memoryDir,
  topicFilePath,
  topicRelPath,
  topicToSlug,
  topicsDir,
} from "./paths.js";
import { findStaleSources } from "./stale.js";
import { validateSaveMemoryContent } from "./validate-save.js";

export interface SaveMemoryInput {
  topic: string;
  kind: MemoryKind;
  content: string;
  confidence: MemoryConfidence;
  aliases?: string[];
  tags?: string[];
  sources?: string[];
}

export interface SaveMemoryResult {
  slug: string;
  path: string;
  topic: string;
  kind: MemoryKind;
  confidence: MemoryConfidence;
  indexRows: string[];
  /** save 前校验提示（非阻塞） */
  warnings?: string[];
}

export interface ReadMemoryResult {
  slug: string;
  path: string;
  topic: string;
  kind?: MemoryKind;
  confidence: MemoryConfidence;
  aliases: string[];
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
  kind?: MemoryKind;
  confidence: MemoryConfidence;
  updated_at: string;
  path: string;
}

export interface MemoryContextBlock {
  term: string;
  kind: MemoryKind;
  path: string;
  topic: string;
  body: string;
  staleWarning?: string;
  /** @internal 排序用，不对外暴露语义依赖 */
  _confidence?: MemoryConfidence;
  /** @internal 排序用，不对外暴露语义依赖 */
  _updatedAt?: string;
}

export interface ResolvedMemoryContext {
  matchedTerms: string[];
  blocks: MemoryContextBlock[];
}

async function readTopicFile(
  workspaceRoot: string,
  relPath: string,
): Promise<ReadMemoryResult> {
  const abs = join(memoryDir(workspaceRoot), relPath);
  const raw = await readFile(abs, "utf8");
  const fileStat = await stat(abs);
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

  const fileName = relPath.split("/").pop()?.replace(/\.md$/, "") ?? "";
  const slug = fileName.replace(/^(glossary|history)-/, "");

  return {
    slug,
    path: join(".agent/memory", relPath),
    topic: meta.topic ?? slug,
    kind: meta.kind,
    confidence: meta.confidence ?? "draft",
    aliases: meta.aliases ?? [],
    tags: meta.tags ?? [],
    sources,
    updated_at: meta.updated_at ?? fileStat.mtime.toISOString(),
    body,
    staleSources,
    staleWarning,
  };
}

function findIndexPathForQuery(
  rows: IndexRow[],
  query: string,
): string | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const hit = rows.find((r) => r.term === q);
  if (hit) return hit.relPath;
  const slug = topicToSlug(q);
  for (const row of rows) {
    if (row.relPath.includes(slug)) return row.relPath;
  }
  return undefined;
}

async function resolveTopicPath(
  workspaceRoot: string,
  topicOrSlug: string,
): Promise<{ relPath: string; absPath: string } | null> {
  const rows = await readIndexRows(workspaceRoot);
  const fromIndex = findIndexPathForQuery(rows, topicOrSlug);
  if (fromIndex) {
    return {
      relPath: fromIndex,
      absPath: join(memoryDir(workspaceRoot), fromIndex),
    };
  }

  const slug = topicToSlug(topicOrSlug);
  for (const kind of ["glossary", "history"] as const) {
    const rel = topicRelPath(kind, slug);
    const abs = topicFilePath(workspaceRoot, kind, slug);
    try {
      await stat(abs);
      return { relPath: rel, absPath: abs };
    } catch {
      /* try next */
    }
  }

  const legacy = legacyMemoryFilePath(workspaceRoot, slug);
  try {
    await stat(legacy);
    return { relPath: `${slug}.md`, absPath: legacy };
  } catch {
    return null;
  }
}

export async function saveMemory(
  workspaceRoot: string,
  input: SaveMemoryInput,
): Promise<SaveMemoryResult> {
  const validation = validateSaveMemoryContent(input.content);
  if (validation.blocked) {
    throw new Error(validation.blocked);
  }

  await ensureMemoryDir(workspaceRoot);
  const slug = topicToSlug(input.topic);
  const kind = input.kind;
  const relPath = topicRelPath(kind, slug);
  const absPath = topicFilePath(workspaceRoot, kind, slug);
  const updated_at = new Date().toISOString();
  const aliases = (input.aliases ?? []).map((a) => a.trim()).filter(Boolean);

  const markdown = buildMemoryMarkdown(
    {
      topic: input.topic.trim(),
      kind,
      confidence: input.confidence,
      aliases,
      tags: input.tags,
      sources: input.sources,
      updated_at,
    },
    input.content,
  );

  await writeFile(absPath, markdown, "utf8");

  const indexRows = await syncIndexForTopic({
    workspaceRoot,
    topic: input.topic.trim(),
    aliases,
    relPath,
    kind,
  });

  return {
    slug,
    path: join(".agent/memory", relPath),
    topic: input.topic.trim(),
    kind,
    confidence: input.confidence,
    indexRows,
    warnings: validation.warnings.length ? validation.warnings : undefined,
  };
}

export async function readMemory(
  workspaceRoot: string,
  topicOrSlug: string,
): Promise<ReadMemoryResult> {
  const resolved = await resolveTopicPath(workspaceRoot, topicOrSlug);
  if (!resolved) {
    throw new Error(`未找到记忆：${topicOrSlug}`);
  }

  if (resolved.relPath.startsWith("topics/")) {
    return readTopicFile(workspaceRoot, resolved.relPath);
  }

  const raw = await readFile(resolved.absPath, "utf8");
  const fileStat = await stat(resolved.absPath);
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
  const slug = resolved.relPath.replace(/\.md$/, "");

  return {
    slug,
    path: join(".agent/memory", resolved.relPath),
    topic: meta.topic ?? topicOrSlug,
    kind: meta.kind,
    confidence: meta.confidence ?? "draft",
    aliases: meta.aliases ?? [],
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
  const items: MemoryListItem[] = [];

  const topicsPath = topicsDir(workspaceRoot);
  try {
    const names = await readdir(topicsPath);
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const path = join(topicsPath, name);
      const raw = await readFile(path, "utf8");
      const { meta } = parseMemoryMarkdown(raw);
      const slug = name.replace(/\.md$/, "").replace(/^(glossary|history)-/, "");
      items.push({
        slug,
        topic: meta.topic ?? slug,
        kind: meta.kind,
        confidence: meta.confidence ?? "draft",
        updated_at: meta.updated_at ?? "",
        path: join(".agent/memory/topics", name),
      });
    }
  } catch {
    /* no topics dir */
  }

  const root = memoryDir(workspaceRoot);
  try {
    const names = await readdir(root);
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      if (name === "INDEX.md" || name === "README.md") continue;
      if (items.some((i) => i.path.endsWith(name))) continue;
      const path = join(root, name);
      const raw = await readFile(path, "utf8");
      const { meta } = parseMemoryMarkdown(raw);
      const slug = name.replace(/\.md$/, "");
      items.push({
        slug,
        topic: meta.topic ?? slug,
        kind: meta.kind,
        confidence: meta.confidence ?? "draft",
        updated_at: meta.updated_at ?? "",
        path: join(".agent/memory", name),
      });
    }
  } catch {
    /* empty */
  }

  items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return items;
}

export async function resolveMemoryContext(
  workspaceRoot: string,
  message: string,
  opts?: { maxBodyChars?: number },
): Promise<ResolvedMemoryContext> {
  const maxBodyChars = opts?.maxBodyChars ?? 2000;
  const rows = await readIndexRows(workspaceRoot);
  const matched = matchIndexTerms(message, rows);
  if (matched.length === 0) {
    return { matchedTerms: [], blocks: [] };
  }

  const blocks: MemoryContextBlock[] = [];
  for (const hit of matched) {
    try {
      const mem = await readTopicFile(workspaceRoot, hit.relPath);
      let body = mem.body.trim();
      if (body.length > maxBodyChars) {
        body = `${body.slice(0, maxBodyChars)}…（已截断，完整见 read_memory）`;
      }
      blocks.push({
        term: hit.term,
        kind: hit.kind,
        path: mem.path,
        topic: mem.topic,
        body,
        staleWarning: mem.staleWarning,
        _confidence: mem.confidence,
        _updatedAt: mem.updated_at,
      });
    } catch {
      /* skip broken ref */
    }
  }

  blocks.sort((a, b) => {
    const ca = a._confidence === "verified" ? 1 : 0;
    const cb = b._confidence === "verified" ? 1 : 0;
    if (cb !== ca) return cb - ca;
    const da = a._updatedAt ?? "";
    const db = b._updatedAt ?? "";
    return db.localeCompare(da);
  });

  return {
    matchedTerms: matched.map((m) => m.term),
    blocks,
  };
}

export function formatMemoryContextForPrefix(
  ctx: ResolvedMemoryContext,
): string {
  if (ctx.blocks.length === 0) return "";
  const parts: string[] = [`matched: ${ctx.matchedTerms.join(", ")}`];
  for (const block of ctx.blocks) {
    parts.push(
      `[${block.term}] ${block.path} (${block.kind})`,
      `topic: ${block.topic}`,
    );
    if (block.staleWarning) parts.push(block.staleWarning);
    parts.push(block.body);
    parts.push("---");
  }
  return parts.join("\n").replace(/\n---$/, "");
}

export async function formatMemoryIndex(
  workspaceRoot: string,
): Promise<string> {
  const rows = await readIndexRows(workspaceRoot);
  if (rows.length === 0) {
    return "（INDEX 暂无登记黑话）";
  }
  return rows
    .map((r) => `${r.term} → ${r.relPath} (${r.kind})`)
    .join("\n");
}

import { readFile, writeFile } from "node:fs/promises";
import { indexFilePath } from "./paths.js";

export type MemoryKind = "glossary" | "history";

export interface IndexRow {
  term: string;
  relPath: string;
  kind: MemoryKind;
}

export const INDEX_ROW_MAX_CHARS = 120;

const INDEX_TEMPLATE = `# jargon 索引（仅词条 → 文件；正文禁止写在本文件）

| 黑话 | 文件 | 类型 |
|------|------|------|
`;

export function parseIndexTable(content: string): IndexRow[] {
  const rows: IndexRow[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (trimmed.includes("---") || trimmed.includes("黑话")) continue;
    const cols = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length !== 3) continue;
    const [term, relPath, kind] = cols;
    if (kind !== "glossary" && kind !== "history") continue;
    if (!term || !relPath) continue;
    rows.push({ term, relPath, kind });
  }
  return rows;
}

export function formatIndexTable(rows: IndexRow[]): string {
  const sorted = [...rows].sort((a, b) =>
    a.term.localeCompare(b.term, "zh-CN"),
  );
  const body = sorted
    .map((r) => `| ${r.term} | ${r.relPath} | ${r.kind} |`)
    .join("\n");
  return body ? `${INDEX_TEMPLATE}${body}\n` : INDEX_TEMPLATE;
}

export function formatIndexRow(row: IndexRow): string {
  return `| ${row.term} | ${row.relPath} | ${row.kind} |`;
}

export function validateIndexRow(row: IndexRow): void {
  const line = formatIndexRow(row);
  if (line.length > INDEX_ROW_MAX_CHARS) {
    throw new Error(
      `INDEX 行超过 ${INDEX_ROW_MAX_CHARS} 字符（${line.length}）：${row.term}`,
    );
  }
}

export function upsertIndexRows(
  existing: IndexRow[],
  updates: IndexRow[],
): IndexRow[] {
  const map = new Map<string, IndexRow>();
  for (const row of existing) {
    map.set(row.term, row);
  }
  for (const row of updates) {
    validateIndexRow(row);
    map.set(row.term, row);
  }
  return Array.from(map.values());
}

export async function readIndexRows(
  workspaceRoot: string,
): Promise<IndexRow[]> {
  try {
    const raw = await readFile(indexFilePath(workspaceRoot), "utf8");
    return parseIndexTable(raw);
  } catch {
    return [];
  }
}

export async function writeIndexRows(
  workspaceRoot: string,
  rows: IndexRow[],
): Promise<void> {
  await writeFile(
    indexFilePath(workspaceRoot),
    formatIndexTable(rows),
    "utf8",
  );
}

export async function syncIndexForTopic(input: {
  workspaceRoot: string;
  topic: string;
  aliases: string[];
  relPath: string;
  kind: MemoryKind;
}): Promise<string[]> {
  const terms = [
    input.topic.trim(),
    ...input.aliases.map((a) => a.trim()),
  ].filter(Boolean);
  const unique = [...new Set(terms)];
  const existing = await readIndexRows(input.workspaceRoot);
  const updates: IndexRow[] = unique.map((term) => ({
    term,
    relPath: input.relPath,
    kind: input.kind,
  }));
  const merged = upsertIndexRows(existing, updates);
  await writeIndexRows(input.workspaceRoot, merged);
  return unique.map((term) => formatIndexRow({ term, relPath: input.relPath, kind: input.kind }));
}

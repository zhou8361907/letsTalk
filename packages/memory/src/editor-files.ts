import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  CORE_CHAR_LIMIT,
  USER_CHAR_LIMIT,
} from "./core-store.js";
import { parseIndexTable } from "./index-table.js";
import { memoryDir, topicsDir } from "./paths.js";
import { validateSaveMemoryContent } from "./validate-save.js";

export type MemoryEditorGroup = "m0" | "m2" | "m1";

export interface MemoryEditorFileEntry {
  path: string;
  label: string;
  group: MemoryEditorGroup;
  description: string;
}

const MEMORY_PREFIX = ".agent/memory/";

const EDITABLE_ROOT_FILES: Array<{
  name: string;
  label: string;
  group: MemoryEditorGroup;
  description: string;
}> = [
  {
    name: "USER.md",
    label: "USER · 用户画像",
    group: "m0",
    description: "称呼、偏好（Tier 1 每会话注入）",
  },
  {
    name: "CORE.md",
    label: "CORE · 助手笔记",
    group: "m0",
    description: "惯例、踩坑（Tier 1 每会话注入）",
  },
  {
    name: "INDEX.md",
    label: "INDEX · jargon 索引",
    group: "m2",
    description: "词条 → topics，仅 jargon 锚词",
  },
];

export function assertEditableMemoryRelPath(
  workspaceRoot: string,
  relPath: string,
): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith(MEMORY_PREFIX)) {
    throw new Error("仅允许编辑 .agent/memory/ 下的文件");
  }
  if (normalized.includes("..")) {
    throw new Error("非法路径");
  }
  if (!normalized.endsWith(".md")) {
    throw new Error("仅支持 .md 文件");
  }
  if (normalized.endsWith("/README.md") || normalized === ".agent/memory/README.md") {
    throw new Error("README.md 不可通过编辑器修改");
  }

  const abs = resolve(workspaceRoot, normalized);
  const memRoot = resolve(memoryDir(workspaceRoot));
  if (abs !== memRoot && !abs.startsWith(`${memRoot}/`)) {
    throw new Error("路径超出 memory 目录");
  }
  return normalized;
}

export async function listMemoryEditorFiles(
  workspaceRoot: string,
): Promise<MemoryEditorFileEntry[]> {
  const entries: MemoryEditorFileEntry[] = [];

  for (const meta of EDITABLE_ROOT_FILES) {
    entries.push({
      path: `${MEMORY_PREFIX}${meta.name}`,
      label: meta.label,
      group: meta.group,
      description: meta.description,
    });
  }

  try {
    const names = await readdir(topicsDir(workspaceRoot));
    for (const name of names.sort()) {
      if (!name.endsWith(".md")) continue;
      const rel = `${MEMORY_PREFIX}topics/${name}`;
      const kind = name.startsWith("glossary-")
        ? "glossary"
        : name.startsWith("history-")
          ? "history"
          : "topic";
      entries.push({
        path: rel,
        label: `topic · ${name.replace(/\.md$/, "")}`,
        group: "m1",
        description: kind === "glossary" ? "jargon 主题" : "history / 其它主题",
      });
    }
  } catch {
    /* no topics */
  }

  return entries;
}

export interface ReadMemoryEditorFileResult {
  path: string;
  content: string;
  charCount: number;
  limit?: number;
}

export async function readMemoryEditorFile(
  workspaceRoot: string,
  relPath: string,
): Promise<ReadMemoryEditorFileResult> {
  const path = assertEditableMemoryRelPath(workspaceRoot, relPath);
  const abs = join(workspaceRoot, path);
  let content: string;
  try {
    content = await readFile(abs, "utf8");
  } catch {
    throw new Error(`文件不存在：${path}`);
  }

  const base = path.split("/").pop() ?? "";
  const limit =
    base === "USER.md"
      ? USER_CHAR_LIMIT
      : base === "CORE.md"
        ? CORE_CHAR_LIMIT
        : undefined;

  return {
    path,
    content,
    charCount: content.length,
    limit,
  };
}

export interface WriteMemoryEditorFileResult {
  path: string;
  charCount: number;
  limit?: number;
  warnings: string[];
}

export async function writeMemoryEditorFile(
  workspaceRoot: string,
  relPath: string,
  content: string,
): Promise<WriteMemoryEditorFileResult> {
  const path = assertEditableMemoryRelPath(workspaceRoot, relPath);
  const text = content.replace(/\r\n/g, "\n");
  const validation = validateSaveMemoryContent(text);
  if (validation.blocked) {
    throw new Error(validation.blocked);
  }

  const base = path.split("/").pop() ?? "";
  const limit =
    base === "USER.md"
      ? USER_CHAR_LIMIT
      : base === "CORE.md"
        ? CORE_CHAR_LIMIT
        : undefined;

  if (limit !== undefined && text.length > limit) {
    throw new Error(
      `${base} 超过 ${limit} 字符（当前 ${text.length}）。请删减后再保存。`,
    );
  }

  if (base === "INDEX.md") {
    parseIndexTable(text);
  }

  const abs = join(workspaceRoot, path);
  await writeFile(abs, text.endsWith("\n") ? text : `${text}\n`, "utf8");

  return {
    path,
    charCount: text.length,
    limit,
    warnings: validation.warnings,
  };
}

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MEMORY_GUIDANCE, MEMORY_REVIEW_PROMPT } from "./memory-guidance.js";
import { PM_PRD_RULES } from "./pm-prd.js";
import {
  SKILLS_GUIDANCE,
  SKILLS_REVIEW_PROMPT,
  SELF_IMPROVEMENT_REVIEW_PROMPT,
} from "./skills-guidance.js";

export const PROMPT_DIR_REL = ".agent/prompt";

/** 与 pm-resources.ts PM_RULES_MAX 保持一致 */
const PM_RULES_MAX = 2800;

const PROMPT_PREFIX = ".agent/prompt/";

export interface PromptEditorFileEntry {
  path: string;
  label: string;
  group: "prompt";
  description: string;
}

const EDITABLE_PROMPTS: Array<{
  name: string;
  label: string;
  description: string;
  defaultText: string;
  maxChars?: number;
}> = [
  {
    name: "memory-guidance.md",
    label: "记忆 · MEMORY_GUIDANCE",
    description: "跨会话记忆细则（system append，全模式）",
    defaultText: MEMORY_GUIDANCE,
  },
  {
    name: "pm-prd.md",
    label: "PM · PM_PRD_RULES",
    description: "写需求模式规则（chatMode=prd 时注入）",
    defaultText: PM_PRD_RULES,
    maxChars: PM_RULES_MAX,
  },
  {
    name: "memory-review.md",
    label: "回顾 · MEMORY_REVIEW",
    description: "后台记忆回顾子 Agent 专用 prompt",
    defaultText: MEMORY_REVIEW_PROMPT,
  },
  {
    name: "skills-guidance.md",
    label: "Skills · SKILLS_GUIDANCE",
    description: "Skills 细则（system append，skills 开启时）",
    defaultText: SKILLS_GUIDANCE,
  },
  {
    name: "skills-review.md",
    label: "回顾 · SKILLS_REVIEW",
    description: "后台 self-improvement review 中 Skills 段落",
    defaultText: SKILLS_REVIEW_PROMPT,
  },
  {
    name: "self-improvement-review.md",
    label: "回顾 · SELF_IMPROVEMENT",
    description: "后台 memory + skills 合并 review prompt",
    defaultText: SELF_IMPROVEMENT_REVIEW_PROMPT,
  },
];

function metaForName(name: string) {
  const meta = EDITABLE_PROMPTS.find((p) => p.name === name);
  if (!meta) {
    throw new Error(`不支持的 prompt 文件：${name}`);
  }
  return meta;
}

export function assertEditablePromptRelPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith(PROMPT_PREFIX)) {
    throw new Error("仅允许编辑 .agent/prompt/ 下的文件");
  }
  if (normalized.includes("..")) {
    throw new Error("非法路径");
  }
  if (!normalized.endsWith(".md")) {
    throw new Error("仅支持 .md 文件");
  }
  const name = normalized.slice(PROMPT_PREFIX.length);
  metaForName(name);
  return normalized;
}

export function listPromptEditorFiles(): PromptEditorFileEntry[] {
  return EDITABLE_PROMPTS.map((meta) => ({
    path: `${PROMPT_PREFIX}${meta.name}`,
    label: meta.label,
    group: "prompt" as const,
    description: meta.description,
  }));
}

async function readPromptFileOrDefault(
  workspaceRoot: string,
  name: string,
): Promise<{ text: string; fromDisk: boolean }> {
  const meta = metaForName(name);
  const abs = join(resolve(workspaceRoot), PROMPT_DIR_REL, name);
  try {
    await access(abs);
    const text = await readFile(abs, "utf8");
    if (text.trim()) {
      return { text, fromDisk: true };
    }
  } catch {
    /* use default */
  }
  return { text: meta.defaultText, fromDisk: false };
}

export async function resolveMemoryGuidance(
  workspaceRoot: string,
): Promise<string> {
  const { text } = await readPromptFileOrDefault(
    workspaceRoot,
    "memory-guidance.md",
  );
  return text;
}

export async function resolvePmPrdRules(workspaceRoot: string): Promise<string> {
  const { text } = await readPromptFileOrDefault(workspaceRoot, "pm-prd.md");
  return text;
}

export async function resolveMemoryReviewPrompt(
  workspaceRoot: string,
): Promise<string> {
  const { text } = await readPromptFileOrDefault(
    workspaceRoot,
    "memory-review.md",
  );
  return text;
}

export async function resolveSkillsGuidance(
  workspaceRoot: string,
): Promise<string> {
  const { text } = await readPromptFileOrDefault(
    workspaceRoot,
    "skills-guidance.md",
  );
  return text;
}

export async function resolveSelfImprovementReviewPrompt(
  workspaceRoot: string,
  skillsEnabled: boolean,
): Promise<string> {
  if (skillsEnabled) {
    const { text } = await readPromptFileOrDefault(
      workspaceRoot,
      "self-improvement-review.md",
    );
    return text;
  }
  return resolveMemoryReviewPrompt(workspaceRoot);
}

export interface ReadPromptEditorFileResult {
  path: string;
  content: string;
  charCount: number;
  limit?: number;
  fromDefault: boolean;
}

export async function readPromptEditorFile(
  workspaceRoot: string,
  relPath: string,
): Promise<ReadPromptEditorFileResult> {
  const path = assertEditablePromptRelPath(relPath);
  const name = path.slice(PROMPT_PREFIX.length);
  const meta = metaForName(name);
  const { text, fromDisk } = await readPromptFileOrDefault(workspaceRoot, name);
  return {
    path,
    content: text,
    charCount: text.length,
    limit: meta.maxChars,
    fromDefault: !fromDisk,
  };
}

export interface WritePromptEditorFileResult {
  path: string;
  charCount: number;
  limit?: number;
  warnings: string[];
}

export async function writePromptEditorFile(
  workspaceRoot: string,
  relPath: string,
  content: string,
): Promise<WritePromptEditorFileResult> {
  const path = assertEditablePromptRelPath(relPath);
  const name = path.slice(PROMPT_PREFIX.length);
  const meta = metaForName(name);
  const text = content.replace(/\r\n/g, "\n");
  const warnings: string[] = [];

  if (meta.maxChars !== undefined && text.length > meta.maxChars) {
    warnings.push(
      `超过建议上限 ${meta.maxChars} 字（当前 ${text.length}），运行时可能被截断`,
    );
  }

  const dir = join(resolve(workspaceRoot), PROMPT_DIR_REL);
  await mkdir(dir, { recursive: true });
  const abs = join(dir, name);
  await writeFile(abs, text.endsWith("\n") ? text : `${text}\n`, "utf8");

  return {
    path,
    charCount: text.length,
    limit: meta.maxChars,
    warnings,
  };
}

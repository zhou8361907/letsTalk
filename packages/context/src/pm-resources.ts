import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const PRD_TEMPLATE_REL = ".agent/templates/prd-template.md";
export const HINTS_DIR_REL = ".agent/hints";

const PRD_TEMPLATE_MAX = 3500;
export const PM_RULES_MAX = 2800;

export async function readPrdTemplateOutline(
  workspaceRoot: string,
): Promise<string> {
  const path = join(resolve(workspaceRoot), PRD_TEMPLATE_REL);
  try {
    await access(path);
  } catch {
    return "（未找到 prd-template.md，按常规 PRD 章节输出）";
  }
  const text = await readFile(path, "utf8");
  if (text.length <= PRD_TEMPLATE_MAX) return text;
  return `${text.slice(0, PRD_TEMPLATE_MAX)}\n…（模板已截断，完整见 ${PRD_TEMPLATE_REL}）`;
}

/** 列出 hints 下的 md 文件名（不含 README），供 Agent 自行 read */
export async function listBusinessHintFiles(
  workspaceRoot: string,
): Promise<string[]> {
  const dir = join(resolve(workspaceRoot), HINTS_DIR_REL);
  try {
    const names = await readdir(dir);
    return names
      .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
  } catch {
    return [];
  }
}

export function formatHintsDirectoryHint(files: string[]): string {
  if (files.length === 0) {
    return `${HINTS_DIR_REL}/ 暂无业务提示文件；可请管理员添加。`;
  }
  return [
    `业务提示位于 ${HINTS_DIR_REL}/（仅供参考，须与代码核对）。`,
    "可用 read 打开：",
    ...files.map((f) => `- ${HINTS_DIR_REL}/${f}`),
  ].join("\n");
}

export function trimPmRules(rules: string): string {
  if (rules.length <= PM_RULES_MAX) return rules;
  return `${rules.slice(0, PM_RULES_MAX)}\n…（已截断）`;
}

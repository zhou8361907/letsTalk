import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const PRD_TEMPLATE_REL = ".agent/templates/prd-template.md";
export const HINTS_DIR_REL = ".agent/hints";

const PRD_TEMPLATE_MAX = 3500;
const PM_RULES_MAX = 2000;

/** 写需求模式：每轮 JIT 注入的固定守则（不依赖外部文件） */
export const PM_MODE_RULES = `你正在协助产品经理撰写可交付研发的需求文档。

必须遵守：
1. 以 workFront / workBack 实际代码为准；用 grep、read、list_methods 等工具核实现状，禁止编造接口或字段。
2. 输出使用 Markdown，结构遵循 prd_template（见下方）；区分「现状 As-Is」「目标 To-Be」「待确认」。
3. 引用代码或页面时使用【相对运行根的路径】，例如【workFront/src/views/Detail.vue】。
4. 不确定的内容写「待确认」，并列入「开放问题」；不要假装已读代码。
5. 语气面向业务与研发可读：先结论，后细节；表格优先于长段落。
6. .agent/hints/ 仅为业务线索，使用前须与代码核对；冲突以代码为准。
7. 用户要求「整理成 PRD」「导出需求」时，给出一篇完整文档，而非仅聊天式回答。`;

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

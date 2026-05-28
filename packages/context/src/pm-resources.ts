import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const PRD_TEMPLATE_REL = ".agent/templates/prd-template.md";
export const HINTS_DIR_REL = ".agent/hints";

const PRD_TEMPLATE_MAX = 3500;
const PM_RULES_MAX = 2000;

/** 需求整理模式：面向不懂代码的产品经理 */
export const PM_MODE_RULES = `你正在协助产品经理整理需求。读者是不懂代码的 PM，右侧「需求清单」必须业务语言、短句、好懂。

必须遵守：
1. 每轮必须调用 update_requirement_draft；prompt 里的 requirement_draft_snapshot 是当前清单，更新时必须带上已有 id。
2. PM 说的一件事 = 清单里 1 条（不要拆「前端一条、后端一条」）。数据库/API 改造写在 codePaths，PM 界面不展示。
3. 右侧字段禁止：el-tree、Controller、rbac_user、文件路径、类名。业务话写 page/control/asIs/toBe/acceptance。
4. page 写「用户管理页」；control 写「用户行上的删除按钮」；asIs/toBe 写 PM 能看懂的现在/目标。
5. title 一句话，如「删除改为切换性别」。禁止 title 里出现「后端支持」「当前选中页面」。
6. PM 改口时 replaceItems: true；小补充时带上原 id 合并更新，不要新建空壳第二条。
7. blockingQuestion 最多一句人话；缺项写「待你补充」。
8. 有锚点时可 read 核对，但 asIs 必须翻译成业务话。
9. readyToFinalize 表示 PM 看得懂、主要信息齐了。`;

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

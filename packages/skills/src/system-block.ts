import { MAX_INDEX_CHARS, MAX_INDEX_SKILLS } from "./constants.js";
import type { SkillIndexEntry } from "./scan.js";

export function buildSkillsSystemBlock(skills: SkillIndexEntry[]): string {
  if (!skills.length) return "";

  const byCategory = new Map<string, SkillIndexEntry[]>();
  for (const skill of skills) {
    const cat = skill.category || "general";
    const list = byCategory.get(cat) ?? [];
    list.push(skill);
    byCategory.set(cat, list);
  }

  const lines: string[] = [];
  let count = 0;
  let truncated = false;

  for (const category of [...byCategory.keys()].sort()) {
    lines.push(`  ${category}:`);
    const catSkills = byCategory.get(category)!.sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const skill of catSkills) {
      if (count >= MAX_INDEX_SKILLS) {
        truncated = true;
        break;
      }
      const desc = skill.description?.trim();
      lines.push(desc ? `    - ${skill.name}: ${desc}` : `    - ${skill.name}`);
      count += 1;
    }
    if (truncated) break;
  }

  let block = ["<available_skills>", ...lines, "</available_skills>"].join("\n");
  if (truncated) {
    block += `\n（索引已截断至 ${MAX_INDEX_SKILLS} 条；完整列表用 skills_list）`;
  }
  if (block.length > MAX_INDEX_CHARS) {
    block = `${block.slice(0, MAX_INDEX_CHARS - 40)}…\n（用 skills_list 查看完整索引）`;
  }
  return block;
}

export const SKILLS_INDEX_HEADER = `## Skills（按需加载）

任务匹配任一 skill 时，**必须先** \`skill_view(name)\` 再执行。复杂任务完成后可用 \`skill_manage\` 保存流程；加载后发现过时立即 patch。`;

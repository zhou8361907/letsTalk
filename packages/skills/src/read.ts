import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ALLOWED_SUBDIRS } from "./constants.js";
import { parseSkillMarkdown } from "./frontmatter.js";
import { findSkillByName, listLinkedFiles } from "./scan.js";

export interface SkillViewResult {
  success: boolean;
  name?: string;
  content?: string;
  description?: string;
  linked_files?: string[];
  protected?: boolean;
  error?: string;
}

export async function readSkillContent(
  workspaceRoot: string,
  name: string,
  filePath?: string,
): Promise<SkillViewResult> {
  const skill = await findSkillByName(workspaceRoot, name);
  if (!skill) {
    return { success: false, error: `Skill '${name}' 未找到。用 skills_list 查看可用技能。` };
  }

  if (filePath?.trim()) {
    const normalized = filePath.trim().replace(/\\/g, "/");
    if (normalized.includes("..") || normalized.startsWith("/")) {
      return { success: false, error: "非法 file_path" };
    }
    const top = normalized.split("/")[0];
    if (!ALLOWED_SUBDIRS.has(top)) {
      return {
        success: false,
        error: `file_path 必须在 ${[...ALLOWED_SUBDIRS].join("、")} 下`,
      };
    }
    const target = join(skill.skillDir, normalized);
    const resolved = resolve(target);
    if (!resolved.startsWith(resolve(skill.skillDir))) {
      return { success: false, error: "非法 file_path" };
    }
    try {
      const content = await readFile(resolved, "utf-8");
      return {
        success: true,
        name: skill.name,
        content,
        protected: skill.protected,
      };
    } catch {
      const linked = await listLinkedFiles(skill.skillDir);
      return {
        success: false,
        error: `文件 '${normalized}' 不存在`,
        linked_files: linked.length ? linked : undefined,
      };
    }
  }

  const raw = await readFile(skill.skillMdPath, "utf-8");
  const { frontmatter } = parseSkillMarkdown(raw);
  const linked = await listLinkedFiles(skill.skillDir);
  return {
    success: true,
    name: skill.name,
    content: raw,
    description: frontmatter.description,
    linked_files: linked.length ? linked : undefined,
    protected: skill.protected,
  };
}

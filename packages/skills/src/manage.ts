import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  ALLOWED_SUBDIRS,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SKILL_CONTENT_CHARS,
  MAX_SKILL_FILE_BYTES,
  VALID_NAME_RE,
} from "./constants.js";
import {
  isSkillProtected,
  parseSkillMarkdown,
  scanInjectionRisk,
} from "./frontmatter.js";
import { invalidateSkillsIndexCache } from "./index-cache.js";
import { joinSkillPath, resolveSkillsDir } from "./paths.js";
import { findSkillByName } from "./scan.js";

export type SkillManageAction =
  | "create"
  | "edit"
  | "patch"
  | "delete"
  | "write_file"
  | "remove_file";

export interface SkillManageParams {
  action: SkillManageAction;
  name: string;
  content?: string;
  category?: string;
  file_path?: string;
  file_content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
}

export interface SkillManageResult {
  success: boolean;
  message?: string;
  error?: string;
  path?: string;
  available_files?: string[];
}

function validateName(name: string): string | null {
  if (!name.trim()) return "Skill name 必填";
  if (name.length > MAX_NAME_LENGTH) {
    return `Skill name 超过 ${MAX_NAME_LENGTH} 字符`;
  }
  if (!VALID_NAME_RE.test(name)) {
    return `非法 skill name '${name}'：小写字母、数字、连字符、点、下划线，且以字母或数字开头`;
  }
  return null;
}

function validateCategory(category?: string): string | null {
  if (!category?.trim()) return null;
  if (!VALID_NAME_RE.test(category.trim())) {
    return `非法 category '${category}'`;
  }
  return null;
}

function validateContentSize(content: string, label = "content"): string | null {
  if (content.length > MAX_SKILL_CONTENT_CHARS) {
    return `${label} 超过 ${MAX_SKILL_CONTENT_CHARS} 字符上限`;
  }
  const risk = scanInjectionRisk(content);
  if (risk) return risk;
  return null;
}

async function atomicWriteText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

function resolveSkillTarget(skillDir: string, filePath: string): string {
  const normalized = filePath.trim().replace(/\\/g, "/");
  if (normalized === "SKILL.md") return join(skillDir, "SKILL.md");
  const top = normalized.split("/")[0];
  if (!ALLOWED_SUBDIRS.has(top)) {
    throw new Error(
      `file_path 必须在 SKILL.md 或 ${[...ALLOWED_SUBDIRS].join("、")} 下`,
    );
  }
  const target = resolve(join(skillDir, normalized));
  if (!target.startsWith(resolve(skillDir))) {
    throw new Error("非法 file_path");
  }
  return target;
}

function assertNotProtected(
  protectedSkill: boolean,
  action: string,
): SkillManageResult | null {
  if (!protectedSkill) return null;
  return {
    success: false,
    error: `bundled skill 受保护，不可 ${action}。请 skill_manage(create) 新建用户 skill。`,
  };
}

export async function manageSkill(
  workspaceRoot: string,
  params: SkillManageParams,
): Promise<SkillManageResult> {
  const nameErr = validateName(params.name);
  if (nameErr) return { success: false, error: nameErr };
  const catErr = validateCategory(params.category);
  if (catErr) return { success: false, error: catErr };

  let result: SkillManageResult;
  switch (params.action) {
    case "create":
      result = await createSkill(workspaceRoot, params);
      break;
    case "edit":
      result = await editSkill(workspaceRoot, params);
      break;
    case "patch":
      result = await patchSkill(workspaceRoot, params);
      break;
    case "delete":
      result = await deleteSkill(workspaceRoot, params.name);
      break;
    case "write_file":
      result = await writeSkillFile(workspaceRoot, params);
      break;
    case "remove_file":
      result = await removeSkillFile(workspaceRoot, params);
      break;
    default:
      return {
        success: false,
        error: `未知 action '${params.action as string}'`,
      };
  }

  if (result.success) {
    invalidateSkillsIndexCache(workspaceRoot);
  }
  return result;
}

async function createSkill(
  workspaceRoot: string,
  params: SkillManageParams,
): Promise<SkillManageResult> {
  if (!params.content?.trim()) {
    return { success: false, error: "create 需要 content（完整 SKILL.md）" };
  }
  const sizeErr = validateContentSize(params.content);
  if (sizeErr) return { success: false, error: sizeErr };

  const existing = await findSkillByName(workspaceRoot, params.name);
  if (existing) {
    return {
      success: false,
      error: `Skill '${params.name}' 已存在。用 patch 或 edit 更新。`,
    };
  }

  const category = params.category?.trim() || "user";
  const skillDir = joinSkillPath(workspaceRoot, category, params.name);
  const skillMd = join(skillDir, "SKILL.md");
  await atomicWriteText(skillMd, params.content);
  return {
    success: true,
    message: `已创建 skill '${params.name}'`,
    path: skillMd,
  };
}

async function editSkill(
  workspaceRoot: string,
  params: SkillManageParams,
): Promise<SkillManageResult> {
  if (!params.content?.trim()) {
    return { success: false, error: "edit 需要 content（完整 SKILL.md）" };
  }
  const sizeErr = validateContentSize(params.content);
  if (sizeErr) return { success: false, error: sizeErr };

  const skill = await findSkillByName(workspaceRoot, params.name);
  if (!skill) {
    return { success: false, error: `Skill '${params.name}' 未找到` };
  }
  const blocked = assertNotProtected(skill.protected, "edit");
  if (blocked) return blocked;

  await atomicWriteText(skill.skillMdPath, params.content);
  return {
    success: true,
    message: `已更新 skill '${params.name}'`,
    path: skill.skillMdPath,
  };
}

async function patchSkill(
  workspaceRoot: string,
  params: SkillManageParams,
): Promise<SkillManageResult> {
  if (!params.old_string) {
    return { success: false, error: "patch 需要 old_string" };
  }
  if (params.new_string === undefined) {
    return { success: false, error: "patch 需要 new_string（可为空字符串表示删除）" };
  }

  const skill = await findSkillByName(workspaceRoot, params.name);
  if (!skill) {
    return { success: false, error: `Skill '${params.name}' 未找到` };
  }
  const blocked = assertNotProtected(skill.protected, "patch");
  if (blocked) return blocked;

  const relPath = params.file_path?.trim() || "SKILL.md";
  let target: string;
  try {
    target = resolveSkillTarget(skill.skillDir, relPath);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let original: string;
  try {
    original = await readFile(target, "utf-8");
  } catch {
    return { success: false, error: `文件 '${relPath}' 不存在` };
  }

  if (!original.includes(params.old_string)) {
    return {
      success: false,
      error: "old_string 未在目标文件中找到",
    };
  }

  const next = params.replace_all
    ? original.split(params.old_string).join(params.new_string)
    : original.replace(params.old_string, params.new_string);

  const sizeErr = validateContentSize(next, relPath);
  if (sizeErr) return { success: false, error: sizeErr };

  await atomicWriteText(target, next);
  return {
    success: true,
    message: `已 patch skill '${params.name}' 的 ${relPath}`,
    path: target,
  };
}

async function deleteSkill(
  workspaceRoot: string,
  name: string,
): Promise<SkillManageResult> {
  const skill = await findSkillByName(workspaceRoot, name);
  if (!skill) {
    return { success: false, error: `Skill '${name}' 未找到` };
  }
  const blocked = assertNotProtected(skill.protected, "delete");
  if (blocked) return blocked;

  await rm(skill.skillDir, { recursive: true, force: true });
  return {
    success: true,
    message: `已删除 skill '${name}'`,
  };
}

async function writeSkillFile(
  workspaceRoot: string,
  params: SkillManageParams,
): Promise<SkillManageResult> {
  if (!params.file_path?.trim()) {
    return { success: false, error: "write_file 需要 file_path" };
  }
  if (params.file_content === undefined) {
    return { success: false, error: "write_file 需要 file_content" };
  }
  if (Buffer.byteLength(params.file_content, "utf-8") > MAX_SKILL_FILE_BYTES) {
    return {
      success: false,
      error: `file_content 超过 ${MAX_SKILL_FILE_BYTES} 字节`,
    };
  }

  const skill = await findSkillByName(workspaceRoot, params.name);
  if (!skill) {
    return {
      success: false,
      error: `Skill '${params.name}' 未找到。先用 create 创建。`,
    };
  }
  const blocked = assertNotProtected(skill.protected, "write_file");
  if (blocked) return blocked;

  let target: string;
  try {
    target = resolveSkillTarget(skill.skillDir, params.file_path);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const risk = scanInjectionRisk(params.file_content);
  if (risk) return { success: false, error: risk };

  await atomicWriteText(target, params.file_content);
  return {
    success: true,
    message: `已写入 ${params.file_path} 到 skill '${params.name}'`,
    path: target,
  };
}

async function removeSkillFile(
  workspaceRoot: string,
  params: SkillManageParams,
): Promise<SkillManageResult> {
  if (!params.file_path?.trim()) {
    return { success: false, error: "remove_file 需要 file_path" };
  }
  if (params.file_path.trim() === "SKILL.md") {
    return { success: false, error: "不可 remove_file SKILL.md，请用 delete" };
  }

  const skill = await findSkillByName(workspaceRoot, params.name);
  if (!skill) {
    return { success: false, error: `Skill '${params.name}' 未找到` };
  }
  const blocked = assertNotProtected(skill.protected, "remove_file");
  if (blocked) return blocked;

  let target: string;
  try {
    target = resolveSkillTarget(skill.skillDir, params.file_path);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    await rm(target, { force: true });
  } catch {
    return { success: false, error: `文件 '${params.file_path}' 不存在` };
  }

  return {
    success: true,
    message: `已从 skill '${params.name}' 删除 ${params.file_path}`,
  };
}

export function validateSkillFrontmatter(content: string): string | null {
  const { frontmatter } = parseSkillMarkdown(content);
  if (!frontmatter.name?.trim() && !content.includes("name:")) {
    return "SKILL.md frontmatter 建议包含 name";
  }
  const desc = frontmatter.description?.trim();
  if (desc && desc.length > MAX_DESCRIPTION_LENGTH) {
    return `description 超过 ${MAX_DESCRIPTION_LENGTH} 字符`;
  }
  return null;
}

export async function ensureSkillsDir(workspaceRoot: string): Promise<void> {
  await mkdir(resolveSkillsDir(workspaceRoot), { recursive: true });
}

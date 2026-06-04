import { join, resolve } from "node:path";
import { SKILLS_DIR_REL } from "./constants.js";

export function resolveSkillsDir(workspaceRoot: string): string {
  return resolve(workspaceRoot, SKILLS_DIR_REL);
}

export function resolveBundledSkillsDir(workspaceRoot: string): string {
  return resolve(workspaceRoot, "packages/skills-bundled");
}

export function skillRelFromDir(skillsRoot: string, skillDir: string): string {
  return skillDir
    .slice(skillsRoot.length + 1)
    .replace(/\\/g, "/");
}

export function joinSkillPath(workspaceRoot: string, ...parts: string[]): string {
  return join(resolveSkillsDir(workspaceRoot), ...parts);
}

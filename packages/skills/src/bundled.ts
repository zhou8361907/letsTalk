import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveBundledSkillsDir, resolveSkillsDir } from "./paths.js";
import { scanSkillIndex } from "./scan.js";

async function walkSkillMd(dir: string, acc: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSkillMd(full, acc);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      acc.push(full);
    }
  }
  return acc;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await cp(srcPath, destPath);
    }
  }
}

/** 若 .agent/skills 为空，从 packages/skills-bundled 复制种子 skills */
export async function installBundledSkillsIfEmpty(
  workspaceRoot: string,
): Promise<{ installed: boolean; count: number }> {
  const skillsRoot = resolveSkillsDir(workspaceRoot);
  await mkdir(skillsRoot, { recursive: true });

  const existing = await scanSkillIndex(workspaceRoot);
  if (existing.length > 0) {
    return { installed: false, count: 0 };
  }

  const bundledRoot = resolveBundledSkillsDir(workspaceRoot);
  try {
    await stat(bundledRoot);
  } catch {
    return { installed: false, count: 0 };
  }

  const bundledFiles = await walkSkillMd(bundledRoot);
  if (!bundledFiles.length) {
    return { installed: false, count: 0 };
  }

  await copyDir(bundledRoot, skillsRoot);
  return { installed: true, count: bundledFiles.length };
}

export async function ensureSkillsReady(workspaceRoot: string): Promise<void> {
  await installBundledSkillsIfEmpty(workspaceRoot);
}

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  EXCLUDED_SKILL_DIRS,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
} from "./constants.js";
import {
  getSkillSource,
  isSkillProtected,
  parseSkillMarkdown,
  type SkillFrontmatter,
} from "./frontmatter.js";
import { resolveSkillsDir, skillRelFromDir } from "./paths.js";

export interface SkillIndexEntry {
  name: string;
  description: string;
  category: string;
  skillDirRel: string;
  source?: string;
  protected: boolean;
}

async function walkSkillFiles(
  dir: string,
  files: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (EXCLUDED_SKILL_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkSkillFiles(full, files);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      files.push(full);
    }
  }
  return files;
}

function categoryFromSkillPath(skillsRoot: string, skillMdPath: string): string {
  const rel = skillRelFromDir(skillsRoot, skillMdPath);
  const parts = rel.split("/");
  parts.pop(); // SKILL.md
  if (parts.length <= 1) return "general";
  parts.pop(); // skill dir name
  return parts.join("/") || "general";
}

function extractDescription(frontmatter: SkillFrontmatter, body: string): string {
  const fromFm = frontmatter.description?.trim();
  if (fromFm) {
    return fromFm.length > MAX_DESCRIPTION_LENGTH
      ? `${fromFm.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`
      : fromFm;
  }
  for (const line of body.trim().split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      return t.length > MAX_DESCRIPTION_LENGTH
        ? `${t.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`
        : t;
    }
  }
  return "";
}

export async function scanSkillIndex(
  workspaceRoot: string,
): Promise<SkillIndexEntry[]> {
  const skillsRoot = resolveSkillsDir(workspaceRoot);
  const skillFiles = await walkSkillFiles(skillsRoot);
  const skills: SkillIndexEntry[] = [];
  const seen = new Set<string>();

  for (const skillMd of skillFiles) {
    try {
      const raw = await readFile(skillMd, "utf-8");
      const snippet = raw.slice(0, 4000);
      const { frontmatter, body } = parseSkillMarkdown(snippet);
      const skillDir = skillMd.slice(0, skillMd.length - "/SKILL.md".length);
      const dirName = skillDir.split(/[/\\]/).pop() ?? "skill";
      const name = (frontmatter.name ?? dirName).slice(0, MAX_NAME_LENGTH);
      if (seen.has(name)) continue;
      seen.add(name);

      const category = categoryFromSkillPath(skillsRoot, skillMd);
      const source = getSkillSource(frontmatter);
      skills.push({
        name,
        description: extractDescription(frontmatter, body),
        category,
        skillDirRel: skillRelFromDir(skillsRoot, skillDir),
        source,
        protected: isSkillProtected(frontmatter),
      });
    } catch {
      continue;
    }
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export interface SkillLocation {
  name: string;
  skillDir: string;
  skillMdPath: string;
  frontmatter: SkillFrontmatter;
  protected: boolean;
}

export async function findSkillByName(
  workspaceRoot: string,
  name: string,
): Promise<SkillLocation | null> {
  const skillsRoot = resolveSkillsDir(workspaceRoot);
  const skillFiles = await walkSkillFiles(skillsRoot);
  const normalized = name.trim().replace(/\\/g, "/");

  for (const skillMd of skillFiles) {
    const raw = await readFile(skillMd, "utf-8");
    const { frontmatter } = parseSkillMarkdown(raw);
    const skillDir = skillMd.slice(0, skillMd.length - "/SKILL.md".length);
    const dirName = skillDir.split(/[/\\]/).pop() ?? "";
    const rel = skillRelFromDir(skillsRoot, skillDir);
    const fmName = frontmatter.name ?? dirName;

    if (
      fmName === normalized ||
      dirName === normalized ||
      rel === normalized ||
      rel.endsWith(`/${normalized}`)
    ) {
      return {
        name: fmName,
        skillDir,
        skillMdPath: skillMd,
        frontmatter,
        protected: isSkillProtected(frontmatter),
      };
    }
  }
  return null;
}

export async function listLinkedFiles(skillDir: string): Promise<string[]> {
  const linked: string[] = [];
  for (const sub of ["references", "templates", "scripts", "assets"]) {
    const subDir = join(skillDir, sub);
    try {
      const files = await walkAllFiles(subDir);
      for (const f of files) {
        linked.push(f.slice(skillDir.length + 1).replace(/\\/g, "/"));
      }
    } catch {
      // skip
    }
  }
  return linked.sort();
}

async function walkAllFiles(dir: string, acc: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAllFiles(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

export async function skillsDirManifest(
  workspaceRoot: string,
): Promise<Record<string, number>> {
  const skillsRoot = resolveSkillsDir(workspaceRoot);
  const manifest: Record<string, number> = {};
  const skillFiles = await walkSkillFiles(skillsRoot);
  for (const f of skillFiles) {
    try {
      const st = await stat(f);
      manifest[f] = st.mtimeMs;
    } catch {
      // skip
    }
  }
  return manifest;
}

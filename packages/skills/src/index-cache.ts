import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { SKILLS_INDEX_CACHE_REL } from "./constants.js";
import { scanSkillIndex, skillsDirManifest, type SkillIndexEntry } from "./scan.js";

interface SkillsIndexCache {
  manifest: Record<string, number>;
  skills: SkillIndexEntry[];
  builtAt: string;
}

const memoryCache = new Map<string, SkillIndexEntry[]>();

export function invalidateSkillsIndexCache(workspaceRoot: string): void {
  memoryCache.delete(resolve(workspaceRoot));
}

export async function getSkillIndex(
  workspaceRoot: string,
  options?: { force?: boolean },
): Promise<SkillIndexEntry[]> {
  const root = resolve(workspaceRoot);
  if (!options?.force && memoryCache.has(root)) {
    return memoryCache.get(root)!;
  }

  const cachePath = join(root, SKILLS_INDEX_CACHE_REL);
  const manifest = await skillsDirManifest(root);

  if (!options?.force) {
    try {
      const raw = await readFile(cachePath, "utf-8");
      const cached = JSON.parse(raw) as SkillsIndexCache;
      if (
        cached.manifest &&
        manifestMatches(cached.manifest, manifest) &&
        Array.isArray(cached.skills)
      ) {
        memoryCache.set(root, cached.skills);
        return cached.skills;
      }
    } catch {
      // cold scan
    }
  }

  const skills = await scanSkillIndex(root);
  memoryCache.set(root, skills);

  try {
    await mkdir(dirname(cachePath), { recursive: true });
    const payload: SkillsIndexCache = {
      manifest,
      skills,
      builtAt: new Date().toISOString(),
    };
    await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  } catch {
    // cache write optional
  }

  return skills;
}

function manifestMatches(
  cached: Record<string, number>,
  current: Record<string, number>,
): boolean {
  const cachedKeys = Object.keys(cached);
  const currentKeys = Object.keys(current);
  if (cachedKeys.length !== currentKeys.length) return false;
  for (const key of currentKeys) {
    if (cached[key] !== current[key]) return false;
  }
  return true;
}

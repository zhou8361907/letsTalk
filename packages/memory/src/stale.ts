import { stat } from "node:fs/promises";
import { resolve } from "node:path";

/** sources 中文件 mtime 晚于记忆文件 → 可能过期 */
export async function findStaleSources(
  workspaceRoot: string,
  sources: string[],
  memoryMtimeMs: number,
): Promise<string[]> {
  const root = resolve(workspaceRoot);
  const stale: string[] = [];

  for (const ref of sources) {
    const abs = resolve(root, ref.replace(/^\/+/, ""));
    if (!abs.startsWith(root)) continue;
    try {
      const s = await stat(abs);
      if (s.mtimeMs > memoryMtimeMs) {
        stale.push(ref);
      }
    } catch {
      stale.push(ref);
    }
  }

  return stale;
}

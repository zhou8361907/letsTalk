import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { AgentAnchor } from "@lets-talk/shared-types";

/** 列出可作为锚点的 .vue（默认扫前端目录下的 src/views） */
export async function listVueAnchors(
  workspaceRoot: string,
  options?: { scanRoot?: string; globPrefix?: string },
): Promise<AgentAnchor[]> {
  const prefix = options?.globPrefix ?? "src/views";
  const scanBase = resolve(options?.scanRoot ?? workspaceRoot);
  const startDir = resolve(scanBase, prefix);
  const root = resolve(workspaceRoot);
  const out: AgentAnchor[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!ent.name.endsWith(".vue")) continue;
      const ref = relative(root, abs).replace(/\\/g, "/");
      out.push({
        kind: "vue",
        ref,
        label: ent.name.replace(/\.vue$/, ""),
      });
    }
  }

  await walk(startDir);
  out.sort((a, b) => a.ref.localeCompare(b.ref));
  return out;
}

/** 校验锚点文件存在 */
export async function anchorExists(
  workspaceRoot: string,
  ref: string,
): Promise<boolean> {
  const abs = resolve(workspaceRoot, ref);
  const root = resolve(workspaceRoot);
  if (!abs.startsWith(root)) return false;
  try {
    const s = await stat(abs);
    return s.isFile();
  } catch {
    return false;
  }
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** 读取锚点文件前 N 行，供 JIT 破冰（不读整文件） */
export async function readAnchorPreview(
  workspaceRoot: string,
  ref: string,
  maxLines = 150,
): Promise<string> {
  const abs = resolve(workspaceRoot, ref);
  const root = resolve(workspaceRoot);
  if (!abs.startsWith(root)) {
    throw new Error("锚点路径必须在工作区内");
  }

  const raw = await readFile(abs, "utf8");
  const maxCol = 500;
  return raw
    .split(/\r?\n/)
    .slice(0, maxLines)
    .map((line) => (line.length > maxCol ? `${line.slice(0, maxCol)}…` : line))
    .join("\n");
}
